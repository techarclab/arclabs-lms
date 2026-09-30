import { z } from 'zod';
import type { ImportedQuestion } from '@arc/types';

/** Text sent per request (the browser splits big files into parts). */
export const IMPORT_CHUNK_CHARS = 6000;

export const importParseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, 'No text found')
    .max(IMPORT_CHUNK_CHARS * 2),
  /** Let AI suggest answers the file doesn't give (marked for checking). */
  fillAnswers: z.boolean().default(false),
  useAi: z.boolean().default(true),
});
export type ImportParseInput = z.infer<typeof importParseSchema>;

const QUESTION_START =
  /^(?:Q(?:uestion)?\s*[.:-]?\s*)?\(?(\d{1,3})\s*[.):\]-]\s*(.*)$|^Q(?:uestion)?\s*(\d{1,3})\s+(.*)$/i;
const OPTION = /^\(?([A-Ha-h])\s*[).:\]]\s*(.*)$/;
const INLINE_OPTIONS = /(?:^|\s)\(?([A-Ha-h])[).]\s+/g;
const ANSWER =
  /^(?:ans(?:wer)?s?|correct(?:\s+(?:answer|option))?|key|right\s+answer)\s*[:.\-=]*\s*(?:option\s*)?(.*)$/i;
const EXPLANATION = /^(?:explanation|solution|reason|hint)\s*[:.\-]\s*(.*)$/i;
const ANSWER_KEY_HEADING =
  /^(?:answer\s*keys?|answers|key\s*(?:to\s*)?answers?|solutions)\s*:?\s*$/i;

/** "1-B, 2-C 3.(a) 4 D" → {1: 'B', 2: 'C', 3: 'A', 4: 'D'} */
function parseKey(text: string) {
  const key = new Map<number, string>();
  const re =
    /(\d{1,3})\s*[.):\-=]?\s*\(?([A-Ha-h](?:\s*[,&]\s*[A-Ha-h])*|true|false|T|F)\)?(?=[\s,;]|$)/gi;
  for (const m of text.matchAll(re)) key.set(Number(m[1]), m[2]!.toUpperCase());
  // Numeric answers need a separator ("5 - 10", "5. 9600") so they aren't read as question numbers.
  for (const m of text.matchAll(/(\d{1,3})\s*[.):\-=]\s*(-?\d+(?:\.\d+)?)(?=[\s,;]|$)/g))
    if (!key.has(Number(m[1]))) key.set(Number(m[1]), m[2]!);
  return key;
}

function letters(s: string) {
  return [...s.toUpperCase().matchAll(/\b([A-H])\b/g)].map((m) => m[1]!.charCodeAt(0) - 65);
}

function blank(prompt: string): ImportedQuestion {
  return {
    type: 'SINGLE_CHOICE',
    prompt,
    options: [],
    answer: null,
    value: null,
    explanation: null,
    difficulty: null,
    topic: null,
    points: null,
    answerByAi: false,
  };
}

/** Applies an answer like "B", "A, C", "True" or "42" to a question. */
function applyAnswer(q: ImportedQuestion, raw: string) {
  const a = raw.trim().replace(/^[(\[]|[)\]]$/g, '');
  if (/^(true|t)$/i.test(a) || /^(false|f)$/i.test(a)) {
    q.answer = /^t/i.test(a);
    return;
  }
  if (q.options.length) {
    const idx = letters(a.split(/\s+[-–:]\s+/)[0] ?? a);
    if (idx.length) {
      q.options.forEach((o, i) => (o.correct = idx.includes(i)));
      return;
    }
    // "Answer: Paris" → match by option text
    const hit = q.options.findIndex((o) => o.text.toLowerCase() === a.toLowerCase());
    if (hit >= 0) q.options.forEach((o, i) => (o.correct = i === hit));
    return;
  }
  const n = Number(a.replace(/,/g, ''));
  if (a && Number.isFinite(n)) q.value = n;
}

function finish(q: ImportedQuestion): ImportedQuestion {
  q.prompt = q.prompt.replace(/\s+/g, ' ').trim();
  q.options = q.options
    .map((o) => ({ ...o, text: o.text.replace(/\s+/g, ' ').trim() }))
    .filter((o) => o.text);
  const tf = q.options.length === 2 && q.options.every((o) => /^(true|false)$/i.test(o.text));
  if (tf) {
    const c = q.options.find((o) => o.correct);
    q.answer = c ? /^true$/i.test(c.text) : q.answer;
    q.options = [];
    q.type = 'TRUE_FALSE';
  } else if (q.options.length >= 2) {
    q.type = q.options.filter((o) => o.correct).length > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
  } else if (q.answer !== null || /\(?\s*true\s*\/\s*false\s*\)?/i.test(q.prompt)) {
    q.type = 'TRUE_FALSE';
    q.prompt = q.prompt.replace(/\(?\s*true\s*\/\s*false\s*\)?\s*[.?]?$/i, '').trim() || q.prompt;
  } else if (q.value !== null) {
    q.type = 'NUMERIC';
  } else {
    q.type = 'UNSUPPORTED';
  }
  return q;
}

/**
 * Reads questions from plain text without AI. Understands the common layouts:
 *   1. Question text            Q2) …            (3) …
 *   A) option  (b) option  c. option   — one per line or all on one line
 *   Answer: B   Ans: a, c   Correct option: (d)   Answer: True   Answer: 42
 *   Explanation: …
 * and an "Answer key" section at the end (1-B, 2-C …).
 */
