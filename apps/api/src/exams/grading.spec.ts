import {
  competitionRanks,
  discriminationIndex,
  distribution,
  gradeAttempt,
  gradeQuestion,
  isCorrect,
  median,
  percentileOf,
  type GradableQuestion,
} from './grading';

const q = (over: Partial<GradableQuestion>): GradableQuestion => ({
  id: 'q',
  type: 'SINGLE_CHOICE',
  correctAnswer: ['a'],
  points: 2,
  negativeMarks: 0.5,
  topic: 'GPIO',
  difficulty: 'EASY',
  ...over,
});

describe('grading', () => {
  it('single choice / true-false', () => {
    expect(isCorrect(q({}), 'a')).toBe(true);
    expect(isCorrect(q({}), 'b')).toBe(false);
    expect(isCorrect(q({ type: 'TRUE_FALSE', correctAnswer: ['false'] }), 'false')).toBe(true);
  });

  it('multiple choice requires the exact set', () => {
    const m = q({ type: 'MULTIPLE_CHOICE', correctAnswer: ['a', 'c'] });
    expect(isCorrect(m, ['c', 'a'])).toBe(true);
    expect(isCorrect(m, ['a'])).toBe(false);
    expect(isCorrect(m, ['a', 'b', 'c'])).toBe(false);
  });

  it('numeric with tolerance', () => {
    const n = q({ type: 'NUMERIC', correctAnswer: { value: 3.3, tolerance: 0.05 } });
    expect(isCorrect(n, 3.3)).toBe(true);
    expect(isCorrect(n, '3.34')).toBe(true);
    expect(isCorrect(n, 3.4)).toBe(false);
    expect(isCorrect(n, 'abc')).toBe(false);
  });

  it('scores with negative marking, never below zero', () => {
    const qs = [q({ id: '1' }), q({ id: '2' }), q({ id: '3' }), q({ id: '4' })];
    const g = gradeAttempt(
      qs,
      { '1': 'a', '2': 'b', '3': 'b' },
      { negativeMarking: true, passPct: 40 },
    );
    expect(g).toMatchObject({
      score: 1,
      maxScore: 8,
      percentage: 12.5,
      passed: false,
      correctCount: 1,
      wrongCount: 2,
      unansweredCount: 1,
    });
    const bad = gradeAttempt(qs, { '1': 'b', '2': 'b' }, { negativeMarking: true, passPct: 40 });
    expect(bad.score).toBe(0);
    const noNeg = gradeAttempt(qs, { '1': 'a', '2': 'b' }, { negativeMarking: false, passPct: 25 });
    expect(noNeg).toMatchObject({ score: 2, passed: true });
  });

  it('ranks, percentiles, median, distribution, discrimination', () => {
    const r = competitionRanks([
      { id: 'a', value: 90 },
      { id: 'b', value: 75 },
      { id: 'c', value: 90 },
      { id: 'd', value: 40 },
    ]);
    expect([r.get('a'), r.get('c'), r.get('b'), r.get('d')]).toEqual([1, 1, 3, 4]);
    expect(percentileOf(75, [90, 75, 90, 40])).toBe(33.33);
    expect(median([10, 40, 20])).toBe(20);
    expect(distribution([0, 9.9, 55, 100]).map((b) => b.count)).toEqual([
      2, 0, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    const d = discriminationIndex([
      { total: 90, correct: true },
      { total: 80, correct: true },
      { total: 60, correct: true },
      { total: 50, correct: false },
      { total: 20, correct: false },
      { total: 10, correct: false },
    ]);
    expect(d).toBe(1);
  });

  describe('coding questions', () => {
    const code = {
      id: 'c1',
      type: 'CODING',
      correctAnswer: {},
      points: 10,
      negativeMarks: 0,
      topic: null,
      difficulty: 'EASY',
    };
    const ans = { language: 'c', code: 'int main(){}' };

    it('gives partial credit per test case passed, with no negative marks', () => {
      expect(gradeQuestion(code, ans, true, { passed: 3, total: 4 })).toMatchObject({
        answered: true,
        correct: false,
        marks: 7.5,
        testsPassed: 3,
        testsTotal: 4,
      });
      expect(gradeQuestion(code, ans, true, { passed: 4, total: 4 })).toMatchObject({
        correct: true,
        marks: 10,
      });
      expect(gradeQuestion(code, ans, true, { passed: 0, total: 4 }).marks).toBe(0);
    });

    it('treats blank code as unanswered and missing runner results as pending', () => {
      expect(gradeQuestion(code, { language: 'c', code: '   ' }, true)).toMatchObject({
        answered: false,
        marks: 0,
      });
      expect(gradeQuestion(code, ans, true, 'pending')).toMatchObject({ pending: true, marks: 0 });
      const g = gradeAttempt(
        [code],
        { c1: ans },
        { negativeMarking: false, passPct: 40 },
        { c1: 'pending' },
      );
      expect(g.codingPending).toBe(true);
    });
  });
});
