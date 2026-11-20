import { hasCodingQuestions, parseQuestionText, splitForImport } from '@arc/validation';

const fence = '```';
const paper = [
  '1. Which protocol uses SDA and SCL?',
  'A) SPI',
  'B) I2C',
  'Answer: B',
  '',
  'CODING QUESTION 1',
  'Marks: 5',
  'Difficulty: Hard',
  'Languages: C, Python',
  'Marking: Test cases',
  'Output check: Exact',
  'Time limit: 3 seconds',
  'Statement:',
  'Scenario 1',
  '',
  'Add two numbers.',
  '1. Read a and b.',
  'Input:',
  '- One line: a b',
  '',
  'Sample test 1',
  'Input:',
  fence,
  '2 3',
  fence,
  'Output:',
  fence,
  '5',
  fence,
  'Hidden test 2',
  'Input:',
  fence,
  '  10   20',
  '',
  fence,
  'Output:',
  '30',
  '',
  'Reference solution (Python):',
  `${fence}python`,
  'a, b = map(int, input().split())',
  'if a >= 0:',
  '    print(a + b)',
  'else:',
  '    print(a + b)',
  fence,
  'Reference solution (C):',
  `${fence}c`,
  '#include <stdio.h>',
  'int main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); }',
  fence,
  'END CODING QUESTION',
  '',
  '2. SPI is full duplex. (True/False)',
  'Answer: True',
].join('\n');

describe('Importing coding questions', () => {
  const qs = parseQuestionText(paper);

  it('keeps the paper order: MCQ, coding, true/false', () => {
    expect(hasCodingQuestions(paper)).toBe(true);
    expect(qs.map((q) => q.type)).toEqual(['SINGLE_CHOICE', 'CODING', 'TRUE_FALSE']);
    expect(qs[0]!.options[1]!.correct).toBe(true);
    expect(qs[2]!.answer).toBe(true);
  });

  it('reads the settings, statement, tests and solutions exactly', () => {
    const q = qs[1]!;
    expect(q.points).toBe(5);
    expect(q.difficulty).toBe('HARD');
    expect(q.prompt).toBe(
      'Scenario 1\n\nAdd two numbers.\n1. Read a and b.\nInput:\n- One line: a b',
    );
    const c = q.coding!;
    expect(c).toMatchObject({
      languages: ['c', 'python'],
      mode: 'tests',
      compare: 'exact',
      timeLimitMs: 3000,
      solutionLanguages: ['python', 'c'],
      warnings: [],
    });
    expect(c.testCases).toEqual([
      { input: '2 3', output: '5', sample: true },
      { input: '10   20', output: '30', sample: false },
    ]);
    expect(c.solution).toEqual({
      language: 'python',
      code: 'a, b = map(int, input().split())\nif a >= 0:\n    print(a + b)\nelse:\n    print(a + b)',
    });
  });

  it('never splits a coding question across parts', () => {
    const long = `${'9. filler question text\nA) x\nB) y\n'.repeat(400)}\n${paper}`;
    const parts = splitForImport(long);
    const withCoding = parts.filter((p) => p.includes('CODING QUESTION 1'));
    expect(withCoding).toHaveLength(1);
    expect(withCoding[0]).toContain('END CODING QUESTION');
    expect(parseQuestionText(withCoding[0]!).find((q) => q.type === 'CODING')).toBeTruthy();
  });

  it('reads AI-marked questions with a marking scheme', () => {
    const [q] = parseQuestionText(
      [
        'CODING QUESTION 1',
        'Marks: 4',
        'Languages: Python',
        'Marking: AI',
        'Statement:',
        'Reverse a string.',
        'Marking scheme:',
        '- Reads the input (1 mark)',
        '- Prints the reversed string (3 marks)',
        'END CODING QUESTION',
      ].join('\n'),
    );
    expect(q!.coding).toMatchObject({
      mode: 'ai',
      languages: ['python'],
      rubric: [
        { text: 'Reads the input', points: 1 },
        { text: 'Prints the reversed string', points: 3 },
      ],
    });
  });
});
