'use client';

import { useState } from 'react';
import { game } from '@/lib/gameState';
import type { Ack } from '@/lib/realtime';
import type { OperatorState, Phase, Round, TeamId } from '@/lib/types';
import { LETTERS, teamOf } from '@/lib/types';
import { download, logToCsv } from '@/lib/csv';

export type Act = (p: Promise<Ack>) => Promise<boolean>;

// Lighter tints of the team colours, readable as text on the dark panel.
const teamColor = (id: TeamId) => (id === 'A' ? 'var(--team-a-ink)' : 'var(--team-b-ink)');

function TeamToggle({ value, onChange, state }: { value: TeamId; onChange: (t: TeamId) => void; state: OperatorState }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 p-0.5">
      {state.teams.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="max-w-[7.5rem] truncate whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold"
          title={t.name}
          style={value === t.id ? { background: teamColor(t.id), color: '#000' } : { color: 'var(--muted)' }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

// ── Left: the board ──────────────────────────────────────────────────────────

function BoardColumn({ state, act }: { state: OperatorState; act: Act }) {
  const live = state.round?.questionId;
  const squares = state.questions;
  const played = squares.filter((q) => state.played[q.id]).length;
  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between text-xs">
        <h2 className="label">Board</h2>
        <span className="text-muted">
          {played}/{squares.length} played
        </span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Next pick</span>
        <TeamToggle value={state.turn} onChange={(t) => act(game.setTurn(t))} state={state} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-1.5">
          {squares.map((q, i) => {
            const p = state.played[q.id];
            const isLive = live === q.id;
            return (
              <div
                key={q.id}
                className={`group relative flex h-[4.5rem] flex-col rounded-lg border p-1.5 text-left ${
                  isLive ? 'border-gold bg-gold/15' : p ? 'bg-white/[0.02]' : 'border-white/15 bg-white/[0.05]'
                }`}
                style={p && !isLive ? { borderColor: teamColor(p.teamId) } : undefined}
              >
                <button
                  disabled={!!p || !!state.round?.questionShown}
                  onClick={() => act(game.openTile(q.id))}
                  className="flex h-full w-full flex-col text-left disabled:cursor-default"
                  title={
                    p
                      ? 'Already played'
                      : state.round?.questionShown
                        ? 'Finish the live tile first'
                        : `Select for ${teamOf(state.teams, state.round?.teamId ?? state.turn).name} — lights up on the display`
                  }
                >
                  <div className="flex items-center gap-1 text-[10px] text-muted">
                    <span>{i + 1}</span>
                    <span>· {q.points}</span>
                  </div>
                  <div className={`mt-0.5 line-clamp-2 text-xs font-semibold leading-tight ${p ? 'text-white/40' : ''}`}>{q.category}</div>
                  {p && (
                    <div className="mt-auto truncate text-[10px] font-semibold" style={{ color: teamColor(p.teamId) }}>
                      {teamOf(state.teams, p.teamId).name} {p.correct ? '✓' : '✗'}
                    </div>
                  )}
                  {isLive && (
                    <div className="mt-auto text-[10px] font-bold text-gold">{state.round?.questionShown ? '● LIVE' : '● SELECTED'}</div>
                  )}
                </button>
                {p && !isLive && (
                  <button
                    onClick={() => {
                      if (confirm(`Put "${q.category}" back on the board? Its ${p.points} points come off ${teamOf(state.teams, p.teamId).name}.`)) {
                        void act(game.resetTile(q.id));
                      }
                    }}
                    className="absolute right-1 top-1 hidden rounded px-1 text-[10px] text-muted hover:bg-white/10 group-hover:block"
                  >
                    reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Tiles are the questions in order, left to right, top to bottom. Reorder them in the Questions tab.
      </p>
    </section>
  );
}

// ── Centre: the live tile ────────────────────────────────────────────────────

const STEPS = ['Select tile', 'Reveal question', 'Show options', 'Lock answer', 'Right or wrong', 'Correct answer'];

/** Which step the tile is on (0-based index into STEPS); 6 = finished. */
function currentStep(r: Round, optionCount: number): number {
  if (!r.questionShown) return 1;
  if (r.teamAnswer === null && !r.verdictShown && r.revealedOptions.length < optionCount) return 2;
  if (r.teamAnswer === null && !r.verdictShown) return 3;
  if (!r.verdictShown) return 4;
  if (!r.answerRevealed) return 5;
  return 6;
}

/**
 * The six steps of a tile. Click a done step to go back to it (undoing what came
 * after, points included); click a later one to run the steps in between. Steps
 * past "Lock answer" need the team's answer locked first.
 */
function Stepper({ step, round, act }: { step: number; round: Round; act: Act }) {
  const locked = round.teamAnswer !== null || round.verdictShown;
  const jump = (i: number) => {
    if (i === step) return;
    if (i === 0) {
      if (!confirm('Go back to "Select tile"? This tile goes back on the board unplayed.')) return;
    } else if (i < step && round.verdictShown && i <= 4) {
      // Going back past a verdict takes its points back — say so first.
      if (!confirm(`Go back to "${STEPS[i]}"? The verdict and its points are undone.`)) return;
    }
    void act(game.goToStep(i));
  };
  return (
    <ol className="grid grid-cols-6 gap-1.5">
      {STEPS.map((label, i) => {
        const done = i < step;
        const now = i === step;
        const reachable = i <= 3 || locked;
        const title = now
          ? 'Current step'
          : !reachable
            ? "Lock the team's answer first"
            : done
              ? `Go back to "${label}"`
              : `Jump ahead to "${label}"`;
        const tone = now
          ? 'cursor-default border-gold bg-gold/15 text-gold'
          : done
            ? 'border-good/30 text-good hover:border-good hover:bg-good/10'
            : reachable
              ? 'border-white/10 text-muted hover:border-white/30 hover:text-white'
              : 'cursor-not-allowed border-white/5 text-muted/40';
        return (
          <li key={label}>
            <button
              type="button"
              disabled={now || !reachable}
              onClick={() => jump(i)}
              title={title}
              className={`w-full rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold leading-tight transition-colors ${tone}`}
            >
              <span className="mr-1 opacity-70">{done ? '✓' : i + 1}</span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function LiveRound({ state, act }: { state: OperatorState; act: Act }) {
  const r = state.round;
  if (!r) {
    const turn = teamOf(state.teams, state.turn);
    // Before the first tile: the coin toss for who goes first.
    if (state.phase === 'lobby' || state.phase === 'toss') return <TossPanel state={state} act={act} />;
    return (
      <div className="panel flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold">No tile selected.</p>
        <p className="text-sm text-muted">
          Click a tile on the left to select it for <b style={{ color: teamColor(turn.id) }}>{turn.name}</b>. It lights up
          on the display; the question stays hidden until you reveal it.
        </p>
        <p className="mt-2 text-xs text-muted">Display is showing: <b className="text-white">{state.phase}</b></p>
      </div>
    );
  }
  const q = state.questions.find((x) => x.id === r.questionId);
  if (!q) return null;
  const team = teamOf(state.teams, r.teamId);
  const step = currentStep(r, q.options.length);
  const label = (i: number) => `${LETTERS[i]} — ${q.options[i]}`;
  const right = r.teamAnswer !== null && r.teamAnswer === q.correct;

  // The one button that moves the show forward.
  let next: { text: string; run: () => unknown; tone?: string } | null = null;
  if (step === 1) next = { text: 'Reveal question on display', run: () => act(game.showQuestion()) };
  else if (step === 2) next = { text: 'Show next option', run: () => act(game.revealOption()) };
  else if (step === 4) next = { text: `Show if ${team.name} is right`, run: () => act(game.showVerdict()) };
  else if (step === 5) next = { text: 'Reveal correct answer', run: () => act(game.revealAnswer()) };
  else if (step === 6) next = { text: 'Back to board', run: () => act(game.closeRound()), tone: 'btn-good' };

  // One step back, whatever the last step was.
  const stepBack = () => {
    if (r.verdictShown) return act(game.unrevealAnswer());
    if (r.teamAnswer !== null) return act(game.lockAnswer(null));
    if (r.revealedOptions.length) return act(game.hideOption(r.revealedOptions[r.revealedOptions.length - 1]));
    if (r.questionShown) return act(game.hideQuestion());
    return act(game.closeRound());
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <Stepper step={step} round={r} act={act} />

      <div className="panel p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-black">{q.category}</span>
          <span className="text-xs font-semibold text-muted">{q.options.length} options · {q.points} pts</span>
          <span className={`text-xs font-semibold ${r.questionShown ? 'text-good' : 'text-muted'}`}>
            {r.questionShown ? '● on display' : '○ hidden — tile highlighted on display'}
          </span>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            Answering <TeamToggle value={r.teamId} onChange={(t) => act(game.setRoundTeam(t))} state={state} />
          </span>
        </div>
        <p className="text-lg font-semibold leading-snug">{q.prompt}</p>
        <p className="mt-1 text-xs text-muted">
          Answer: <b className="text-good">{label(q.correct)}</b>
          {q.note && <> · Note: {q.note}</>}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => {
          const shown = r.revealedOptions.includes(i);
          const locked = r.teamAnswer === i;
          const correct = q.correct === i;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                locked ? 'border-2' : correct ? 'border-good/50' : 'border-white/10'
              } ${shown ? 'bg-white/[0.06]' : 'bg-transparent opacity-70'}`}
              style={locked ? { borderColor: teamColor(r.teamId) } : undefined}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-black">
                {LETTERS[i]}
              </span>
              <span className="flex-1 text-sm font-medium">
                {o}
                {correct && <span className="ml-2 text-xs font-bold text-good">✓ correct</span>}
              </span>
              {!r.verdictShown && (
                <>
                  <button
                    className={`btn btn-sm w-16 ${shown || !r.questionShown ? '' : 'btn-on'}`}
                    disabled={!r.questionShown || locked}
                    onClick={() => act(shown ? game.hideOption(i) : game.revealOption(i))}
                  >
                    {shown ? 'Hide' : 'Show'}
                  </button>
                  <button
                    className={`btn btn-sm w-24 ${step === 3 && shown && !locked ? 'btn-on' : ''}`}
                    disabled={!shown}
                    style={locked ? { background: teamColor(r.teamId), color: '#000', borderColor: 'transparent' } : undefined}
                    onClick={() => act(game.lockAnswer(locked ? null : i))}
                    title={shown ? '' : 'Show this option first'}
                  >
                    {locked ? 'Locked ✓' : 'Lock answer'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>


      {/* Step controls */}
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <span className="min-w-0 flex-1 text-sm">
          {step === 1 && <span className="text-muted">The tile is lit up with its points on the display. Reveal the question when ready.</span>}
          {step === 2 && <span className="text-muted">Show the options one at a time, or all at once.</span>}
          {step === 3 && <span className="text-muted">Click <b className="text-white">Lock answer</b> on the option {team.name} picks.</span>}
          {step === 4 && (
            <>
              <b style={{ color: teamColor(r.teamId) }}>{team.name}</b> locked <b>{label(r.teamAnswer!)}</b>{' '}
              {right ? <span className="text-good">(right)</span> : <span className="text-red-400">(wrong)</span>}
            </>
          )}
          {step === 5 && <span className="text-red-400">Wrong on screen. The correct answer is still hidden.</span>}
          {step === 6 && r.awarded && (
            <b className={r.awarded.points > 0 ? 'text-good' : r.awarded.points < 0 ? 'text-red-400' : 'text-muted'}>
              {r.awarded.points > 0 ? '+' : ''}
              {r.awarded.points} to {teamOf(state.teams, r.awarded.teamId).name}
            </b>
          )}
        </span>

        {step === 2 && (
          <button className="btn" onClick={() => act(game.revealAllOptions())}>
            Show all options
          </button>
        )}
        {step === 3 && (
          <button
            className="btn btn-sm"
            onClick={() => confirm(`${team.name} gave no answer? This reveals the correct answer with no points.`) && act(game.revealAnswer())}
          >
            No answer — reveal
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
            {next.text} →
          </button>
        )}
        {step < 6 && (
          <button
            className="btn btn-sm btn-bad"
            onClick={() => {
              const msg = r.verdictShown
                ? 'Back to the board? This tile is already scored and stays played.'
                : 'Cancel this tile? It goes back on the board unplayed.';
              if (confirm(msg)) void act(game.closeRound());
            }}
          >
            {r.verdictShown ? 'Back to board' : 'Cancel tile'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Right: scores + screen controls ──────────────────────────────────────────

function ScoreCard({ state, id, act }: { state: OperatorState; id: TeamId; act: Act }) {
  const t = teamOf(state.teams, id);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: teamColor(id) }}>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold" style={{ color: teamColor(id) }}>{t.name}</span>
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (/^-?\d+$/.test(val) && (await act(game.setScore(id, Number(val))))) setEditing(false);
            }}
          >
            <input autoFocus className="input !w-20 !py-0.5 text-right" value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => setEditing(false)} />
          </form>
        ) : (
          <button className="font-display text-4xl tabular-nums" title="Click to set" onClick={() => { setVal(String(t.score)); setEditing(true); }}>
            {t.score}
          </button>
        )}
      </div>
      <div className="text-[11px] text-muted">{t.players.join(' & ')}</div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[-10, -5, 5, 10].map((d) => (
          <button key={d} className="btn btn-sm" onClick={() => act(game.adjustScore(id, d))}>
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Before the first tile: put the toss screen up, assign heads/tails, flip, then go to the board. */
function TossPanel({ state, act }: { state: OperatorState; act: Act }) {
  const toss = state.toss;
  const onScreen = state.phase === 'toss';
  const called = !!toss?.heads;
  const winner = toss?.result ? teamOf(state.teams, toss.result) : null;
  const sideOf = (id: TeamId) => (toss?.heads === id ? 'Heads' : 'Tails');
  return (
    <div className="panel flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-bold">Coin toss — who goes first?</h2>
      <p className="max-w-md text-sm text-muted">
        Put the toss screen up, pick which team calls heads (the other gets tails), then flip. The coin spins on
        the display for about 3 seconds; the team whose side lands picks first. Did the toss on stage? Land it on
        that side instead.
      </p>

      {!onScreen ? (
        <button className="btn btn-gold !px-6 !py-3 !text-base" onClick={() => act(game.setPhase('toss'))}>
          Show toss screen →
        </button>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">1 · Who calls heads?</span>
            <div className="flex flex-wrap justify-center gap-2">
              {state.teams.map((t) => (
                <button
                  key={t.id}
                  className="btn"
                  style={
                    toss?.heads === t.id
                      ? { background: teamColor(t.id), borderColor: teamColor(t.id), color: '#fff' }
                      : { borderColor: teamColor(t.id), color: teamColor(t.id) }
                  }
                  onClick={() => act(game.tossCall(t.id))}
                >
                  {t.name} — Heads
                </button>
              ))}
            </div>
            {called && (
              <span className="text-xs text-muted">
                {state.teams.map((t) => `${t.name}: ${sideOf(t.id)}`).join(' · ')}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">2 · Flip</span>
            <button className="btn btn-gold !px-8 !py-3 !text-base" disabled={!called} onClick={() => act(game.toss())}>
              {toss?.side ? 'Flip again' : 'Flip the coin'}
            </button>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
              Land it on:
              <button className="btn btn-sm" disabled={!called} onClick={() => act(game.toss('heads'))}>
                Heads
              </button>
              <button className="btn btn-sm" disabled={!called} onClick={() => act(game.toss('tails'))}>
                Tails
              </button>
            </div>
          </div>
        </>
      )}

      {winner && toss?.side && (
        <p className="text-sm">
          Result: <b>{toss.side === 'heads' ? 'Heads' : 'Tails'}</b> —{' '}
          <b style={{ color: teamColor(winner.id) }}>{winner.name}</b> goes first.
        </p>
      )}

      {onScreen && (
        <button className="btn btn-good mt-2" disabled={!winner} onClick={() => act(game.setPhase('board'))}>
          3 · Go to the board →
        </button>
      )}
      <p className="text-xs text-muted">
        Skipping the toss? Set <b className="text-white">Next pick</b> on the left and go to the board from the right panel.
      </p>
    </div>
  );
}

const PHASES: { id: Phase; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'toss', label: 'Toss' },
  { id: 'board', label: 'Board' },
  { id: 'question', label: 'Question' },
  { id: 'scores', label: 'Scores' },
  { id: 'final', label: 'Final' },
];
function Rail({ state, act }: { state: OperatorState; act: Act }) {
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <h2 className="label">Scores</h2>
        <ScoreCard state={state} id="A" act={act} />
        <ScoreCard state={state} id="B" act={act} />
      </div>

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
                // The log is fetched only now — it is not part of the state the panel receives.
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
            onClick={() => confirm('New game? Scores and played tiles are cleared. Questions and teams stay.') && act(game.newGame())}
          >
            New game
          </button>
          <button
            className="btn btn-sm btn-bad"
            onClick={() => confirm('FULL RESET? Everything except the question board goes back to defaults (teams, settings, scores).') && act(game.fullReset())}
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
      <BoardColumn state={state} act={act} />
      <LiveRound state={state} act={act} />
      <Rail state={state} act={act} />
    </div>
  );
}
