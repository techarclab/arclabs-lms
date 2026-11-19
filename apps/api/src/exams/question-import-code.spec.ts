import { parseQuestionText, splitForImport } from '@arc/validation';

const paper = [
  '1. What does this Python code print?',
  '```python',
  '    def f(a, b=[]):',
  '        b.append(a)',
  '        return b',
  '',
  '    print(f(1), f(2))',
  '```',
  'Choose the exact output.',
  'A) [1] [2]',
  'B) [1, 2] [1, 2]',
  'C) [1] [1, 2]',
  'D) Error',
  'Answer: B',
  'Explanation: The default list is created once.',
  '',
  '2. In C, what is printed?',
  '```c',
  'int x = 5;',
  'b) x++;',
  '10.',
  'printf("%d", x);',
  '```',
  'A) 5',
  'B) 6',
  'Answer: B',
].join('\n');

describe('importing questions with code blocks', () => {
  it('keeps line breaks and indentation inside ``` blocks', () => {
    const [q1, q2] = parseQuestionText(paper);
    expect(q1!.prompt).toBe(
      'What does this Python code print?\n```python\ndef f(a, b=[]):\n    b.append(a)\n    return b\n\nprint(f(1), f(2))\n```\nChoose the exact output.',
    );
    expect(q1!.options.map((o) => o.text)).toEqual([
      '[1] [2]',
      '[1, 2] [1, 2]',
      '[1] [1, 2]',
      'Error',
    ]);
    expect(q1!.options[1]!.correct).toBe(true);
    expect(q1!.explanation).toBe('The default list is created once.');
    // Lines in the code that look like options or question numbers stay code.
    expect(q2!.prompt).toBe(
      'In C, what is printed?\n```c\nint x = 5;\nb) x++;\n10.\nprintf("%d", x);\n```',
    );
    expect(q2!.options).toHaveLength(2);
  });

  it('never splits a paper inside a code block', () => {
    const big = Array.from({ length: 40 }, (_, i) =>
      [
        `${i + 1}. Q${i}`,
        '```',
        ...Array.from({ length: 8 }, (_, k) => `${k + 1}. line ${'x'.repeat(30)}`),
        '```',
        'A) 1',
        'B) 2',
        'Answer: A',
      ].join('\n'),
    ).join('\n');
    const parts = splitForImport(big, 2000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect((p.match(/```/g) ?? []).length % 2).toBe(0);
    expect(parts.flatMap((p) => parseQuestionText(p))).toHaveLength(40);
  });

  it('reads papers without code exactly as before', () => {
    const [q] = parseQuestionText('1. Port of MQTT?\nA) 1883 B) 80\nC) 22 D) 21\nAnswer: A');
    expect(q!.prompt).toBe('Port of MQTT?');
    expect(q!.options.map((o) => o.text)).toEqual(['1883', '80', '22', '21']);
  });
});
