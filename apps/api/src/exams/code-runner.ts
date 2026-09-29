import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CodeLanguageName, CodeRunnerStatus, RunStatus } from '@arc/types';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export interface RunOutput {
  status: RunStatus;
  stdout: string;
  error: string | null; // compiler output / stderr
  timeMs: number | null;
}

/** Runs one program with one input. Implementations must sandbox and time-limit execution. */
export interface CodeRunnerImpl {
  readonly provider: 'arc' | 'judge0' | 'local';
  run(
    language: CodeLanguageName,
    code: string,
    stdin: string,
    timeLimitMs: number,
  ): Promise<RunOutput>;
  /** Optional: one program, many inputs in a single request (compiles once). */
  runBatch?(
    language: CodeLanguageName,
    code: string,
    inputs: string[],
    timeLimitMs: number,
  ): Promise<RunOutput[]>;
  /** Optional: quick reachability check (also wakes a sleeping runner). */
  health?(): Promise<boolean>;
}

export class RunnerUnavailableError extends Error {
  constructor(message = 'No code runner is configured') {
    super(message);
  }
}

const MAX_OUTPUT = 64 * 1024;
const clip = (s: string) =>
  s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n…(output truncated)' : s;

// ───────── Judge0 (self-hosted or RapidAPI) ─────────

/** Judge0 CE language ids. */
const JUDGE0_LANG: Record<CodeLanguageName, number> = { c: 50, python: 71 };

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined) =>
  s ? Buffer.from(s, 'base64').toString('utf8') : '';

export class Judge0Runner implements CodeRunnerImpl {
  readonly provider = 'judge0' as const;
  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
  ) {}

  async run(language: CodeLanguageName, code: string, stdin: string, timeLimitMs: number) {
    const res = await fetch(
      `${this.url.replace(/\/$/, '')}/submissions?base64_encoded=true&wait=true`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.headers },
        body: JSON.stringify({
          language_id: JUDGE0_LANG[language],
          source_code: b64(code),
          stdin: b64(stdin),
          cpu_time_limit: timeLimitMs / 1000,
          wall_time_limit: Math.min(20, (timeLimitMs / 1000) * 3),
          memory_limit: 256_000,
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!res.ok) throw new Error(`Judge0 responded ${res.status}`);
    const j = (await res.json()) as {
      status?: { id: number };
      stdout?: string;
      stderr?: string;
      compile_output?: string;
      message?: string;
      time?: string | null;
    };
    const id = j.status?.id ?? 13;
    const status: RunStatus =
      id === 3 || id === 4
        ? 'OK'
        : id === 5
          ? 'TIME_LIMIT'
          : id === 6
            ? 'COMPILE_ERROR'
            : id >= 7 && id <= 12
              ? 'RUNTIME_ERROR'
              : 'INTERNAL_ERROR';
    const error =
      status === 'COMPILE_ERROR'
        ? unb64(j.compile_output)
        : status === 'OK'
          ? null
          : unb64(j.stderr) || unb64(j.message) || null;
    return {
      status,
      stdout: clip(unb64(j.stdout)),
      error: error ? clip(error) : null,
      timeMs: j.time ? Math.round(Number(j.time) * 1000) : null,
    };
  }
}

// ───────── ARC runner (apps/runner — e.g. a free Hugging Face Space) ─────────

const RUN_STATUSES = new Set<RunStatus>([
  'OK',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'INTERNAL_ERROR',
]);

export class ArcRunner implements CodeRunnerImpl {
  readonly provider = 'arc' as const;
  private readonly base: string;
  constructor(
    url: string,
    private readonly token: string,
  ) {
    this.base = url.replace(/\/$/, '');
  }

  async run(language: CodeLanguageName, code: string, stdin: string, timeLimitMs: number) {
    return (await this.runBatch(language, code, [stdin], timeLimitMs))[0]!;
  }

  async runBatch(language: CodeLanguageName, code: string, inputs: string[], timeLimitMs: number) {
    const res = await fetch(`${this.base}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ language, code, inputs, timeLimitMs }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Code runner responded ${res.status}`);
    const j = (await res.json()) as { results?: RunOutput[] };
    if (!Array.isArray(j.results) || j.results.length !== inputs.length)
      throw new Error('Code runner returned an invalid response');
    return j.results.map((r) => ({
      status: RUN_STATUSES.has(r.status) ? r.status : ('INTERNAL_ERROR' as const),
      stdout: clip(String(r.stdout ?? '')),
      error: r.error ? clip(String(r.error)) : null,
      timeMs: typeof r.timeMs === 'number' ? r.timeMs : null,
    }));
  }

  async health() {
    try {
      const r = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch {
      return false;
    }
  }
}

// ───────── Local (development only — NOT a sandbox) ─────────

function exec(
  cmd: string,
  args: string[],
  opts: { stdin?: string; timeoutMs: number; cwd: string },
) {
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    ms: number;
  }>((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { PATH: process.env.PATH ?? '' } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT * 2) stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT * 2) stderr += d.toString();
    });
    child.on('error', (e) => {
      stderr += e.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - started });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(opts.stdin ?? '');
  });
}

/** Runs gcc / python3 on the API machine. For local development and demos only. */
export class LocalRunner implements CodeRunnerImpl {
  readonly provider = 'local' as const;

