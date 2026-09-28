import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { SAMPLE_CODING, SAMPLE_QUESTIONS } from './sample-questions';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const arc = await prisma.organization.upsert({
    where: { slug: 'arc-labs' },
    update: { primaryColor: '#2F45EF' },
    create: {
      name: 'ARC LABS',
      slug: 'arc-labs',
      type: 'PLATFORM',
      contactEmail: 'deepakarclab@outlook.com',
      primaryColor: '#2F45EF',
    },
  });

  await prisma.course.upsert({
    where: { organizationId_slug: { organizationId: arc.id, slug: 'iot-foundations' } },
    update: {},
    create: {
      organizationId: arc.id,
      title: 'IoT Foundations with ESP32',
      slug: 'iot-foundations',
      summary: 'Sensors, actuators, Wi-Fi and MQTT basics with the ESP32.',
      level: 'BEGINNER',
      isPublic: true,
      estimatedHours: 12,
      modules: {
        create: [
          {
            title: 'Getting started',
            position: 1,
            lessons: {
              create: [
                { title: 'What is IoT?', type: 'TEXT', position: 1, isPreview: true },
                { title: 'Setting up the Arduino IDE for ESP32', type: 'VIDEO', position: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  // Starter question bank (only if the organization has none yet)
  if ((await prisma.question.count({ where: { organizationId: arc.id } })) === 0) {
    let n = 0;
    for (const q of SAMPLE_QUESTIONS) {
      const id = () => Math.random().toString(16).slice(2, 10);
      const common = {
        organizationId: arc.id,
        prompt: q.prompt,
        topic: q.topic,
        difficulty: q.difficulty,
        points: q.points ?? 1,
        explanation: q.explanation ?? null,
        negativeMarks: 0.25 * (q.points ?? 1),
      };
      if (q.type === 'TRUE_FALSE') {
        await prisma.question.create({
          data: {
            ...common,
            type: 'TRUE_FALSE',
            options: [
              { id: 'true', text: 'True' },
              { id: 'false', text: 'False' },
            ],
            correctAnswer: [q.answer ? 'true' : 'false'],
          },
        });
      } else if (q.type === 'NUMERIC') {
        await prisma.question.create({
          data: {
            ...common,
            type: 'NUMERIC',
            options: [],
            correctAnswer: { value: q.value, tolerance: q.tolerance },
          },
        });
      } else {
        const opts = q.options.map((text) => ({ id: id(), text }));
        await prisma.question.create({
          data: {
            ...common,
            type: q.type,
            options: opts,
            correctAnswer: q.correct.map((i) => opts[i]!.id),
          },
        });
      }
      n++;
    }
    console.log(`Added ${n} sample questions to the ARC LABS question bank.`);
  }

  // Coding samples are added once, even when the bank already had other questions.
  if (!(await prisma.question.count({ where: { organizationId: arc.id, type: 'CODING' } }))) {
    for (const q of SAMPLE_CODING) {
      await prisma.question.create({
        data: {
          organizationId: arc.id,
          type: 'CODING',
          prompt: q.prompt,
          topic: q.topic,
          difficulty: q.difficulty,
          points: q.points,
          options: [],
          correctAnswer: {},
          coding: q.coding,
        },
      });
    }
    console.log(`Added ${SAMPLE_CODING.length} sample coding questions.`);
  }

  console.log(`Seeded organization "${arc.name}" (${arc.id}) and a sample course.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
