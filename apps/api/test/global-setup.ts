import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Creates the test database (if missing) and applies migrations.
 * Uses TEST_DATABASE_URL — never the development database.
 */
export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      'postgresql://arc:arc_dev_password@localhost:5432/arc_lms_test?schema=public',
  );
  process.env.TEST_DATABASE_URL = url.toString();
  const dbName = url.pathname.slice(1);

  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  if (!process.env.SKIP_TEST_MIGRATE) {
    execSync('prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url.toString() },
    });
  }
}
