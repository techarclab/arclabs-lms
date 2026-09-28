import { z } from 'zod';
import { paginationQuery } from './common';

export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const gradableTypeSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'NUMERIC',
]);
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
  ]),
  meta: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});
export type ProctorEventInput = z.infer<typeof proctorEventSchema>;
