'use client';

import { game } from '@/lib/gameState';
import type { Ack } from '@/lib/realtime';
import type { OperatorState, Phase, Question, Round } from '@/lib/types';
import { LETTERS } from '@/lib/types';
import { download, logToCsv } from '@/lib/csv';

export type Act = (p: Promise<Ack>) => Promise<boolean>;

/*
 * No teams: the questions roll one by one. "Next question" puts the next
 * unplayed one (in question order) straight up on the display; then the
 * options, then the answer, then the next question. Any question can also be
 * picked from the list on the left.
 *
 * Under the hood the game engine still has a "team" on every round; it is never
 * shown, scores nothing (the answer is revealed without a locked team answer),
 * and the CSV template is unchanged.
 */

/** The next unplayed question after `afterId` in question order, wrapping round; null when all are done. */
function nextQuestion(state: OperatorState, afterId?: string): Question | null {
  const qs = state.questions;
  const start = afterId ? qs.findIndex((q) => q.id === afterId) + 1 : 0;
  for (let k = 0; k < qs.length; k++) {
    const q = qs[(start + k) % qs.length];
    if (!state.played[q.id] && q.id !== afterId) return q;
  }
  return null;
}

/** Close whatever is live, then put `q` on the display (question showing, options hidden). */
async function goTo(act: Act, q: Question) {
  await act(game.closeRound());
  if (await act(game.openTile(q.id))) await act(game.showQuestion());
}

// ── Left: every question, in order ───────────────────────────────────────────

