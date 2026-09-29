import { z } from 'zod';
import { paginationQuery } from './common';

export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const gradableTypeSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'NUMERIC',
  'CODING',
]);

/** Languages students can write coding answers in. */
export const codeLanguageSchema = z.enum(['c', 'python', 'arduino']);
export type CodeLanguage = z.infer<typeof codeLanguageSchema>;
export const CODE_LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: 'c', label: 'C' },
  { id: 'python', label: 'Python 3' },
  { id: 'arduino', label: 'Arduino (embedded C/C++)' },
];

const MAX_CODE = 20_000;
const MAX_IO = 10_000;

export const testCaseSchema = z.object({
  id: z.string().max(40).optional(),
  input: z.string().max(MAX_IO).default(''),
  output: z.string().max(MAX_IO),
  sample: z.boolean().default(false), // shown to students (and runnable during the exam)
});

export const codingConfigSchema = z
  .object({
    languages: z.array(codeLanguageSchema).min(1, 'Pick at least one language').max(3),
    starter: z.partialRecord(codeLanguageSchema, z.string().max(MAX_CODE)).default({}),
    testCases: z.array(testCaseSchema).max(30, 'Up to 30 test cases').default([]),
    timeLimitMs: z.coerce.number().int().min(500).max(10_000).default(2000),
    compare: z.enum(['exact', 'flexible']).default('flexible'),
    mode: z.enum(['tests', 'ai']).default('tests'),
    rubric: z
      .array(
        z.object({
          text: z.string().trim().min(3, 'Describe what earns these marks').max(300),
          points: z.coerce.number().min(0.5).max(100),
        }),
      )
      .max(12, 'Up to 12 rubric items')
      .default([]),
    compilePenaltyPct: z.coerce.number().int().min(0).max(100).default(25),
    solution: z
      .object({ language: codeLanguageSchema, code: z.string().max(MAX_CODE) })
      .optional()
      .nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.mode === 'ai') {
      if (!c.rubric.length)
        ctx.addIssue({
          code: 'custom',
          path: ['rubric'],
          message: 'Add the marking scheme: what the code must do and marks for each part',
        });
      return; // no test cases needed
    }
    if (!c.testCases.length) {
      ctx.addIssue({ code: 'custom', path: ['testCases'], message: 'Add at least one test case' });
      return;
    }
    if (!c.testCases.some((t) => t.sample)) {
      ctx.addIssue({
        code: 'custom',
        path: ['testCases'],
        message: 'Mark at least one test case as a sample so students can check their code',
      });
    }
    if (!c.solution?.code.trim()) {
      c.testCases.forEach((t, i) => {
        if (!t.output.trim())
          ctx.addIssue({
            code: 'custom',
            path: ['testCases', i, 'output'],
            message: `Test ${i + 1} has no expected output — fill it in, or add a reference solution and it will be filled automatically`,
          });
      });
    }
    if (c.testCases.every((t) => t.sample)) {
      ctx.addIssue({
        code: 'custom',
        path: ['testCases'],
        message: 'Keep at least one hidden test case for grading',
      });
    }
  });
export type CodingConfigInput = z.input<typeof codingConfigSchema>;

/** A student's coding answer. */
export const codeAnswerSchema = z.object({
  language: codeLanguageSchema,
  code: z.string().max(MAX_CODE),
});
export type CodeAnswer = z.infer<typeof codeAnswerSchema>;

