import { z } from 'zod';
import type { ImportedCoding, ImportedQuestion } from '@arc/types';

/** Text sent per request (the browser splits big files into parts). */
export const IMPORT_CHUNK_CHARS = 6000;

export const importParseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, 'No text found')
    // Parts are ~6000 characters; a coding question (tests + solutions) is always sent whole.
    .max(40_000, 'One question is too long to import — split its test cases'),
  /** Let AI suggest answers the file doesn't give (marked for checking). */
  fillAnswers: z.boolean().default(false),
  useAi: z.boolean().default(true),
  /** The folder the questions will go into: "already in the bank" checks only that folder. */
  folder: z.string().trim().max(80).optional(),
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

/** Collapses spacing in the text of a prompt but keeps ``` code blocks exactly. */
function tidyPrompt(prompt: string) {
  return prompt
    .split(/(```[^\n]*\n[\s\S]*?\n```)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\s+/g, ' ').trim()))
    .filter(Boolean)
    .join('\n');
}

const FENCE_OPEN = /^```\s*([A-Za-z0-9_-]*)\s*$/;

/** A ``` block: its lines without the common indentation (tabs as 4 spaces). */
function codeBlock(raw: string[]) {
  const lines = raw.map((l) => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
  const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(cut))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function finish(q: ImportedQuestion): ImportedQuestion {
  q.prompt = tidyPrompt(q.prompt);
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

// ───────── Coding questions ─────────
//
//   CODING QUESTION 1
//   Marks: 5                     Difficulty: Medium      Topic: Scenario 1
//   Languages: C, Python         Marking: Test cases     Output check: Flexible
//   Time limit: 2000 ms          Compile penalty: 25%
//   Statement:
//   …any text, kept line by line…
//   Sample test 1  /  Hidden test 3
//   Input:   ``` … ```
//   Output:  ``` … ```
//   Starter code (C):            ``` … ```
//   Reference solution (Python): ``` … ```
//   Marking scheme:              - Reads the input correctly (1 mark)   ← AI marking only
//   END CODING QUESTION

const CODING_START = /^coding\s+question\b\s*(?:no\.?\s*)?(\d{1,3})?\s*[.:)\-–]?\s*(.*)$/i;
const CODING_END = /^end(?:\s+of)?\s+coding(?:\s+question)?\s*\.?$/i;
const C_FIELD =
  /^(marks?|points|difficulty|topic|languages?|marking|mode|output\s+check|compare|time\s+limit|compile\s+penalty)\s*[:=\-–]\s*(.+)$/i;
const C_STATEMENT = /^(?:statement|problem(?:\s+statement)?|question)\s*:\s*(.*)$/i;
const C_TEST =
  /^(?:(sample|hidden)\s+test(?:\s*case)?\s*(\d+)?|test(?:\s*case)?\s*(\d+)?\s*\(\s*(sample|hidden)[^)]*\))\s*:?\s*$/i;
const C_INPUT = /^input\s*:?\s*(.*)$/i;
const C_OUTPUT = /^(?:expected\s+)?output\s*:?\s*(.*)$/i;
const C_STARTER = /^starter(?:\s+code)?\s*\(\s*([^)]+?)\s*\)\s*:?\s*$/i;
const C_SOLUTION = /^(?:reference\s+)?solution\s*\(\s*([^)]+?)\s*\)\s*:?\s*$/i;
const C_RUBRIC = /^(?:marking\s+scheme|rubric)\s*:?\s*$/i;
const C_RUBRIC_ITEM = /^[-•*]?\s*(.+?)\s*[(\[]\s*(\d+(?:\.\d+)?)\s*marks?\s*[)\]]\s*$/i;

/** True when the text has a CODING QUESTION block (read by the rules, never by AI). */
export function hasCodingQuestions(text: string) {
  return text.split('\n').some((l) => CODING_START.test(l.trim()));
}

function codeLang(raw: string): 'c' | 'python' | 'arduino' | null {
  const t = raw.trim().toLowerCase();
  if (/^(c|c language|ansi c)$/.test(t)) return 'c';
  if (/^(python|python\s*3|py)$/.test(t)) return 'python';
  if (/^(arduino|embedded c|ino|arduino c\+\+)/.test(t)) return 'arduino';
  return null;
}