  async run(language: CodeLanguageName, code: string, stdin: string, timeLimitMs: number) {
    const dir = await mkdtemp(join(tmpdir(), 'arc-run-'));
    try {
      if (language === 'c') {
        await writeFile(join(dir, 'main.c'), code);
        const cc = await exec('gcc', ['-O2', '-std=c11', '-o', 'main', 'main.c', '-lm'], {
          cwd: dir,
          timeoutMs: 15_000,
        });
        if (cc.code !== 0)
          return {
            status: 'COMPILE_ERROR' as const,
            stdout: '',
            error: clip(cc.stderr),
            timeMs: null,
          };
        return this.result(await exec('./main', [], { cwd: dir, stdin, timeoutMs: timeLimitMs }));
      }
      await writeFile(join(dir, 'main.py'), code);
      const r = await exec('python3', ['main.py'], { cwd: dir, stdin, timeoutMs: timeLimitMs });
      if (r.code !== 0 && /SyntaxError|IndentationError/.test(r.stderr))
        return {
          status: 'COMPILE_ERROR' as const,
          stdout: '',
          error: clip(r.stderr),
          timeMs: null,
        };
      return this.result(r);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private result(r: Awaited<ReturnType<typeof exec>>): RunOutput {
    if (r.timedOut)
      return { status: 'TIME_LIMIT', stdout: clip(r.stdout), error: null, timeMs: r.ms };
    if (r.code !== 0)
      return {
        status: 'RUNTIME_ERROR',
        stdout: clip(r.stdout),
        error: clip(r.stderr) || `Exited with code ${r.code}`,
        timeMs: r.ms,
      };
    return { status: 'OK', stdout: clip(r.stdout), error: null, timeMs: r.ms };
  }
}

// ───────── Facade ─────────

export const CODE_RUNNER_IMPL = Symbol('CODE_RUNNER_IMPL');

export function codeRunnerFactory(env: Env): CodeRunnerImpl | null {
  const kind = env.CODE_RUNNER ?? (env.CODE_RUNNER_URL ? 'arc' : undefined);
  if (kind === 'arc') {
    if (!env.CODE_RUNNER_URL || !env.CODE_RUNNER_TOKEN) {
      new Logger('CodeRunner').error('CODE_RUNNER=arc needs CODE_RUNNER_URL and CODE_RUNNER_TOKEN');
      return null;
    }
    return new ArcRunner(env.CODE_RUNNER_URL, env.CODE_RUNNER_TOKEN);
  }
  if (kind === 'judge0' && env.JUDGE0_URL) {
    const headers: Record<string, string> = {};
    if (env.JUDGE0_AUTH_TOKEN) headers['X-Auth-Token'] = env.JUDGE0_AUTH_TOKEN;
    if (env.JUDGE0_RAPIDAPI_KEY) {
      headers['X-RapidAPI-Key'] = env.JUDGE0_RAPIDAPI_KEY;
      headers['X-RapidAPI-Host'] = new URL(env.JUDGE0_URL).host;
    }
    return new Judge0Runner(env.JUDGE0_URL, headers);
  }
  if (kind === 'local') {
    if (env.NODE_ENV === 'production') {
      new Logger('CodeRunner').error('CODE_RUNNER=local is not allowed in production; ignoring');
      return null;
    }
    return new LocalRunner();
  }
  return null;
}

@Injectable()
export class CodeRunner {
  private readonly logger = new Logger(CodeRunner.name);

  constructor(@Inject(CODE_RUNNER_IMPL) private readonly impl: CodeRunnerImpl | null) {}

  private lastHealth: { at: number; ok: boolean } | null = null;

  /** Reports whether a runner is configured and (when it can tell) whether it is awake. */
  async status(): Promise<CodeRunnerStatus> {
    const base: CodeRunnerStatus = {
      configured: Boolean(this.impl),
      provider: this.impl?.provider ?? null,
      languages: ['c', 'python'],
    };
    if (!this.impl?.health) return base;
    if (!this.lastHealth || Date.now() - this.lastHealth.at > 30_000)
      this.lastHealth = { at: Date.now(), ok: await this.impl.health() };
    return { ...base, ready: this.lastHealth.ok };
  }

  /** Pings the runner so a sleeping free-tier host wakes up (fire-and-forget). */
  wake() {
    void this.impl?.health?.();
  }

  get configured() {
    return Boolean(this.impl);
  }

  async run(language: CodeLanguageName, code: string, stdin: string, timeLimitMs: number) {
    if (!this.impl) throw new RunnerUnavailableError();
    try {
      return await this.impl.run(language, code, stdin, timeLimitMs);
    } catch (e) {
      this.logger.warn(`Code run failed: ${(e as Error).message}`);
      throw new RunnerUnavailableError('The code runner is not responding');
    }
  }

  /**
   * Runs `code` against many inputs with limited parallelism. A compile error short-circuits:
   * every case gets the same compiler output without running again.
   */
  async runMany(
    language: CodeLanguageName,
    code: string,
    inputs: string[],
    timeLimitMs: number,
    concurrency = 4,
  ): Promise<RunOutput[]> {
    if (!inputs.length) return [];
    if (this.impl?.runBatch) {
      try {
        return await this.impl.runBatch(language, code, inputs, timeLimitMs);
      } catch (e) {
        this.logger.warn(`Code run failed: ${(e as Error).message}`);
        throw new RunnerUnavailableError('The code runner is not responding');
      }
    }
    const first = await this.run(language, code, inputs[0]!, timeLimitMs);
    const out: RunOutput[] = [first];
    if (first.status === 'COMPILE_ERROR') return inputs.map(() => first);
    let next = 1;
    const worker = async () => {
      while (next < inputs.length) {
        const i = next++;
        out[i] = await this.run(language, code, inputs[i]!, timeLimitMs);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length - 1) }, worker));
    return out;
  }
}
