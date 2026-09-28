import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations need a direct (non-pooled) connection on Neon; the app itself uses DATABASE_URL.
// Left undefined when neither is set so `prisma generate` still works (e.g. during CI builds).
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
});
