export type QuestionTypeName =
  'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC' | 'CODING' | 'SHORT_ANSWER';
export type DifficultyName = 'EASY' | 'MEDIUM' | 'HARD';
export type ExamState = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED';
export type ResultVisibilityName = 'SCORE_NOW_ANSWERS_AFTER_CLOSE' | 'IMMEDIATE' | 'MANUAL_RELEASE';
export type SubmitReasonName = 'MANUAL' | 'TIME_UP' | 'VIOLATIONS' | 'WINDOW_CLOSED' | 'INSTRUCTOR';

export interface QuestionOption {
  id: string;
  text: string;
}

export type CodeLanguageName = 'c' | 'python';

export interface CodingTestCase {
  id: string;
  input: string;
  output: string;
  sample: boolean;
}

/** Coding question setup (staff view — includes hidden tests and the reference solution). */
export interface CodingConfig {
  languages: CodeLanguageName[];
  starter: Partial<Record<CodeLanguageName, string>>;
  testCases: CodingTestCase[];
  timeLimitMs: number;
  solution?: { language: CodeLanguageName; code: string } | null;
}

/** What a student sees of a coding question: sample tests only. */
export interface DeliveredCoding {
  languages: CodeLanguageName[];
  starter: Partial<Record<CodeLanguageName, string>>;
  samples: { input: string; output: string }[];
  hiddenCount: number;
  timeLimitMs: number;
}

export type RunStatus =
  'OK' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT' | 'MEMORY_LIMIT' | 'INTERNAL_ERROR';

export interface TestRunResult {
  input: string;
  expected: string | null; // null for custom input
  output: string;
  passed: boolean | null; // null for custom input
  status: RunStatus;
  error: string | null; // compiler / runtime message
  timeMs: number | null;
}

export interface RunCodeResponse {
  results: TestRunResult[];
}

export interface CodeRunnerStatus {
  configured: boolean;
  provider: 'judge0' | 'local' | null;
  languages: CodeLanguageName[];
}

/** Staff view of a question (includes the answer key). */
export interface QuestionItem {
  id: string;
  type: QuestionTypeName;
  prompt: string;
  options: QuestionOption[];
  correctAnswer: unknown; // string[] option ids | {value, tolerance}
  explanation: string | null;
  points: number;
  negativeMarks: number;
  difficulty: DifficultyName;
  topic: string | null;
  tags: string[];
  coding: CodingConfig | null;
  archived: boolean;
  usedInExams: number;
  locked: boolean; // used by a published exam → read-only
  createdAt: string;
}

export interface ExamSettings {
  title: string;
  instructions: string | null;
  durationMinutes: number | null;
  startsAt: string | null;
  endsAt: string | null;
  passPct: number;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  resultVisibility: ResultVisibilityName;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
  requireCamera: boolean;
}

export interface ExamSummary extends ExamSettings {
  id: string;
  state: ExamState;
  questionCount: number;
  totalMarks: number;
  assignedCount: number;
  submittedCount: number;
  inProgressCount: number;
  avgPct: number | null;
  publishedAt: string | null;
  resultsReleasedAt: string | null;
  createdAt: string;
}

export interface ExamDetail extends ExamSummary {
  questions: QuestionItem[];
  audience: {
    assignToAll: boolean;
    departments: { id: string; name: string }[];
    users: { id: string; fullName: string; email: string }[];
  };
  publishIssues: string[]; // empty = ready to publish
  editable: boolean; // questions/settings can change (draft)
}

// ───────── Student side ─────────

export interface MyExamItem {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  state: ExamState;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  questionCount: number;
  totalMarks: number;
  attemptsUsed: number;
  maxAttempts: number;
  inProgressAttemptId: string | null;
  lastAttempt: {
    id: string;
    percentage: number | null;
    score: number | null;
    passed: boolean | null;
    submittedAt: string | null;
    resultVisible: boolean;
  } | null;
  canStart: boolean;
}

