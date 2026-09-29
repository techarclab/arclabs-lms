import { outputsMatch } from '@arc/validation';

describe('outputsMatch', () => {
  it('exact: only trailing spaces / blank lines are forgiven', () => {
    expect(outputsMatch('T=31C \nFAN ON\n\n', 'T=31C\nFAN ON', 'exact')).toBe(true);
    expect(outputsMatch('t=31c', 'T=31C', 'exact')).toBe(false);
  });
  it('flexible: case, spacing, blank lines and number formatting', () => {
    expect(outputsMatch('temp: 31.00 c\n\nfan on\n', 'Temp:  31 C\nFAN ON', 'flexible')).toBe(true);
    expect(outputsMatch('T=29.80C', 'T=29.8C', 'flexible')).toBe(true);
    expect(outputsMatch('T=32C', 'T=31C', 'flexible')).toBe(false);
    expect(outputsMatch('T=31C', 'T=31C\nFAN ON', 'flexible')).toBe(false);
    expect(outputsMatch('Temp 31', 'Temperature 31', 'flexible')).toBe(false);
  });
});