/** Output comparison: ignore trailing spaces on each line and trailing blank lines. */
export function normalizeOutput(s: string) {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

const NUM = /[-+]?\d+(?:\.\d+)?/g;

/** One line reduced to comparable parts: lower-case text with single spaces, and its numbers. */
function flexLine(line: string) {
  const text = line.trim().replace(/\s+/g, ' ').toLowerCase();
  const nums = (text.match(NUM) ?? []).map(Number);
  return { shape: text.replace(NUM, '#'), nums };
}

/**
 * Does the program's output match the expected output?
 * - exact: line by line, ignoring trailing spaces and trailing blank lines
 * - flexible: also ignores upper/lower case, extra spaces, blank lines, and how numbers are
 *   written (31 = 31.0 = 31.00, but 31 ≠ 32)
 */
export function outputsMatch(
  actual: string,
  expected: string,
  mode: 'exact' | 'flexible' = 'exact',
) {
  if (mode === 'exact') return normalizeOutput(actual) === normalizeOutput(expected);
  const lines = (s: string) =>
    s
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map(flexLine);
  const a = lines(actual);
  const e = lines(expected);
  if (a.length !== e.length) return false;
  return a.every(
    (l, i) =>
      l.shape === e[i]!.shape &&
      l.nums.length === e[i]!.nums.length &&
      l.nums.every((n, j) => Math.abs(n - e[i]!.nums[j]!) < 1e-6),
  );
}
export const resultVisibilitySchema = z.enum([
  'SCORE_NOW_ANSWERS_AFTER_CLOSE',
  'IMMEDIATE',
  'MANUAL_RELEASE',
]);

const optionInput = z.object({
  id: z.string().max(40).optional(),
  text: z.string().trim().min(1, 'Option text is required').max(1000),
  correct: z.boolean().default(false),
});

const questionBase = {
  prompt: z.string().trim().min(3, 'Write the question').max(5000),
  explanation: z.string().trim().max(5000).optional().nullable(),
  points: z.coerce.number().int().min(1).max(100).default(1),
  negativeMarks: z.coerce.number().min(0).max(100).default(0),
  difficulty: difficultySchema.default('MEDIUM'),
  topic: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
};

const choiceOptions = z
  .array(optionInput)
  .min(2, 'Add at least two options')
  .max(8, 'Up to 8 options');

export const questionInputSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('SINGLE_CHOICE'), ...questionBase, options: choiceOptions }),
    z.object({ type: z.literal('MULTIPLE_CHOICE'), ...questionBase, options: choiceOptions }),
    z.object({ type: z.literal('TRUE_FALSE'), ...questionBase, answer: z.boolean() }),
    z.object({
      type: z.literal('NUMERIC'),
      ...questionBase,
      value: z.coerce.number({ message: 'Enter the correct number' }).finite(),
      tolerance: z.coerce.number().min(0).default(0),
    }),
    z.object({
      type: z.literal('CODING'),
      ...questionBase,
      negativeMarks: z.coerce.number().max(0, 'Coding questions have no negative marks').default(0),
      coding: codingConfigSchema,
    }),
  ])
  .superRefine((q, ctx) => {
    if (q.type === 'SINGLE_CHOICE' && q.options.filter((o) => o.correct).length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Mark exactly one correct option',
      });
    }
    if (q.type === 'MULTIPLE_CHOICE' && q.options.filter((o) => o.correct).length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Mark at least one correct option',
      });
    }
    if (q.negativeMarks > q.points) {
      ctx.addIssue({
        code: 'custom',
        path: ['negativeMarks'],
        message: 'Negative marks can’t exceed the question’s marks',
      });
    }
  });
export type QuestionInput = z.input<typeof questionInputSchema>;
export type QuestionInputParsed = z.output<typeof questionInputSchema>;

