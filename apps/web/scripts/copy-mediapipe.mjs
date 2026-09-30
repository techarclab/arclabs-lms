// Copies MediaPipe's WebAssembly runtime into public/ so the camera AI loads it from our own site
// (no third-party CDN during exams). Runs before `next dev` / `next build`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// The package has no ./package.json export; resolve its main file and walk up.
let pkg = dirname(require.resolve('@mediapipe/tasks-vision'));
while (!existsSync(join(pkg, 'wasm')) && dirname(pkg) !== pkg) pkg = dirname(pkg);
const out = join(process.cwd(), 'public', 'mediapipe', 'wasm');
mkdirSync(out, { recursive: true });
for (const f of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  const src = join(pkg, 'wasm', f);
  if (existsSync(src)) cpSync(src, join(out, f));
}
console.log('mediapipe wasm → public/mediapipe/wasm');

// pdf.js worker for "Import questions from PDF" (text is read in the browser).
{
  let pdf = dirname(require.resolve('pdfjs-dist'));
  while (!existsSync(join(pdf, 'build', 'pdf.worker.min.mjs')) && dirname(pdf) !== pdf) pdf = dirname(pdf);
  const dest = join(process.cwd(), 'public', 'pdfjs');
  mkdirSync(dest, { recursive: true });
  cpSync(join(pdf, 'build', 'pdf.worker.min.mjs'), join(dest, 'pdf.worker.min.mjs'));
  console.log('pdf.js worker → public/pdfjs');
}