export function parseQuestionText(text: string): ImportedQuestion[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^page\s*\d+(\s*of\s*\d+)?$/i.test(l) && !/^\d+$/.test(l));

  // Answer key at the end
  let key = new Map<number, string>();
  const keyAt = lines.findIndex((l) => ANSWER_KEY_HEADING.test(l));
  let body = lines;
  if (keyAt >= 0) {
    key = parseKey(lines.slice(keyAt + 1).join(' '));
    body = lines.slice(0, keyAt);
  }

  const out: { n: number; q: ImportedQuestion; last: 'prompt' | 'option' | 'explanation' }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (const line of body) {
    const qm = QUESTION_START.exec(line);
    const om = OPTION.exec(line);
    // A new question number that isn't just an option like "a) 10"
    if (qm && !(om && cur && cur.q.options.length > 0 && /^[A-Ha-h]$/.test(line[0] ?? ''))) {
      const n = Number(qm[1] ?? qm[3]);
      const rest = (qm[2] ?? qm[4] ?? '').trim();
      // Numbered lines right after a question with no options yet may be sub-points; only start a
      // new question when the number moves forward.
      if (
        !cur ||
        n > cur.n ||
        cur.q.options.length > 0 ||
        cur.q.answer !== null ||
        cur.q.value !== null
      ) {
        cur = { n, q: blank(rest), last: 'prompt' };
        out.push(cur);
        splitInline(cur);
        continue;
      }
    }
    if (!cur) continue;
    const am = ANSWER.exec(line);
    if (am && am[1]) {
      applyAnswer(cur.q, am[1]);
      cur.last = 'prompt';
      continue;
    }
    const em = EXPLANATION.exec(line);
    if (em) {
      cur.q.explanation = em[1] || '';
      cur.last = 'explanation';
      continue;
    }
    if (om) {
      const idx = om[1]!.toUpperCase().charCodeAt(0) - 65;
      if (idx === cur.q.options.length) {
        cur.q.options.push({ text: om[2] ?? '', correct: false });
        cur.last = 'option';
        splitInline(cur);
        continue;
      }
    }
    // Continuation of the previous part
    if (cur.last === 'option' && cur.q.options.length) cur.q.options.at(-1)!.text += ` ${line}`;
    else if (cur.last === 'explanation')
      cur.q.explanation = `${cur.q.explanation ?? ''} ${line}`.trim();
    else {
      cur.q.prompt += ` ${line}`;
      splitInline(cur);
    }
  }

  for (const { n, q } of out) {
    const k = key.get(n);
    if (k) applyAnswer(q, k);
  }
  return out.map((o) => finish(o.q)).filter((q) => q.prompt.length >= 3);
}

/** "What is X? A) 1 B) 2 C) 3 D) 4" on one line → prompt + options. */
function splitInline(cur: { q: ImportedQuestion; last: string }) {
  const target =
    cur.last === 'option' && cur.q.options.length ? cur.q.options.at(-1)!.text : cur.q.prompt;
  const marks = [...target.matchAll(INLINE_OPTIONS)];
  // Needs consecutive letters starting where the options so far end (A, B, C…).
  const start = cur.last === 'option' ? cur.q.options.length : 0;
  const seq: RegExpMatchArray[] = [];
  for (const m of marks) {
    const idx = m[1]!.toUpperCase().charCodeAt(0) - 65;
    if (idx === start + seq.length) seq.push(m);
  }
  if (cur.last === 'option' ? seq.length < 1 : seq.length < 2) return;
  const head = target.slice(0, seq[0]!.index!).trim();
  const parts = seq.map((m, i) =>
    target
      .slice(m.index! + m[0].length, i + 1 < seq.length ? seq[i + 1]!.index! : undefined)
      .trim(),
  );
  if (cur.last === 'option') cur.q.options.at(-1)!.text = head;
  else cur.q.prompt = head;
  for (const p of parts) cur.q.options.push({ text: p, correct: false });
  cur.last = 'option';
}

/** Splits long text into parts at question boundaries so each part fits one request. */
export function splitForImport(text: string, max = IMPORT_CHUNK_CHARS): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const parts: string[] = [];
  let cur: string[] = [];
  let len = 0;
  const keyAt = lines.findIndex((l) => ANSWER_KEY_HEADING.test(l.trim()));
  const keyText = keyAt >= 0 ? lines.slice(keyAt).join('\n') : '';
  const body = keyAt >= 0 ? lines.slice(0, keyAt) : lines;
  for (const l of body) {
    const startsQuestion = QUESTION_START.test(l.trim());
    if (len + l.length > max && startsQuestion && cur.length) {
      parts.push(cur.join('\n'));
      cur = [];
      len = 0;
    }
    cur.push(l);
    len += l.length + 1;
  }
  if (cur.length) parts.push(cur.join('\n'));
  // Every part gets the answer key so answers can be matched.
  return keyText ? parts.map((p) => `${p}\n${keyText}`.slice(0, max * 2)) : parts;
}

// ───────── Saving reviewed questions ─────────

export const bulkQuestionsSchema = z.object({
  questions: z.array(z.unknown()).min(1, 'Nothing to import').max(300, 'Up to 300 at a time'),
  skipDuplicates: z.boolean().default(true),
});
export type BulkQuestionsInput = z.infer<typeof bulkQuestionsSchema>;

/** Normalised question text for duplicate checks. */
export function questionKey(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