export const listQuestionsQuery = paginationQuery.extend({
  type: gradableTypeSchema.optional(),
  difficulty: difficultySchema.optional(),
  topic: z.string().trim().max(80).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuery>;

// ───────── Exams ─────────

const isoDate = z.coerce.date();

export const examSettingsSchema = z.object({
  title: z.string().trim().min(3, 'Give the exam a title').max(200),
  instructions: z.string().trim().max(10000).optional().nullable(),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  startsAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  passPct: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1).max(10),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  negativeMarking: z.boolean(),
  resultVisibility: resultVisibilitySchema,
  requireFullscreen: z.boolean(),
  blockCopyPaste: z.boolean(),
  maxViolations: z.coerce.number().int().min(0).max(50),
  requireCamera: z.boolean(),
});

export const createExamSchema = examSettingsSchema.partial().extend({
  title: examSettingsSchema.shape.title,
});
export type CreateExamInput = z.input<typeof createExamSchema>;
export type CreateExamParsed = z.output<typeof createExamSchema>;

export const updateExamSchema = examSettingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const setExamQuestionsSchema = z.object({
  questionIds: z.array(z.uuid()).max(300, 'Up to 300 questions per exam'),
});

export const setExamAudienceSchema = z.object({
  assignToAll: z.boolean(),
  departmentIds: z.array(z.uuid()).max(200).default([]),
  userIds: z.array(z.uuid()).max(5000).default([]),
});
export type SetExamAudienceInput = z.input<typeof setExamAudienceSchema>;

export const listExamsQuery = paginationQuery.extend({
  state: z.enum(['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED']).optional(),
});
export type ListExamsQuery = z.infer<typeof listExamsQuery>;

// ───────── Attempts ─────────

export const answerValueSchema = z.union([
  z.string().max(100),
  z.array(z.string().max(100)).max(20),
  z.number().finite(),
  codeAnswerSchema,
  z.null(),
]);

export const saveAnswerSchema = z.object({
  questionId: z.uuid(),
  answer: answerValueSchema,
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const proctorEventSchema = z.object({
  type: z.enum([
    'FULLSCREEN_EXIT',
    'TAB_HIDDEN',
    'WINDOW_BLUR',
    'COPY',
    'PASTE',
    'CONTEXT_MENU',
    'DEVTOOLS',
    'CAMERA_OFF',
    'SHORTCUT',
    'MULTIPLE_SCREENS',
    'AI_EXTENSION',
    'FACE_MISSING',
    'MULTIPLE_FACES',
    'LOOKING_AWAY',
    'PHONE_DETECTED',
  ]),
  meta: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  /** Camera AI events: a small JPEG taken at that moment (data URL), kept as evidence. */
  snapshot: z
    .string()
    .max(90_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Snapshot must be a JPEG data URL')
    .optional(),
});
export type ProctorEventInput = z.infer<typeof proctorEventSchema>;

/** Student "Run" during the exam: sample test cases, or their own input. */
export const runCodeSchema = z.object({
  questionId: z.uuid(),
  language: codeLanguageSchema,
  code: z.string().min(1, 'Write some code first').max(MAX_CODE),
  stdin: z.string().max(MAX_IO).optional(),
});
export type RunCodeInput = z.infer<typeof runCodeSchema>;

/** Staff: check a coding question's test cases against a reference solution. */
export const checkCodingSchema = z.object({
  coding: z.object({
    testCases: z.array(testCaseSchema).min(1).max(30),
    timeLimitMs: z.coerce.number().int().min(500).max(10_000).default(2000),
    compare: z.enum(['exact', 'flexible']).default('flexible'),
  }),
  language: codeLanguageSchema,
  code: z.string().min(1).max(MAX_CODE),
});
export type CheckCodingInput = z.infer<typeof checkCodingSchema>;

/** Staff: try AI marking on some code before the exam (e.g. the reference or a weak answer). */
export const aiCheckSchema = z.object({
  prompt: z.string().trim().min(3).max(10_000),
  rubric: z
    .array(
      z.object({ text: z.string().trim().min(3).max(300), points: z.coerce.number().min(0.5) }),
    )
    .min(1, 'Add the marking scheme first')
    .max(12),
  compilePenaltyPct: z.coerce.number().int().min(0).max(100).default(25),
  solution: z.string().max(MAX_CODE).optional().nullable(),
  language: codeLanguageSchema,
  code: z.string().min(1, 'Paste some code to mark').max(MAX_CODE),
});
export type AiCheckInput = z.infer<typeof aiCheckSchema>;

/** Faculty: set the marks for one question by hand (null clears it). */
export const setMarksSchema = z.object({
  questionId: z.uuid(),
  marks: z.coerce.number().min(-100).max(1000).nullable(),
});
export type SetMarksInput = z.infer<typeof setMarksSchema>;
