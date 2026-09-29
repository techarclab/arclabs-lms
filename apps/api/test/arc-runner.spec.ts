import { ArcRunner } from '../src/exams/code-runner';

// Talks to a real runner (apps/runner). Run with e.g.
//   RUNNER_TEST_URL=http://localhost:7861 RUNNER_TEST_TOKEN=testtok pnpm vitest run test/arc-runner.spec.ts
const url = process.env.RUNNER_TEST_URL;
const d = url ? describe : describe.skip;

d('ArcRunner (live runner)', () => {
  const r = new ArcRunner(url ?? '', process.env.RUNNER_TEST_TOKEN ?? '');

  it('is healthy', async () => {
    expect(await r.health()).toBe(true);
  });

  it('runs C against several inputs, compiling once', async () => {
    const code =
      '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}';
    const out = await r.runBatch('c', code, ['1 2', '40 2'], 2000);
    expect(out.map((o) => [o.status, o.stdout])).toEqual([
      ['OK', '3\n'],
      ['OK', '42\n'],
    ]);
  });

  it('reports compile errors, time limits and runtime errors', async () => {
    expect((await r.run('c', 'int main(){ return x; }', '', 2000)).status).toBe('COMPILE_ERROR');
    expect((await r.run('python', 'while True: pass', '', 1000)).status).toBe('TIME_LIMIT');
    expect((await r.run('python', 'print(1/0)', '', 1000)).status).toBe('RUNTIME_ERROR');
  });

  it('rejects a wrong token', async () => {
    await expect(
      new ArcRunner(url ?? '', 'wrong').run('python', 'print(1)', '', 1000),
    ).rejects.toThrow(/401/);
  });
});
