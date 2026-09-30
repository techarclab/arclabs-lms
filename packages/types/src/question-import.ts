/** A question read from an uploaded PDF / Word file, before faculty review it. */
export type ImportableType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC';

export interface ImportedQuestion {
  /** 'UNSUPPORTED' = descriptive / long-answer question (can't be auto-marked). */
  type: ImportableType | 'UNSUPPORTED';
  prompt: string;
  options: { text: string; correct: boolean }[];
  /** TRUE_FALSE */
  answer: boolean | null;
  /** NUMERIC */
  value: number | null;
  explanation: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | null;
  topic: string | null;
  points: number | null;
  /** The correct answer was suggested by AI (not written in the file) — check it. */
  answerByAi: boolean;
  /** Same question text already in the bank. */
  duplicate?: boolean;
}

export interface ImportParseResult {
  method: 'ai' | 'rules';
  questions: ImportedQuestion[];
  /** Why AI wasn't used, if it wasn't. */
  note: string | null;
}
