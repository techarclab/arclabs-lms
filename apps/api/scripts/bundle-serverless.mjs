// Bundles dist/serverless.js into one CommonJS file for Vercel.
// NestJS 12 (and jose, used by firebase-admin) ship ES modules only; Vercel's function launcher can't require() them, so they are
// inlined here. Plain CommonJS dependencies stay external and are traced by Vercel as usual.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/serverless.js'],
  outfile: 'dist/serverless.bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
  // ESM code in the bundle may use import.meta; map it to the CommonJS equivalents.
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
  define: {
    'import.meta.url': '__importMetaUrl',
    'import.meta.dirname': '__dirname',
    'import.meta.filename': '__filename',
  },
  external: [
    // CommonJS runtime deps (loaded normally from node_modules)
    '@prisma/*',
    'pg',
    'pg-*',
    // firebase-admin is bundled: it pulls in jose, which is also ES-module only.
    // Its Firestore/Storage parts load lazily and are never used here.
    '@google-cloud/*',
    '@aws-sdk/*',
    'ioredis',
    'bullmq',
    'nodemailer',
    'dotenv',
    'helmet',
    'reflect-metadata',
    // Optional Nest integrations we don't use (Nest loads them lazily inside try/catch)
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    '@fastify/*',
    'class-transformer',
    'class-transformer/*',
    'class-validator',
  ],
});
console.log('Bundled dist/serverless.bundle.cjs');
