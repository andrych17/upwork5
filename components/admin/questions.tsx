'use client';

// Admin > Trivia questions (Kelly 7 Nov): download the questions as a spreadsheet, edit them, upload them back.
// The file is checked in the browser with Kelly's engine (csvToBank + validateBank, the same check trivia-act runs on
// the question set), so nothing that would break a game can be saved. admin_trivia_import (schema section 36) saves it.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, useLoad } from '@/lib/admin';
import type { TriviaCategory } from '@/lib/trivia';
import { questionsCsv, type QuestionRow } from '@/lib/trivia-csv';

interface Checked {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: number[];
  bank: {
    categories: TriviaCategory[];
    questions: { cat: number; q: string; a: string; wrong: string[]; note: string; source: string }[];
  };
}

interface Engine {
  csvToBank(text: string, categories: TriviaCategory[]): unknown;
  validateBank(input: unknown): Checked;
}

type Loaded = { cats: TriviaCategory[]; rows: QuestionRow[]; error: boolean };

const PAGE = 1000;
const MAX_FILE_BYTES = 2_000_000;
const SHOW_PROBLEMS = 25;

/** Kelly's engine is a browser script (it sets self.MeetDoTrivia). Loaded only here, when a file is picked. */
async function loadEngine(): Promise<Engine> {
  const mod = (await import('@/supabase/functions/_shared/trivia.js')) as { default?: Engine };
  const engine = (globalThis as { MeetDoTrivia?: Engine }).MeetDoTrivia ?? mod.default;
  if (!engine) throw new Error('trivia engine not loaded');
  return engine;
}

const byId = (a: QuestionRow, b: QuestionRow) => a.id.localeCompare(b.id, 'en', { numeric: true });