function QuestionList({ state, act }: { state: OperatorState; act: Act }) {
  const live = state.round?.questionId;
  const done = state.questions.filter((q) => state.played[q.id]).length;
  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between text-xs">
        <h2 className="label">Questions</h2>
        <span className="text-muted">
          {done}/{state.questions.length} done
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1">
          {state.questions.map((q, i) => {
            const played = !!state.played[q.id];
            const isLive = live === q.id;
            return (
              <div
                key={q.id}
                className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                  isLive ? 'border-gold bg-gold/15' : played ? 'border-white/5 text-white/40' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                  disabled={played || isLive}
                  onClick={() => void goTo(act, q)}
                  title={played ? 'Done' : 'Put this question on the display now'}
                >
                  <span className="w-5 shrink-0 text-right text-muted">{i + 1}</span>
                  <span className="truncate font-semibold">{q.category}</span>
                  <span className="ml-auto shrink-0">
                    {isLive ? <b className="text-gold">● LIVE</b> : played ? '✓' : ''}
                  </span>
                </button>
                {played && !isLive && (
                  <button
                    className="hidden rounded px-1 text-[10px] text-muted hover:bg-white/10 group-hover:block"
                    onClick={() => confirm(`Mark "${q.category}" as not done, so it can be shown again?`) && act(game.resetTile(q.id))}
                  >
                    reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Centre: the live question ────────────────────────────────────────────────

const STEPS = ['Question', 'Options', 'Answer'];

/** 0 = question not up yet, 1 = options to show, 2 = answer to reveal, 3 = done. */
function stepOf(r: Round, optionCount: number): number {
  if (!r.questionShown) return 0;
  if (r.answerRevealed) return 3;
  if (r.revealedOptions.length < optionCount) return 1;
  return 2;
}

function LiveQuestion({ state, act }: { state: OperatorState; act: Act }) {
  const r = state.round;
  if (!r) {
    const upNext = nextQuestion(state);
    return (
      <div className="panel flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        {upNext ? (
          <>
            <p className="text-lg font-semibold">
              Up next: question {state.questions.indexOf(upNext) + 1} · {upNext.category}
            </p>
            <button className="btn btn-gold !px-6 !py-3 !text-base" onClick={() => void goTo(act, upNext)}>
              Show question {state.questions.indexOf(upNext) + 1} on display →
            </button>
            <p className="text-xs text-muted">Or click any question on the left.</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">All {state.questions.length} questions are done.</p>
            <button className="btn btn-gold" onClick={() => act(game.setPhase('final'))}>
              Final screen →
            </button>
          </>
        )}
        <p className="mt-2 text-xs text-muted">
          Display is showing: <b className="text-white">{state.phase}</b>
        </p>
      </div>
    );
  }

  const q = state.questions.find((x) => x.id === r.questionId);
  if (!q) return null;
  const index = state.questions.indexOf(q);
  const step = stepOf(r, q.options.length);
  const upNext = nextQuestion(state, q.id);

  let next: { text: string; run: () => unknown; tone?: string } | null = null;
  if (step === 0) next = { text: 'Show question on display', run: () => act(game.showQuestion()) };
  else if (step === 1) next = { text: 'Show next option', run: () => act(game.revealOption()) };
  else if (step === 2) next = { text: 'Reveal the answer', run: () => act(game.revealAnswer()) };
  else if (upNext) next = { text: `Next question (${state.questions.indexOf(upNext) + 1}) →`, run: () => goTo(act, upNext), tone: 'btn-good' };
  else next = { text: 'All done — final screen', run: () => act(game.setPhase('final')), tone: 'btn-good' };

  // One step back, whatever the last step was.
  const stepBack = () => {
    if (r.answerRevealed) return act(game.goToStep(3)); // un-reveal: the question is not done any more
    if (r.revealedOptions.length) return act(game.hideOption(r.revealedOptions[r.revealedOptions.length - 1]));
    if (r.questionShown) return act(game.hideQuestion());
    return act(game.closeRound());
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <ol className="grid grid-cols-3 gap-1.5">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold ${
              i === step ? 'border-gold bg-gold/15 text-gold' : i < step ? 'border-good/30 text-good' : 'border-white/10 text-muted'
            }`}
          >
            <span className="mr-1 opacity-70">{i < step ? '✓' : i + 1}</span>
            {label}
            {label === 'Options' && ` (${r.revealedOptions.length}/${q.options.length})`}
          </li>
        ))}
      </ol>

      <div className="panel p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-black">{q.category}</span>
          <span className="text-xs font-semibold text-muted">
            Question {index + 1} of {state.questions.length} · {q.options.length} options
          </span>
          <span className={`text-xs font-semibold ${r.questionShown ? 'text-good' : 'text-muted'}`}>
            {r.questionShown ? '● on display' : '○ not on display yet'}
          </span>
        </div>
        <p className="text-lg font-semibold leading-snug">{q.prompt}</p>
        <p className="mt-1 text-xs text-muted">
          Answer: <b className="text-good">{LETTERS[q.correct]} — {q.options[q.correct]}</b>
          {q.note && <> · Note: {q.note}</>}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => {
          const shown = r.revealedOptions.includes(i);
          const correct = q.correct === i;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${correct ? 'border-good/50' : 'border-white/10'} ${
                shown ? 'bg-white/[0.06]' : 'bg-transparent opacity-70'
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-black">{LETTERS[i]}</span>
              <span className="flex-1 text-sm font-medium">
                {o}
                {correct && <span className="ml-2 text-xs font-bold text-good">✓ correct</span>}
              </span>
              {!r.answerRevealed && (
                <button
                  className="btn btn-sm w-16"
                  disabled={!r.questionShown}
                  onClick={() => act(shown ? game.hideOption(i) : game.revealOption(i))}
                >
                  {shown ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <span className="min-w-0 flex-1 text-sm text-muted">
          {step === 0 && 'The question is selected but not on the display yet.'}
          {step === 1 && 'Show the options one at a time, or all at once.'}
          {step === 2 && 'All options are up. Reveal the answer when ready.'}
          {step === 3 && (upNext ? 'Answer is on the display.' : 'That was the last question.')}
        </span>
        {step === 1 && (
          <button className="btn" onClick={() => act(game.revealAllOptions())}>
            Show all options
          </button>
        )}
        {step === 1 && (
          <button className="btn btn-sm" onClick={() => act(game.revealAnswer())} title="Shows every option and the answer at once">
            Reveal answer now
          </button>
        )}
        <button
          className={`btn btn-sm ${state.bigXOn ? '!border-red-500 !bg-red-600 !text-white' : 'btn-bad'}`}
          onClick={() => void act(game.setBigX(!state.bigXOn))}
          title="Toggle the red screen (pulsing red over the whole display, with the buzzer)."
        >
          ✕ Big X {state.bigXOn ? 'ON' : 'off'}
        </button>
        <button className="btn btn-sm" onClick={() => void stepBack()} title="Undo the last step on the display">
          ↶ Step back
        </button>
        {next && (
          <button className={`btn ${next.tone ?? 'btn-gold'}`} onClick={() => void next!.run()}>
            {next.text} {step < 3 && '→'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Right: screen, log, resets ───────────────────────────────────────────────

const PHASES: { id: Phase; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'board', label: 'Board' },
  { id: 'question', label: 'Question' },
  { id: 'final', label: 'Final' },
];

function Rail({ state, act }: { state: OperatorState; act: Act }) {
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div>
        <h2 className="label mb-2">Big screen</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {PHASES.map((p) => (
            <button
              key={p.id}
              disabled={p.id === 'question' && !state.round}
              className={`btn btn-sm ${state.phase === p.id ? 'btn-on' : ''}`}
              onClick={() => act(game.setPhase(p.id))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Board shows every question, done ones ticked off.</p>
        <button
          className={`btn mt-3 w-full !py-2.5 !text-base ${
            state.bigXOn
              ? 'pulse-glow !border-red-400 !bg-red-600 !text-white hover:!bg-red-700 [--glow:rgba(239,68,68,0.6)]'
              : '!border-red-500/60 !bg-red-950/40 !text-red-300 hover:!bg-red-900/50'
          }`}
          onClick={() => act(game.setBigX(!state.bigXOn))}
          title="Toggle the red screen: pulsing red over the whole display, with the buzzer. It stays up until you switch it off."
        >
          {state.bigXOn ? '✕ Big X is ON — click to hide' : '✕ Big X (off)'}
        </button>
      </div>

      <div>
        <h2 className="label mb-2">Show log</h2>
        <div className="panel space-y-2 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Events recorded</span>
            <b>{state.logCount}</b>
          </div>
          {state.lastLog && (
            <p className="truncate text-xs text-muted" title={state.lastLog.event}>
              Last: {state.lastLog.event}
            </p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="btn btn-sm btn-gold"
              disabled={!state.logCount}
              onClick={async () => {
                const log = await game.getLog();
                if (log) download(`show-log-${new Date().toISOString().slice(0, 10)}.csv`, logToCsv(state, log));
              }}
            >
              Export CSV
            </button>
            <button
              className="btn btn-sm btn-bad"
              disabled={!state.logCount}
              onClick={() => confirm('Clear the show log? Export it first if you need it — this cannot be undone.') && act(game.clearLog())}
            >
              Clear log
            </button>
          </div>
          <p className="text-[11px] text-muted">Survives New game and Full reset; only Clear log empties it.</p>
        </div>
      </div>

      <div>
        <h2 className="label mb-2">Resets</h2>
        <div className="flex flex-col gap-1.5">
          <button
            className="btn btn-sm"
            onClick={() => confirm('New game? Every question goes back to not done. The questions stay.') && act(game.newGame())}
          >
            New game
          </button>
          <button
            className="btn btn-sm btn-bad"
            onClick={() => confirm('FULL RESET? Everything except the questions goes back to defaults.') && act(game.fullReset())}
          >
            Full reset
          </button>
        </div>
      </div>
    </aside>
  );
}

export function ShowTab({ state, act }: { state: OperatorState; act: Act }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(220px,280px)] gap-5">
      <QuestionList state={state} act={act} />
      <LiveQuestion state={state} act={act} />
      <Rail state={state} act={act} />
    </div>
  );
}