export interface ExamLobby extends MyExamItem {
  instructions: string | null;
  negativeMarking: boolean;
  passPct: number;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
  requireCamera: boolean;
  resultVisibility: ResultVisibilityName;
  serverNow: string;
}

/** A question as delivered to a student — no answer key. */
export interface DeliveredQuestion {
  id: string;
  type: QuestionTypeName;
  prompt: string;
  options: QuestionOption[];
  points: number;
  negativeMarks: number;
  coding?: DeliveredCoding;
}

export interface AttemptSession {
  attemptId: string;
  sessionId: string;
  examId: string;
  title: string;
  deadlineAt: string;
  serverNow: string;
  questions: DeliveredQuestion[];
  answers: Record<string, unknown>;
  violationCount: number;
  maxViolations: number;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  requireCamera: boolean;
  negativeMarking: boolean;
  resumed: boolean;
}

export interface ProctorEventResult {
  violationCount: number;
  remaining: number | null;
  autoSubmitted: boolean;
}

export interface BreakdownRow {
  key: string;
  correct: number;
  total: number;
  pct: number;
}

export interface ReviewItem {
  questionId: string;
  type: QuestionTypeName;
  prompt: string;
  options: QuestionOption[];
  yourAnswer: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  correct: boolean;
  answered: boolean;
  marks: number;
  points: number;
  /** Coding questions: hidden + sample test cases passed (details of hidden tests are never shown). */
  testsPassed?: number;
  testsTotal?: number;
  pending?: boolean; // waiting for the code runner
}

export interface AttemptResult {
  attemptId: string;
  examId: string;
  title: string;
  organizationName: string;
  scoreVisible: boolean;
  releaseNote: string | null; // why something is hidden
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  passPct: number;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  timeTakenSec: number | null;
  submittedAt: string | null;
  submitReason: SubmitReasonName | null;
  violationCount: number;
  rank: number | null;
  candidates: number | null;
  percentile: number | null;
  byTopic: BreakdownRow[];
  byDifficulty: BreakdownRow[];
  review: ReviewItem[] | null;
  reviewAvailableAt: string | null;
  codingPending: boolean; // some coding answers are still waiting to be evaluated
}

// ───────── Staff analytics ─────────

export interface CandidateRow {
  userId: string;
  fullName: string;
  email: string;
  department: string | null;
  externalId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
  attemptId: string | null;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  rank: number | null;
  timeTakenSec: number | null;
  violationCount: number;
  submitReason: SubmitReasonName | null;
  submittedAt: string | null;
}

export interface QuestionStat {
  questionId: string;
  position: number;
  prompt: string;
  type: QuestionTypeName;
  topic: string | null;
  difficulty: DifficultyName;
  points: number;
  attempted: number;
  correct: number;
  correctPct: number;
  discrimination: number | null; // upper-27% minus lower-27% correct rate
  options: { id: string; text: string; count: number; isCorrect: boolean }[];
}

export interface ExamAnalytics {
  exam: ExamSummary;
  stats: {
    assigned: number;
    notStarted: number;
    inProgress: number;
    submitted: number;
    passed: number;
    passRate: number | null;
    avgPct: number | null;
    medianPct: number | null;
    highestPct: number | null;
    lowestPct: number | null;
    avgTimeSec: number | null;
    autoSubmitted: number;
    withViolations: number;
    codingPending: number; // submitted attempts whose coding answers await the code runner
  };
  distribution: { from: number; to: number; count: number }[];
  questions: QuestionStat[];
  /** True for read-only viewers while the exam hasn't ended (no question texts / answer keys yet). */
  questionsHidden: boolean;
  topics: { topic: string; avgPct: number; questions: number }[];
  departments: { department: string; submitted: number; avgPct: number; passRate: number }[];
  violationsByType: Record<string, number>;
  candidates: CandidateRow[];
}

export interface AttemptDetail {
  candidate: CandidateRow;
  reviewHidden: boolean;
  review: ReviewItem[];
  events: { type: string; counted: boolean; occurredAt: string }[];
  ipAddress: string | null;
  userAgent: string | null;
  startedAt: string;
  deadlineAt: string | null;
}
