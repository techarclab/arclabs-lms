/** A question read from an uploaded PDF / Word file, before faculty review it. */
export type ImportableType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC';

/** A coding question read from a "CODING QUESTION" block of an import file. */
export interface ImportedCoding {
  languages: ('c' | 'python' | 'arduino')[];
  starter: Partial<Record<'c' | 'python' | 'arduino', string>>;
  testCases: { input: string; output: string; sample: boolean }[];
  timeLimitMs: number;
  compare: 'exact' | 'flexible';
  mode: 'tests' | 'ai';
  rubric: { text: string; points: number }[];
  compilePenaltyPct: number;
  /** The first reference solution in the file (the LMS keeps one). */
  solution: { language: 'c' | 'python' | 'arduino'; code: string } | null;
  /** Languages of every reference solution written in the file. */
  solutionLanguages: ('c' | 'python' | 'arduino')[];
  /** Lines in the block that weren't understood. */
  warnings: string[];
}

export interface ImportedQuestion {
  /** 'UNSUPPORTED' = descriptive / long-answer question (can't be auto-marked). */
  type: ImportableType | 'CODING' | 'UNSUPPORTED';
  /** Set when type is 'CODING'. */
  coding?: ImportedCoding;
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
