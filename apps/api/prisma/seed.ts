import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

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

  console.log(`Seeded organization "${arc.name}" (${arc.id}) and a sample course.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
