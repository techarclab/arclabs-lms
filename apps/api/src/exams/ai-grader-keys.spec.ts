import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiGrader } from './ai-grader';
import type { Env } from '../config/env';

/** A fake OpenAI-compatible API: key "used-up" always answers 429 (daily limit), others answer. */
function fakeProvider(calls: string[]) {
  return createServer((req, res) => {
    const key = String(req.headers.authorization ?? '').replace('Bearer ', '');
    calls.push(key);
    req.resume();
    req.on('end', () => {
      if (key === 'used-up') {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ error: { message: 'Rate limit reached for tokens per day (TPD)' } }),
        );
        return;
      }
      if (key === 'revoked') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API Key' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    });
  });
}

describe('AI backup key', () => {
  let server: Server;
  const calls: string[] = [];
  let base = '';
  beforeAll(async () => {
    server = fakeProvider(calls);
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  const grader = (main: string, backup?: string) =>
    new AiGrader({
      AI_GRADER_API_KEY: main,
      AI_GRADER_API_KEY_2: backup,
      AI_GRADER_BASE_URL: base,
      AI_GRADER_MODEL: 'test-model',
      AI_GRADER_RPM: 10_000,
    } as unknown as Env);
  const ask = (g: AiGrader) =>
    g.ask('sys', 'user', Date.now() + 20_000, 100, (t) => (t.includes('ok') ? t : null));

  it('switches to the backup key when the main key runs out, and keeps using it', async () => {
    calls.length = 0;
    const g = grader('used-up', 'spare');
    expect(await ask(g)).toContain('ok');
    expect(calls).toEqual(['used-up', 'spare']);
    calls.length = 0;
    expect(await ask(g)).toContain('ok'); // the used-up key rests; no wasted call on it
    expect(calls).toEqual(['spare']);
  });

  it('skips a revoked key', async () => {
    calls.length = 0;
    expect(await ask(grader('revoked', 'spare'))).toContain('ok');
    expect(calls).toEqual(['revoked', 'spare']);
  });

  it('works with only one key, and the main key is used first when both work', async () => {
    calls.length = 0;
    expect(await ask(grader('main', 'spare'))).toContain('ok');
    expect(calls).toEqual(['main']);
    await expect(ask(grader('used-up'))).rejects.toThrow(/429/);
  });
});
