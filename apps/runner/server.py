"""
ARC LABS code runner — compiles and runs students' C and Python programs for exams.

  GET  /health  -> {"ok": true, "sandbox": "seccomp+landlock", ...}   (no auth; wakes the Space)
  POST /run     -> {"results": [{"status", "stdout", "error", "timeMs"}, ...]}
       headers: Authorization: Bearer <RUNNER_TOKEN>
       body:    {"language": "c" | "python", "code": "...", "inputs": ["...", ...], "timeLimitMs": 2000}

One request = one program + many inputs (test cases). C is compiled once; a compile error is
returned for every input. Each run happens inside `jail` (CPU / memory / output limits, no
network, no new processes) in a throw-away directory. Nothing is stored.
"""

import ctypes
import hmac
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.0.0"
TOKEN = os.environ.get("RUNNER_TOKEN", "")
PORT = int(os.environ.get("PORT", "7860"))
JAIL = os.environ.get("JAIL_BIN", "/usr/local/bin/jail")


def cpu_share() -> float:
    """CPUs this container may really use (cgroup quota), e.g. 0.1 on Render's free plan."""
    if os.environ.get("RUNNER_CPUS"):
        return float(os.environ["RUNNER_CPUS"])
    try:
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()
        if quota != "max":
            return max(0.05, int(quota) / int(period))
    except Exception:
        pass
    try:
        q = int(open("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read())
        p = int(open("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read())
        if q > 0:
            return max(0.05, q / p)
    except Exception:
        pass
    return float(len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else os.cpu_count() or 1)


CPUS = cpu_share()
PARALLEL = int(os.environ.get("RUNNER_PARALLEL", str(max(2, min(8, round(CPUS))))))
# On a fraction of a CPU, programs get their CPU time slowly: stretch wall-clock timeouts to match.
# Time limits themselves are measured in CPU time, so students are judged fairly either way.
SLOWDOWN = max(1.0, 1.0 / min(CPUS, 1.0))
MAX_BODY = 512 * 1024
MAX_INPUTS = 50
MAX_OUTPUT = 64 * 1024

slots = threading.BoundedSemaphore(PARALLEL)
pool = ThreadPoolExecutor(max_workers=PARALLEL * 4)
busy = 0
busy_lock = threading.Lock()


def hide_environment():
    """Make /proc/<pid>/environ of this process unreadable to the programs it runs (same user)."""
    try:
        ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 4
    except Exception:
        pass


def clip(s: str) -> str:
    return s if len(s) <= MAX_OUTPUT else s[:MAX_OUTPUT] + "\n…(output truncated)"


WORK_PATH = re.compile(r"/tmp/(?:run|probe)-[A-Za-z0-9_]+/(?:t\d+/)?")


def read(path: str) -> str:
    try:
        with open(path, "rb") as f:
            return WORK_PATH.sub("", f.read(MAX_OUTPUT * 2).decode("utf-8", "replace"))
    except OSError:
        return ""


def jailed(mode, cpu_s, mem_mb, file_kb, argv, cwd, stdin_path, wall_s):
    """Runs argv inside the jail. Returns (exit_status, cpu_seconds, timed_out, stdout, stderr)."""
    out_p, err_p = os.path.join(cwd, ".out"), os.path.join(cwd, ".err")
    with open(stdin_path, "rb") as fin, open(out_p, "wb") as fout, open(err_p, "wb") as ferr:
        p = subprocess.Popen(
            [JAIL, mode, str(cpu_s), str(mem_mb), str(file_kb), "--", *argv],
            cwd=cwd, stdin=fin, stdout=fout, stderr=ferr, close_fds=True,
        )
    timed_out = threading.Event()

    def kill():
        timed_out.set()
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except OSError:
            pass

    timer = threading.Timer(wall_s, kill)
    timer.start()
    try:
        _, status, usage = os.wait4(p.pid, 0)
    finally:
        timer.cancel()
    p.returncode = 0  # reaped above; stop Popen from waiting again
    try:
        os.killpg(p.pid, signal.SIGKILL)  # anything left in the group
    except OSError:
        pass
    cpu = usage.ru_utime + usage.ru_stime
    return status, cpu, timed_out.is_set(), read(out_p), read(err_p)


def classify(status, cpu, timed_out, stdout, stderr, limit_s):
    ms = round(cpu * 1000)
    if timed_out or cpu >= limit_s or (os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGXCPU):
        return {"status": "TIME_LIMIT", "stdout": clip(stdout), "error": None, "timeMs": ms}
    if os.WIFSIGNALED(status):
        sig = os.WTERMSIG(status)
        why = {
            signal.SIGSEGV: "Segmentation fault (invalid memory access)",
            signal.SIGFPE: "Arithmetic error (e.g. division by zero)",
            signal.SIGABRT: "Program aborted",
            signal.SIGXFSZ: "Output limit exceeded",
            signal.SIGKILL: "Killed (memory limit exceeded?)",
        }.get(sig, f"Killed by signal {sig}")
        return {"status": "RUNTIME_ERROR", "stdout": clip(stdout), "error": clip((stderr + "\n" + why).strip()), "timeMs": ms}
    code = os.WEXITSTATUS(status)
    if code == 125 and not stdout:
        return {"status": "INTERNAL_ERROR", "stdout": "", "error": "Sandbox failed to start", "timeMs": None}
    if code != 0:
        return {"status": "RUNTIME_ERROR", "stdout": clip(stdout), "error": clip(stderr.strip() or f"Exited with code {code}"), "timeMs": ms}
    return {"status": "OK", "stdout": clip(stdout), "error": None, "timeMs": ms}


# ───────── Arduino sketches (virtual board, see arduino/) ─────────

ARDUINO_DIR = os.environ.get("ARDUINO_DIR", "/usr/local/share/arduino-sim")
_NOT_FUNCS = {"if", "for", "while", "switch", "return", "else", "do", "sizeof", "catch", "main"}
_FUNC = re.compile(
    r"^[ \t]*((?:(?:static|inline|unsigned|signed|const|volatile|long|short|struct)\s+)*"
    r"[A-Za-z_]\w*(?:\s*<[^;{}()]*>)?[\s*&]+)([A-Za-z_]\w*)\s*\(([^;{}()]*)\)\s*(?:const\s*)?\{",
    re.M,
)


def _blank_comments_and_strings(src: str) -> str:
    """Same length as src, with comments / string and char literals replaced by spaces."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j])); i = j
        elif c in "\"'":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            j = min(j + 1, n)
            out.append(" " * (j - i)); i = j
        else:
            out.append(c); i += 1
    return "".join(out)


def arduino_source(code: str) -> str:
    """Does what the Arduino IDE does: declares every function up front so order doesn't matter."""
    clean = _blank_comments_and_strings(code)
    protos, first = [], None
    for m in _FUNC.finditer(clean):
        ret, name, args = m.group(1).strip(), m.group(2), m.group(3)
        if name in _NOT_FUNCS or ret.split()[-1] in _NOT_FUNCS:
            continue
        before = clean[: m.start()]
        if before.count("{") != before.count("}"):  # inside a class/struct: a method, skip
            continue
        args = re.sub(r"=[^,]*", "", args)  # default values belong on one declaration only
        protos.append(f"{ret} {name}({args.strip()});")
        first = m.start() if first is None else first
    if not protos:
        return f'#line 1 "sketch.ino"\n{code}'
    line = code.count("\n", 0, first) + 1
    return (
        f'#line 1 "sketch.ino"\n{code[:first]}'
        + "\n".join(protos)
        + f'\n#line {line} "sketch.ino"\n{code[first:]}'
    )


def run_batch(language, code, inputs, time_limit_ms):
    limit_s = max(0.5, min(10.0, time_limit_ms / 1000))
    cpu_s = int(limit_s) + 1
    work = tempfile.mkdtemp(prefix="run-")
    try:
        os.chmod(work, 0o700)
        empty = os.path.join(work, ".empty")
        open(empty, "wb").close()
        if language == "c":
            with open(os.path.join(work, "main.c"), "w", encoding="utf-8") as f:
                f.write(code)
            with slots:
                st, _, to, _, err = jailed(
                    "compile", 20, 1024, 64 * 1024,
                    ["gcc", "-O2", "-std=gnu11", "-o", "main", "main.c", "-lm"], work, empty,
                    30 * SLOWDOWN,
                )
            if to or not os.WIFEXITED(st) or os.WEXITSTATUS(st) != 0:
                msg = clip(err.replace(work + "/", "").strip() or "Compilation failed")
                return [{"status": "COMPILE_ERROR", "stdout": "", "error": msg, "timeMs": None}] * len(inputs)
            argv = ["./main"]
            mem = 256
        elif language == "arduino":
            with open(os.path.join(work, "sketch.cpp"), "w", encoding="utf-8") as f:
                f.write(arduino_source(code))
            with slots:
                st, _, to, _, err = jailed(
                    "compile", 20, 1024, 64 * 1024,
                    ["g++", "-std=gnu++17", "-O1", "-w", f"-I{ARDUINO_DIR}/include", "-include", "Arduino.h",
                     "-o", "main", "sketch.cpp", f"{ARDUINO_DIR}/libarduinosim.a", "-lm"],
                    work, empty, 40 * SLOWDOWN,
                )
            if to or not os.WIFEXITED(st) or os.WEXITSTATUS(st) != 0:
                msg = err.replace(work + "/", "").replace(ARDUINO_DIR + "/include/", "").strip()
                if "undefined reference to `setup()'" in msg or "undefined reference to `loop()'" in msg:
                    msg = "Your sketch needs both void setup() and void loop()."
                return [{"status": "COMPILE_ERROR", "stdout": "", "error": clip(msg or "Compilation failed"), "timeMs": None}] * len(inputs)
            argv = ["./main"]
            mem = 256
        else:
            with open(os.path.join(work, "main.py"), "w", encoding="utf-8") as f:
                f.write(code)
            with slots:
                st, _, to, _, err = jailed(
                    "run", 10, 512, 1024,
                    ["python3", "-I", "-B", "-c",
                     "import sys; compile(open('main.py', encoding='utf-8').read(), 'main.py', 'exec')"],
                    work, empty, 15 * SLOWDOWN,
                )
            if to or not os.WIFEXITED(st) or os.WEXITSTATUS(st) != 0:
                lines = [l for l in err.strip().splitlines() if not l.startswith("Traceback") and "<string>" not in l]
                return [{"status": "COMPILE_ERROR", "stdout": "", "error": clip("\n".join(lines) or err), "timeMs": None}] * len(inputs)
            argv = ["python3", "-I", "-B", "main.py"]
            mem = 512

        def one(i, stdin):
            d = os.path.join(work, f"t{i}")
            os.mkdir(d, 0o700)
            for name in ("main", "main.py"):
                src = os.path.join(work, name)
                if os.path.exists(src):
                    shutil.copy2(src, d)
            inp = os.path.join(d, ".in")
            with open(inp, "w", encoding="utf-8") as f:
                f.write(stdin)
            with slots:
                # Wall clock: stretched on slow hosts, but capped so a sleeping program can't hold a slot.
                wall = min((limit_s * 2 + 1) * SLOWDOWN, max(limit_s * 2 + 1, 20))
                res = jailed("run", cpu_s, mem, 1024, argv, d, inp, wall)
            return classify(*res, limit_s)

        futures = [pool.submit(one, i, s) for i, s in enumerate(inputs)]
        return [f.result() for f in futures]
    finally:
        shutil.rmtree(work, ignore_errors=True)


PROBE = r"""
import os, socket
net = files = "open"
try:
    socket.socket()
except PermissionError:
    net = "blocked"
try:
    os.listdir("/tmp")
except PermissionError:
    files = "blocked"
print(net, files)
"""


def probe_sandbox():
    """Checks what the jail really enforces here: networking (seccomp) and files (Landlock)."""
    d = tempfile.mkdtemp(prefix="probe-")
    try:
        empty = os.path.join(d, ".empty")
        open(empty, "wb").close()
        _, _, _, out, _ = jailed("run", 5, 512, 64, ["python3", "-I", "-c", PROBE], d, empty, 10 * SLOWDOWN)
        net, _, files = out.strip().partition(" ")
        parts = [p for p, ok in (("seccomp", net == "blocked"), ("landlock", files == "blocked")) if ok]
        return "+".join(parts) or "limits-only"
    finally:
        shutil.rmtree(d, ignore_errors=True)


def version_of(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=10).stdout.splitlines()[0]
    except Exception:
        return None


INFO = {}


class Handler(BaseHTTPRequestHandler):
    server_version = "arc-runner"

    def log_message(self, fmt, *args):  # keep logs short, never log code
        pass

    def send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/health"):
            return self.send(200, {"ok": True, "busy": busy, "parallel": PARALLEL, "cpus": round(CPUS, 2), **INFO})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        global busy
        if self.path != "/run":
            return self.send(404, {"error": "not found"})
        auth = self.headers.get("Authorization", "")
        if not TOKEN or not hmac.compare_digest(auth.encode(), f"Bearer {TOKEN}".encode()):
            return self.send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send(413, {"error": "request too large"})
        try:
            body = json.loads(self.rfile.read(length))
            language = body["language"]
            code = body["code"]
            inputs = body.get("inputs") or [""]
            tl = int(body.get("timeLimitMs") or 2000)
            assert language in ("c", "python", "arduino") and isinstance(code, str) and len(code) <= 100_000
            assert isinstance(inputs, list) and 1 <= len(inputs) <= MAX_INPUTS
            assert all(isinstance(s, str) and len(s) <= 256 * 1024 for s in inputs)
        except Exception:
            return self.send(400, {"error": "bad request"})
        with busy_lock:
            busy += 1
        started = time.time()
        try:
            results = run_batch(language, code, inputs, tl)
            self.send(200, {"results": results, "ms": round((time.time() - started) * 1000)})
        except Exception as e:  # never leak internals
            self.send(500, {"error": f"runner error: {type(e).__name__}"})
        finally:
            with busy_lock:
                busy -= 1


def main():
    hide_environment()
    INFO.update(
        version=VERSION,
        languages=["c", "python", "arduino"] if os.path.exists(f"{ARDUINO_DIR}/libarduinosim.a") else ["c", "python"],
        sandbox=probe_sandbox(),
        gcc=version_of(["gcc", "--version"]),
        python=version_of(["python3", "--version"]),
        tokenSet=bool(TOKEN),
    )
    print(f"arc-runner {VERSION} on :{PORT} · cpus={CPUS:.2f} · parallel={PARALLEL} · sandbox={INFO['sandbox']}", flush=True)
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer.request_queue_size = 256  # a whole class pressing "Run" together
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
