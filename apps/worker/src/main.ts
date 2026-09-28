import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { sendEmail } from './jobs/email';
import { QUEUES } from './queues';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const workers = [new Worker(QUEUES.email, sendEmail, { connection, concurrency: 5 })];

for (const w of workers) {
  w.on('completed', (job) => console.log(`[${w.name}] job ${job.id} done`));
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed: ${err.message}`));
}
console.log(`Worker started: ${workers.map((w) => w.name).join(', ')} (redis ${env.REDIS_URL})`);

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
