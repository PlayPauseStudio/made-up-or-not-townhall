import Papa from 'papaparse';
import type { LogEntry, OperatorState, Question, QuestionInput } from './types';
import { LETTERS, MIN_OPTIONS } from './types';

/**
 * Question sheet format — one row per board tile, no type column:
 *
 *   category,question,option_a,option_b,option_c,option_d,answer,points,note
 *   Geography,Capital of Australia?,Sydney,Melbourne,Canberra,Perth,C,10,
 *   Animals,Octopuses have three hearts.,True,False,,,A,10,
 *
 * Every row is a question with 2 to 4 options, filled from option_a with no
 * gaps. Headers are matched loosely ("Option A" = "option_a"). `answer` is a
 * letter (A–D), a number (1–4), or the option's text. A `type` column from an
 * older sheet is ignored.
 */
export const SAMPLE_CSV = [
  'category,question,option_a,option_b,option_c,option_d,answer,points,note',
  'Geography,What is the capital of Australia?,Sydney,Melbourne,Canberra,Perth,C,10,',
  'Space,Which planet has a day longer than its year?,Mars,Venus,Jupiter,,B,10,',
  'Animals,Octopuses have three hearts.,True,False,,,A,10,Two pump blood to the gills and one to the body.',
].join('\n');

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADERS: Record<string, string[]> = {
  category: ['category', 'cat', 'tile', 'topic'],
  prompt: ['question', 'prompt', 'statement', 'text'],
  a: ['optiona', 'a', 'option1'],
  b: ['optionb', 'b', 'option2'],
  c: ['optionc', 'c', 'option3'],
  d: ['optiond', 'd', 'option4'],
  answer: ['answer', 'correct', 'correctanswer', 'solution'],
  points: ['points', 'score', 'value'],
  note: ['note', 'notes', 'explanation'],
};

function field(row: Record<string, string>, key: keyof typeof HEADERS): string {
  for (const [h, v] of Object.entries(row)) {
    if (HEADERS[key].includes(norm(h))) return (v ?? '').trim();
  }
  return '';
}

/** Which of `options` the answer cell points at: a letter, a number, or the option's own text. */
function answerIndex(answer: string, options: string[]): number {
  const letter = LETTERS.slice(0, options.length).indexOf(answer.toUpperCase());
  if (letter >= 0) return letter;
  if (/^\d$/.test(answer) && Number(answer) >= 1 && Number(answer) <= options.length) return Number(answer) - 1;
  return options.findIndex((o) => norm(o) === norm(answer));
}

export interface ParseResult {
  questions: QuestionInput[];
  errors: string[];
}

export function parseQuestionsCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const questions: QuestionInput[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const category = field(row, 'category');
    const prompt = field(row, 'prompt');
    if (!category && !prompt) return;
    if (!category) return errors.push(`Row ${line}: no category.`);
    if (!prompt) return errors.push(`Row ${line}: no question.`);

    const pointsRaw = field(row, 'points');
    // Blank = the show's "Points for a right answer" setting (applied by the server).
    const points = pointsRaw ? Number(pointsRaw) : undefined;
    if (points !== undefined && (!Number.isInteger(points) || points < 0)) return errors.push(`Row ${line}: points must be a whole number.`);
    const note = field(row, 'note');
    const answer = field(row, 'answer');
    if (!answer) return errors.push(`Row ${line}: no answer.`);

    // Options fill from A: 2 to 4 of them, no gaps (a gap would shift every letter after it).
    const raw = [field(row, 'a'), field(row, 'b'), field(row, 'c'), field(row, 'd')];
    const count = raw.reduce((n, o, k) => (o ? k + 1 : n), 0);
    const options = raw.slice(0, count);
    const gap = options.findIndex((o) => !o);
    if (gap >= 0) return errors.push(`Row ${line}: option ${LETTERS[gap]} is blank — fill options from A without gaps.`);
    if (count < MIN_OPTIONS) return errors.push(`Row ${line}: a question needs at least ${MIN_OPTIONS} options.`);
    const correct = answerIndex(answer, options);
    if (correct < 0) {
      return errors.push(`Row ${line}: answer "${answer}" doesn't match ${LETTERS.slice(0, count).join('/')} or an option.`);
    }
    questions.push({ category, prompt, options, correct, points, note });
  });

  if (questions.length > 60) errors.push('That is more than 60 questions.');
  return { questions, errors };
}

export function questionsToCsv(questions: Question[]): string {
  return Papa.unparse(
    questions.map((q) => ({
      category: q.category,
      question: q.prompt,
      option_a: q.options[0] ?? '',
      option_b: q.options[1] ?? '',
      option_c: q.options[2] ?? '',
      option_d: q.options[3] ?? '',
      answer: LETTERS[q.correct],
      points: q.points,
      note: q.note,
    })),
  );
}

/** The show log, one row per operator action, with both scores after each. */
export function logToCsv(state: OperatorState, log: LogEntry[]): string {
  const [a, b] = state.teams;
  return Papa.unparse(
    log.map((e) => {
      const at = new Date(e.at);
      return {
        Date: at.toLocaleDateString('en-IN'),
        Time: at.toLocaleTimeString('en-IN', { hour12: false }),
        Event: e.event,
        Team: e.team,
        Category: e.category,
        Question: e.question,
        Detail: e.detail,
        [`${a.name} score`]: e.scoreA,
        [`${b.name} score`]: e.scoreB,
      };
    }),
  );
}

export function download(filename: string, text: string): void {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
