'use client';

import { Fragment, useRef, useState } from 'react';
import { game } from '@/lib/gameState';
import type { OperatorState, Question, QuestionInput } from '@/lib/types';
import { LETTERS, MAX_OPTIONS, MIN_OPTIONS } from '@/lib/types';
import { SAMPLE_CSV, download, parseQuestionsCsv, questionsToCsv } from '@/lib/csv';
import type { Act } from './ShowTab';

function emptyDraft(points: number): QuestionInput {
  return { category: '', prompt: '', options: ['', ''], correct: 0, points, note: '' };
}

function Editor({
  initial,
  onSave,
  onCancel,
}: {
  initial: QuestionInput;
  onSave: (q: QuestionInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<QuestionInput>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<QuestionInput>) => setD((x) => ({ ...x, ...patch }));

  const addOption = () => set({ options: [...d.options, ''] });
  const removeOption = (i: number) => {
    const options = d.options.filter((_, j) => j !== i);
    // Keep the same option marked correct if it survives; otherwise fall back to A.
    const correct = d.correct === i ? 0 : d.correct > i ? d.correct - 1 : d.correct;
    set({ options, correct });
  };

  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const ok = await onSave(d);
        setSaving(false);
        if (ok) onCancel();
      }}
    >
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <div>
          <label className="label">Category (tile label)</label>
          <input className="input mt-1" value={d.category} maxLength={40} onChange={(e) => set({ category: e.target.value })} required />
        </div>
        <div>
          <label className="label">Points</label>
          <input
            className="input mt-1"
            inputMode="numeric"
            value={d.points ?? 10}
            onChange={(e) => set({ points: Number(e.target.value.replace(/\D/g, '') || 0) })}
          />
        </div>
      </div>
      <div>
        <label className="label">Question</label>
        <textarea className="input mt-1" rows={2} maxLength={400} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} required />
      </div>
      <div>
        <label className="label">
          Options ({d.options.length} of {MAX_OPTIONS}) — click the letter to mark the correct one
        </label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {d.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ correct: i })}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                  d.correct === i ? 'border-good bg-good text-black' : 'border-white/20 text-muted'
                }`}
                title="Mark as correct"
              >
                {LETTERS[i]}
              </button>
              <input
                className="input"
                value={o}
                maxLength={120}
                placeholder={`Option ${LETTERS[i]}`}
                onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? e.target.value : x)) })}
                required
              />
              <button
                type="button"
                className="btn btn-sm !px-2"
                disabled={d.options.length <= MIN_OPTIONS}
                onClick={() => removeOption(i)}
                title={d.options.length <= MIN_OPTIONS ? `A question needs at least ${MIN_OPTIONS} options` : 'Remove this option'}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {d.options.length < MAX_OPTIONS && (
          <button type="button" className="btn btn-sm mt-2" onClick={addOption}>
            + Add option
          </button>
        )}
      </div>
      <div>
        <label className="label">Note (optional — operator only, never on the big screen)</label>
        <input className="input mt-1" maxLength={300} value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-gold" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export function QuestionsTab({ state, act }: { state: OperatorState; act: Act }) {
  const [editing, setEditing] = useState<QuestionInput | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const { questions, errors } = parseQuestionsCsv(await file.text());
    if (errors.length) {
      setImportMsg({ ok: false, text: errors.slice(0, 6).join(' ') + (errors.length > 6 ? ` …and ${errors.length - 6} more.` : '') });
      return;
    }
    if (!questions.length) {
      setImportMsg({ ok: false, text: 'No questions found in that file.' });
      return;
    }
    if (!confirm(`Replace the board with ${questions.length} questions from "${file.name}"? Played results for the old board are dropped.`)) return;
    const ok = await act(game.replaceQuestions(questions));
    setImportMsg(ok ? { ok: true, text: `Loaded ${questions.length} questions.` } : null);
  };

  const live = state.round?.questionId;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-gold" disabled={!!editing} onClick={() => setEditing(emptyDraft(state.settings.questionPoints ?? 10))}>
          + Add question
        </button>
        <button className="btn" disabled={!!state.round} onClick={() => fileRef.current?.click()} title={state.round ? 'Finish the live tile first' : ''}>
          Import CSV…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
        <button className="btn" onClick={() => download('quiz-questions.csv', questionsToCsv(state.questions))}>
          Export CSV
        </button>
        <button className="btn" onClick={() => download('quiz-questions-template.csv', SAMPLE_CSV)}>
          CSV template
        </button>
        <span className="ml-auto text-sm text-muted">
          {state.questions.length} tiles
        </span>
      </div>
      {importMsg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${importMsg.ok ? 'bg-good/15 text-green-300' : 'bg-bad/15 text-red-300'}`}>{importMsg.text}</p>
      )}

      {editing && !editing.id && (
        <Editor initial={editing} onCancel={() => setEditing(null)} onSave={(q) => act(game.upsertQuestion(q))} />
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {state.questions.map((q: Question, i) => (
          <Fragment key={q.id}>
          {editing?.id === q.id ? (
            <Editor initial={editing} onCancel={() => setEditing(null)} onSave={(x) => act(game.upsertQuestion(x))} />
          ) : (
            <div className="panel flex items-start gap-3 p-3">
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button className="text-xs text-muted hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => act(game.moveQuestion(q.id, i - 1))}>▲</button>
                <button className="text-xs text-muted hover:text-white disabled:opacity-20" disabled={i === state.questions.length - 1} onClick={() => act(game.moveQuestion(q.id, i + 1))}>▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">Tile {i + 1}</span>
                  <span className="font-bold">{q.category}</span>
                  <span className="rounded bg-sky-500/25 px-1.5 font-bold text-sky-200">{q.options.length} options</span>
                  <span className="text-muted">{q.points} pts</span>
                  {state.played[q.id] && <span className="text-muted">· played</span>}
                  {live === q.id && <span className="font-bold text-gold">● LIVE</span>}
                </div>
                <p className="mt-1 text-sm">{q.prompt}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  {q.options.map((o, j) => (
                    <span key={j} className={j === q.correct ? 'font-semibold text-good' : 'text-muted'}>
                      {`${LETTERS[j]}. `}
                      {o}
                      {j === q.correct ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                {q.note && <p className="mt-1 text-xs italic text-muted">{q.note}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn btn-sm" disabled={!!editing} onClick={() => setEditing({ ...q })}>Edit</button>
                <button
                  className="btn btn-sm btn-bad"
                  disabled={live === q.id}
                  onClick={() => confirm(`Delete "${q.category}"?`) && act(game.deleteQuestion(q.id))}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