export default function AdminQuestions() {
  const { supabase } = useAdmin();
  const [check, setCheck] = useState<{ file: string; result: Checked } | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const cats = await supabase.from('trivia_categories').select('id, name, color').order('sort').order('id');
    if (cats.error) return { cats: [], rows: [], error: true };
    const rows: QuestionRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await supabase
        .from('trivia_questions')
        .select('id, cat, q, a, wrong, note, source')
        .eq('active', true)
        .order('id')
        .range(from, from + PAGE - 1);
      if (page.error) return { cats: [], rows: [], error: true };
      rows.push(...(page.data as QuestionRow[]));
      if (page.data.length < PAGE) break;
    }
    const order = new Map(cats.data.map((c, i) => [c.id, i]));
    rows.sort((a, b) => (order.get(a.cat) ?? 99) - (order.get(b.cat) ?? 99) || byId(a, b));
    return { cats: cats.data as TriviaCategory[], rows, error: false };
  }, [supabase]);

  const { data, loading, reload } = useLoad(fetchAll);

  const download = () => {
    if (!data) return;
    const blob = new Blob([questionsCsv(data.cats, data.rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meetdoconnect-trivia-questions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pick = async (file: File | undefined) => {
    setMsg(null);
    setCheck(null);
    if (!file || !data) return;
    if (file.size > MAX_FILE_BYTES) {
      setMsg({ text: 'That file is too big. Keep it under 2 MB.', error: true });
      return;
    }
    try {
      const engine = await loadEngine();
      const result = engine.validateBank(engine.csvToBank(await file.text(), data.cats));
      // The engine also warns about categories with few questions; when adding a few, that's expected.
      result.warnings = result.warnings.filter((w) => !/ has only \d+ questions/.test(w));
      setCheck({ file: file.name, result });
    } catch {
      setMsg({ text: 'That file couldn’t be read. Save it as CSV and try again.', error: true });
    }
  };

  const save = async (replace: boolean) => {
    if (!check?.result.ok) return;
    if (
      replace &&
      !window.confirm('Replace all questions with this file? Questions that aren’t in it will be turned off.')
    )
      return;
    const { bank } = check.result;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_trivia_import', {
      p_questions: bank.questions.map((q) => ({
        cat: bank.categories[q.cat].id,
        q: q.q,
        a: q.a,
        wrong: q.wrong,
        note: q.note,
        source: q.source,
      })),
      p_replace: replace,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error, error: true });
      return;
    }
    const d = res.data as { added: number; updated: number; turned_off: number; active: number };
    setMsg({
      text:
        `Saved: ${d.added} added, ${d.updated} updated${replace ? `, ${d.turned_off} turned off` : ''}. ` +
        `${d.active} questions in play. New games use them within a minute.`,
      error: false,
    });
    setCheck(null);
    setInputKey((k) => k + 1);
    reload();
  };

  const counts = (data?.cats ?? []).map((c) => data?.rows.filter((r) => r.cat === c.id).length ?? 0);
  const result = check?.result;

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Trivia questions</h1>
          <p>The questions for Trivia, Trivier, Triviest. Edit them in a spreadsheet and upload them back.</p>
        </div>
      </header>
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Questions in play</h2>
          <button type="button" className="adm-btn" disabled={!data || data.error} onClick={download}>
            Download spreadsheet
          </button>
        </div>
        <div className="adm-card-body">
          {loading && !data ? (
            <p className="adm-empty">Loading…</p>
          ) : data?.error ? (
            <p className="adm-msg adm-msg-error">Could not load the questions. Refresh to try again.</p>
          ) : (
            <ul className="adm-list">
              {data?.cats.map((c, i) => (
                <li key={c.id}>
                  <span>
                    <span className="adm-swatch" style={{ background: c.color }} aria-hidden="true" /> {c.name}
                  </span>
                  <strong>{counts[i]}</strong>
                </li>
              ))}
              <li>
                <span>Total</span>
                <strong>{data?.rows.length ?? 0}</strong>
              </li>
            </ul>
          )}
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Upload questions</h2>
        </div>
        <div className="adm-card-body">
          <ol className="adm-steps">
            <li>Download the spreadsheet above and open it in Google Sheets or Excel.</li>
            <li>
              One question per row. Category is one of the names above. Give the right answer and 2 or 3 wrong ones.
              Note and Source are optional.
            </li>
            <li>
              Save it as CSV. Google Sheets: File › Download › Comma-separated values. Excel: Save As › CSV UTF-8.
            </li>
            <li>Upload it here. Nothing is saved until the file passes the check and you press a button.</li>
          </ol>
          <input
            key={inputKey}
            className="adm-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="Questions spreadsheet (CSV)"
            disabled={!data || data.error || busy}
            onChange={(e) => void pick(e.target.files?.[0])}
          />

          {check && result && (
            <div className="adm-check">
              <p>
                <strong>{check.file}</strong>: {result.bank.questions.length} questions
                {result.bank.categories.map((c, i) => (result.counts[i] ? ` · ${c.name} ${result.counts[i]}` : ''))}
              </p>
              {result.errors.length > 0 && (
                <div className="adm-msg adm-msg-error">
                  <p>Fix these in the spreadsheet, then upload it again:</p>
                  <ul>
                    {result.errors.slice(0, SHOW_PROBLEMS).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  {result.errors.length > SHOW_PROBLEMS && <p>…and {result.errors.length - SHOW_PROBLEMS} more.</p>}
                </div>
              )}
              {result.warnings.length > 0 && (
                <ul className="adm-sub">
                  {result.warnings.slice(0, SHOW_PROBLEMS).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {result.ok && (
                <div className="adm-toolbar">
                  <button
                    type="button"
                    className="adm-btn adm-btn-primary"
                    disabled={busy}
                    onClick={() => void save(false)}
                  >
                    Add and update
                  </button>
                  <button type="button" className="adm-btn" disabled={busy} onClick={() => void save(true)}>
                    Replace all
                  </button>
                  <span className="adm-sub">
                    Add and update keeps every question already here and changes the ones with the same wording. Replace
                    all turns off any question that isn’t in the file.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
