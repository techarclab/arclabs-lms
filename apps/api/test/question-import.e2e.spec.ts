import type { INestApplication } from '@nestjs/common';
import { createTestApp, fakeAi, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const PAPER = `Embedded Systems — Unit 1 quiz
1. Which pin of DHT11 is used for data?
A) Pin 1
B) Pin 2
C) Pin 3
D) Pin 4
Answer: B
2) The Arduino Uno uses which microcontroller? A) ATmega328P B) ATmega2560 C) ESP32 D) STM32
3. I2C uses two signal wires. (True/False)
4. Which are serial protocols?
(a) UART (b) PWM (c) SPI (d) ADC
Ans: a, c
5. Default baud rate in most Arduino examples?
Answer: 9600
6. Explain the working of a DHT11 sensor.
Answer key
2 - A
3 - True`;

describe('Import questions from a PDF / Word file', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let staff: string;
  let learner: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Q College', slug: 'q' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    learner = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('reads the common question-paper layout without AI', async () => {
    const r = await orgApi(app, staff, orgId).post('/questions/import/parse', {
      text: PAPER,
      useAi: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.method).toBe('rules');
    const qs = r.body.questions as {
      type: string;
      prompt: string;
      options: { text: string; correct: boolean }[];
      answer: boolean | null;
      value: number | null;
    }[];
    expect(qs.map((q) => q.type)).toEqual([
      'SINGLE_CHOICE',
      'SINGLE_CHOICE',
      'TRUE_FALSE',
      'MULTIPLE_CHOICE',
      'NUMERIC',
      'UNSUPPORTED',
    ]);
    expect(qs[0]!.options.find((o) => o.correct)?.text).toBe('Pin 2');
    expect(qs[1]!.options.find((o) => o.correct)?.text).toBe('ATmega328P'); // from the answer key
    expect(qs[2]!.answer).toBe(true);
    expect(qs[3]!.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['UART', 'SPI']);
    expect(qs[4]!.value).toBe(9600);
  });

  it('uses AI when it is set up, and falls back to the rules if AI fails', async () => {
    const ai = await orgApi(app, staff, orgId).post('/questions/import/parse', { text: PAPER });
    expect(ai.body.method).toBe('ai');
    expect(ai.body.questions[0]).toMatchObject({ type: 'SINGLE_CHOICE', topic: 'Fake topic' });
    fakeAi.down = true;
    const fb = await orgApi(app, staff, orgId).post('/questions/import/parse', { text: PAPER });
    fakeAi.down = false;
    expect(fb.body.method).toBe('rules');
    expect(fb.body.note).toContain('AI couldn’t read');
    expect(fb.body.questions).toHaveLength(6);
  });

  it('saves reviewed questions in bulk and skips ones already in the bank', async () => {
    const qs = [
      {
        type: 'SINGLE_CHOICE',
        prompt: 'Which pin of DHT11 is used for data?',
        options: [
          { text: 'Pin 1', correct: false },
          { text: 'Pin 2', correct: true },
        ],
        topic: 'DHT11',
      },
      { type: 'TRUE_FALSE', prompt: 'I2C uses two signal wires.', answer: true },
      { type: 'NUMERIC', prompt: 'Default baud rate?', value: 9600 },
    ];
    const r = await orgApi(app, staff, orgId).post('/questions/bulk', { questions: qs });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ created: 3, skipped: 0 });
    const again = await orgApi(app, staff, orgId).post('/questions/bulk', { questions: qs });
    expect(again.body).toEqual({ created: 0, skipped: 3 });
    // parse now flags them as duplicates
    const p = await orgApi(app, staff, orgId).post('/questions/import/parse', {
      text: PAPER,
      useAi: false,
    });
    expect(p.body.questions[0].duplicate).toBe(true);
    expect(p.body.questions[1].duplicate).toBe(false);
    // a question without a correct answer is rejected with its position
    const bad = await orgApi(app, staff, orgId).post('/questions/bulk', {
      questions: [
        {
          type: 'SINGLE_CHOICE',
          prompt: 'No answer here',
          options: [{ text: 'a' }, { text: 'b' }],
        },
      ],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0]).toMatchObject({ path: '0' });
    expect(await prisma.question.count({ where: { organizationId: orgId } })).toBe(3);
  });

  it('students cannot import', async () => {
    expect(
      (await orgApi(app, learner, orgId).post('/questions/import/parse', { text: PAPER })).status,
    ).toBe(403);
  });
});
