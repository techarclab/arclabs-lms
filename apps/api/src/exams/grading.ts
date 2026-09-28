/**
 * Pure grading and statistics helpers — no I/O, fully unit-tested.
 */

export interface GradableQuestion {
  id: string;
  type: string;
  correctAnswer: unknown;
  points: number;
  negativeMarks: number;
  topic: string | null;
  difficulty: string;
}

export interface QuestionResult {
  answered: boolean;
  correct: boolean;
  marks: number;
}

export function isAnswered(answer: unknown): boolean {
  if (answer === undefined || answer === null || answer === '') return false;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

export function isCorrect(q: GradableQuestion, answer: unknown): boolean {
  if (!isAnswered(answer)) return false;
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const key = q.correctAnswer as string[];
      return typeof answer === 'string' && key.length === 1 && key[0] === answer;
    }
    case 'MULTIPLE_CHOICE': {
      const key = new Set(q.correctAnswer as string[]);
      if (!Array.isArray(answer)) return false;
      const given = new Set(answer as string[]);
      return given.size === key.size && [...given].every((a) => key.has(a));
    }
    case 'NUMERIC': {
      const { value, tolerance } = q.correctAnswer as { value: number; tolerance: number };
      const n = typeof answer === 'number' ? answer : Number(answer);
      return Number.isFinite(n) && Math.abs(n - value) <= (tolerance ?? 0) + 1e-9;
    }
    default:
      return false; // CODING / SHORT_ANSWER are not auto-graded here
  }
}

export function gradeQuestion(
  q: GradableQuestion,
  answer: unknown,
  negativeMarking: boolean,
): QuestionResult {
  const answered = isAnswered(answer);
  const correct = isCorrect(q, answer);
  const marks = correct ? q.points : answered && negativeMarking ? -q.negativeMarks : 0;
  return { answered, correct, marks };
}

export interface GradeSummary {
  results: Record<string, QuestionResult>;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: Record<string, unknown>,
  opts: { negativeMarking: boolean; passPct: number },
): GradeSummary {
  const results: Record<string, QuestionResult> = {};
  let raw = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  for (const q of questions) {
    const r = gradeQuestion(q, answers[q.id], opts.negativeMarking);
    results[q.id] = r;
    raw += r.marks;
    maxScore += q.points;
    if (!r.answered) unansweredCount++;
    else if (r.correct) correctCount++;
    else wrongCount++;
  }
  const score = round2(Math.max(0, raw));
  const percentage = maxScore ? round2((score / maxScore) * 100) : 0;
  return {
    results,
    score,
    maxScore,
    percentage,
    passed: percentage >= opts.passPct,
    correctCount,
    wrongCount,
    unansweredCount,
  };
}

/** Topic / difficulty breakdown of one attempt. */
export function breakdown(
  questions: GradableQuestion[],
  results: Record<string, QuestionResult>,
  keyOf: (q: GradableQuestion) => string,
) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const q of questions) {
    const k = keyOf(q);
    const row = map.get(k) ?? { correct: 0, total: 0 };
    row.total++;
    if (results[q.id]?.correct) row.correct++;
    map.set(k, row);
  }
  return [...map.entries()].map(([key, v]) => ({
    key,
    ...v,
    pct: round2((v.correct / v.total) * 100),
  }));
}

/** Deterministic-free Fisher–Yates shuffle (uses Math.random). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
}

/** Standard competition ranking ("1224"): rank = 1 + number of strictly better scores. */
export function competitionRanks(scores: { id: string; value: number }[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    ranks.set(s.id, prev && prev.value === s.value ? ranks.get(prev.id)! : i + 1);
  });
  return ranks;
}

/** Percentage of candidates scoring strictly below this value, 0..100. */
export function percentileOf(value: number, all: number[]): number | null {
  if (all.length <= 1) return null;
  const below = all.filter((v) => v < value).length;
  return round2((below / (all.length - 1)) * 100);
}

/** 10 buckets of 10% each: [0,10), [10,20) … [90,100]. */
export function distribution(percentages: number[]) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    from: i * 10,
    to: i * 10 + 10,
    count: 0,
  }));
  for (const p of percentages) buckets[Math.min(9, Math.floor(p / 10))]!.count++;
  return buckets;
}

/**
 * Item discrimination: correct-rate in the top 27% of candidates minus the bottom 27%.
 * Ranges -1..1; above ~0.3 is a good question, below 0 suggests a flawed key.
 */
export function discriminationIndex(
  byCandidate: { total: number; correct: boolean }[],
): number | null {
  if (byCandidate.length < 5) return null;
  const sorted = [...byCandidate].sort((a, b) => b.total - a.total);
  const n = Math.max(1, Math.round(sorted.length * 0.27));
  const top = sorted.slice(0, n);
  const bottom = sorted.slice(-n);
  const rate = (g: typeof top) => g.filter((c) => c.correct).length / g.length;
  return round2(rate(top) - rate(bottom));
}
