// Admin > Trivia questions: the spreadsheet Kelly downloads and uploads back. The columns follow her engine's
// csvToBank (category, question, correct, wrong1-3, note, source). The header starts with "Category", which csvToBank
// skips on upload, and categories are written by name, which validateBank also accepts.
export const QUESTION_COLUMNS = [
  'Category',
  'Question',
  'Right answer',
  'Wrong 1',
  'Wrong 2',
  'Wrong 3',
  'Note',
  'Source',
] as const;

export interface QuestionRow {
  id: string;
  cat: string;
  q: string;
  a: string;
  wrong: string[];
  note: string | null;
  source: string | null;
}

const cell = (t: string | null | undefined): string => {
  const s = t ?? '';
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for Excel and Google Sheets: UTF-8 with a BOM (so Excel keeps accents), one question per row. */
export function questionsCsv(cats: { id: string; name: string }[], rows: QuestionRow[]): string {
  const name = new Map(cats.map((c) => [c.id, c.name]));
  const lines = rows.map((r) =>
    [name.get(r.cat) ?? r.cat, r.q, r.a, r.wrong[0], r.wrong[1], r.wrong[2], r.note, r.source].map(cell).join(','),
  );
  return `﻿${[QUESTION_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