/** Reads one CODING QUESTION block (the lines after its heading, END line excluded). */
function parseCodingBlock(title: string, raw: string[]): ImportedQuestion {
  const q = blank('');
  q.type = 'CODING';
  const c: ImportedCoding = {
    languages: [],
    starter: {},
    testCases: [],
    timeLimitMs: 2000,
    compare: 'flexible',
    mode: 'tests',
    rubric: [],
    compilePenaltyPct: 25,
    solution: null,
    solutionLanguages: [],
    warnings: [],
  };
  const statement: string[] = title ? [title] : [];
  type Target =
    | { kind: 'statement' }
    | { kind: 'input' | 'output'; test: ImportedCoding['testCases'][number] }
    | { kind: 'starter' | 'solution'; lang: 'c' | 'python' | 'arduino' }
    | { kind: 'rubric' }
    | { kind: 'none' };
  let target: Target = { kind: 'none' };
  let test: ImportedCoding['testCases'][number] | null = null;
  let loose: string[] = []; // un-fenced input/output lines
  const flushLoose = () => {
    if ((target.kind === 'input' || target.kind === 'output') && loose.length)
      target.test[target.kind] = loose.join('\n').replace(/\n+$/, '');
    loose = [];
  };
  const put = (code: string) => {
    if (target.kind === 'input' || target.kind === 'output') target.test[target.kind] = code;
    else if (target.kind === 'starter') c.starter[target.lang] = code;
    else if (target.kind === 'solution') {
      if (!c.solution) c.solution = { language: target.lang, code };
      if (!c.solutionLanguages.includes(target.lang)) c.solutionLanguages.push(target.lang);
    } else if (target.kind === 'statement') statement.push('```', code, '```');
  };

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!.replace(/\s+$/, '');
    const t = line.trim();
    const open = FENCE_OPEN.exec(t);
    if (open) {
      let j = i + 1;
      while (j < raw.length && raw[j]!.trim() !== '```') j++;
      loose = [];
      put(codeBlock(raw.slice(i + 1, j)));
      // Input/Output right after a fence go back to waiting for the next part.
      if (target.kind !== 'statement') target = { kind: 'none' };
      i = j;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = C_TEST.exec(t))) {
      flushLoose();
      test = { input: '', output: '', sample: /sample/i.test(m[1] ?? m[4] ?? '') };
      c.testCases.push(test);
      target = { kind: 'none' };
      continue;
    }
    if (test && (m = C_INPUT.exec(t)) && target.kind !== 'statement') {
      flushLoose();
      target = { kind: 'input', test };
      if (m[1]) loose.push(m[1]);
      continue;
    }
    if (test && (m = C_OUTPUT.exec(t)) && target.kind !== 'statement') {
      flushLoose();
      target = { kind: 'output', test };
      if (m[1]) loose.push(m[1]);
      continue;
    }
    if ((m = C_STARTER.exec(t)) || (m = C_SOLUTION.exec(t))) {
      flushLoose();
      const lang = codeLang(m[1]!);
      if (!lang) c.warnings.push(`Unknown language "${m[1]}"`);
      target = lang ? { kind: C_STARTER.test(t) ? 'starter' : 'solution', lang } : { kind: 'none' };
      continue;
    }
    if (C_RUBRIC.test(t)) {
      flushLoose();
      target = { kind: 'rubric' };
      continue;
    }
    if ((m = C_STATEMENT.exec(t)) && target.kind !== 'statement') {
      flushLoose();
      target = { kind: 'statement' };
      if (m[1]) statement.push(m[1]);
      continue;
    }
    if (target.kind === 'statement') {
      statement.push(t);
      continue;
    }
    if (target.kind === 'input' || target.kind === 'output') {
      loose.push(line);
      continue;
    }
    if (target.kind === 'rubric') {
      if (!t) continue;
      const r = C_RUBRIC_ITEM.exec(t);
      if (r) c.rubric.push({ text: r[1]!.trim(), points: Number(r[2]) });
      else c.warnings.push(`Marking scheme line needs "(N marks)": ${t.slice(0, 60)}`);
      continue;
    }
    if ((m = C_FIELD.exec(t))) {
      const k = m[1]!.toLowerCase();
      const v = m[2]!.trim();
      if (/^(marks?|points)$/.test(k)) {
        const n = Number(v.replace(/[^\d.]/g, ''));
        if (n >= 1 && n <= 100) q.points = Math.round(n);
      } else if (k === 'difficulty') {
        const d = v.toUpperCase();
        if (d === 'EASY' || d === 'MEDIUM' || d === 'HARD') q.difficulty = d;
      } else if (k === 'topic') q.topic = v.slice(0, 80);
      else if (/^languages?$/.test(k)) {
        for (const part of v.split(/[,/&]|\band\b/)) {
          const l = codeLang(part);
          if (l && !c.languages.includes(l)) c.languages.push(l);
          else if (part.trim() && !l) c.warnings.push(`Unknown language "${part.trim()}"`);
        }
      } else if (k === 'marking' || k === 'mode') c.mode = /\bai\b/i.test(v) ? 'ai' : 'tests';
      else if (k === 'output check' || k === 'compare')
        c.compare = /exact/i.test(v) ? 'exact' : 'flexible';
      else if (k === 'time limit') {
        const n = Number(v.replace(/[^\d.]/g, ''));
        const ms = /\bs(ec(ond)?s?)?\b/i.test(v) && !/ms/i.test(v) ? n * 1000 : n;
        if (ms >= 500 && ms <= 10_000) c.timeLimitMs = Math.round(ms);
      } else if (k === 'compile penalty') {
        const n = Number(v.replace(/[^\d.]/g, ''));
        if (n >= 0 && n <= 100) c.compilePenaltyPct = Math.round(n);
      }
      continue;
    }
    if (t) c.warnings.push(`Not understood: ${t.slice(0, 60)}`);
  }
  flushLoose();
  if (!c.languages.length) c.languages = c.solution ? [c.solution.language] : ['c', 'python'];
  q.prompt = statement
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  q.coding = c;
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
  const raw = text.replace(/\r/g, '').split('\n');
  if (!raw.some((l) => CODING_START.test(l.trim()))) return parseChoiceText(text);
  // CODING QUESTION blocks are read on their own; everything around them as MCQs (in order).
  const keyAt = raw.findIndex((l) => ANSWER_KEY_HEADING.test(l.trim()));
  const keyText = keyAt >= 0 ? `\n${raw.slice(keyAt).join('\n')}` : '';
  const body = keyAt >= 0 ? raw.slice(0, keyAt) : raw;
  const out: ImportedQuestion[] = [];
  let rest: string[] = [];
  const flushRest = () => {
    if (rest.some((l) => l.trim())) out.push(...parseChoiceText(rest.join('\n') + keyText));
    rest = [];
  };
  for (let i = 0; i < body.length; i++) {
    const m = CODING_START.exec(body[i]!.trim());
    if (!m) {
      rest.push(body[i]!);
      continue;
    }
    flushRest();
    let j = i + 1;
    let inCode = false;
    for (; j < body.length; j++) {
      const t = body[j]!.trim();
      if (inCode ? t === '```' : FENCE_OPEN.test(t)) inCode = !inCode;
      else if (!inCode && (CODING_END.test(t) || CODING_START.test(t))) break;
    }
    out.push(parseCodingBlock((m[2] ?? '').trim(), body.slice(i + 1, j)));
    i = j < body.length && CODING_END.test(body[j]!.trim()) ? j : j - 1;
  }
  flushRest();
  return out;
}

