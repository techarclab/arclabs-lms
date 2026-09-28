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
  readonly provider: 'judge0' | 'local';
  run(
    language: CodeLanguageName,
    code: string,
    stdin: string,
    timeLimitMs: number,
  ): Promise<RunOutput>;
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
  if (env.CODE_RUNNER === 'judge0' && env.JUDGE0_URL) {
    const headers: Record<string, string> = {};
    if (env.JUDGE0_AUTH_TOKEN) headers['X-Auth-Token'] = env.JUDGE0_AUTH_TOKEN;
    if (env.JUDGE0_RAPIDAPI_KEY) {
      headers['X-RapidAPI-Key'] = env.JUDGE0_RAPIDAPI_KEY;
      headers['X-RapidAPI-Host'] = new URL(env.JUDGE0_URL).host;
    }
    return new Judge0Runner(env.JUDGE0_URL, headers);
  }
  if (env.CODE_RUNNER === 'local') {
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

  status(): CodeRunnerStatus {
    return {
      configured: Boolean(this.impl),
      provider: this.impl?.provider ?? null,
      languages: ['c', 'python'],
    };
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