function parseChoiceText(text: string): ImportedQuestion[] {
  // Code between ``` lines is kept exactly (line breaks and indentation) as one item.
  const raw = text.replace(/\r/g, '').split('\n');
  const lines: (string | { code: string; lang: string })[] = [];
  for (let i = 0; i < raw.length; i++) {
    const open = FENCE_OPEN.exec(raw[i]!.trim());
    if (open) {
      let j = i + 1;
      while (j < raw.length && raw[j]!.trim() !== '```') j++;
      lines.push({ code: codeBlock(raw.slice(i + 1, j)), lang: open[1]!.toLowerCase() });
      i = j;
      continue;
    }
    const l = raw[i]!.replace(/\s+/g, ' ').trim();
    if (l && !/^page\s*\d+(\s*of\s*\d+)?$/i.test(l) && !/^\d+$/.test(l)) lines.push(l);
  }

  // Answer key at the end
  let key = new Map<number, string>();
  const keyAt = lines.findIndex((l) => typeof l === 'string' && ANSWER_KEY_HEADING.test(l));
  let body = lines;
  if (keyAt >= 0) {
    key = parseKey(
      lines
        .slice(keyAt + 1)
        .filter((l) => typeof l === 'string')
        .join(' '),
    );
    body = lines.slice(0, keyAt);
  }

  const out: { n: number; q: ImportedQuestion; last: 'prompt' | 'option' | 'explanation' }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (const line of body) {
    if (typeof line !== 'string') {
      if (!cur) continue;
      cur.q.prompt = `${cur.q.prompt.trimEnd()}\n\`\`\`${line.lang}\n${line.code}\n\`\`\`\n`;
      cur.last = 'prompt';
      continue;
    }
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
      cur.q.prompt += cur.q.prompt.endsWith('\n') ? line : ` ${line}`;
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
  // Never look for options inside a code block.
  const fenceEnd = cur.last === 'option' ? -1 : target.lastIndexOf('```');
  const marks = [...target.matchAll(INLINE_OPTIONS)].filter((m) => m.index! > fenceEnd);
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
  let inCode = false;
  let inCoding = false;
  for (const l of body) {
    if (inCode ? l.trim() === '```' : FENCE_OPEN.test(l.trim())) inCode = !inCode;
    const codingStart = !inCode && CODING_START.test(l.trim());
    if (codingStart) inCoding = true;
    // A coding question is always sent whole, in a part of its own.
    const startsQuestion = !inCode && (codingStart || (!inCoding && QUESTION_START.test(l.trim())));
    if (inCoding && !codingStart && !inCode && CODING_END.test(l.trim())) inCoding = false;
    if (codingStart && cur.length) {
      parts.push(cur.join('\n'));
      cur = [];
      len = 0;
    }
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
  return keyText ? parts.map((p) => `${p}\n${keyText}`.slice(0, 40_000)) : parts;
}

// ───────── Saving reviewed questions ─────────

export const bulkQuestionsSchema = z.object({
  questions: z.array(z.unknown()).min(1, 'Nothing to import').max(300, 'Up to 300 at a time'),
  skipDuplicates: z.boolean().default(true),
  /** Every question goes into this folder (duplicates are only checked inside it). */
  folder: z
    .string()
    .trim()
    .max(80, 'Folder name: up to 80 characters')
    .optional()
    .transform((v) => v || null),
});
export type BulkQuestionsInput = z.infer<typeof bulkQuestionsSchema>;

/** Normalised question text for duplicate checks. */
export function questionKey(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
