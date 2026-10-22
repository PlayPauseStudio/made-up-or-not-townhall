'use client';

import { useGameState } from '@/hooks/useGameState';
import { DISPLAY_KEY } from '@/lib/realtime';
import type { DisplayState } from '@/lib/types';
import { teamOf } from '@/lib/types';
import { Board } from '@/components/display/Board';
import { QuestionView } from '@/components/display/QuestionView';
import { ScoreBar } from '@/components/display/ScoreBar';
import { Lobby, Scores } from '@/components/display/Screens';
import { teamVars } from '@/components/display/teamStyle';
import { ShowTitle } from '@/components/ShowTitle';
import { BigXOverlay } from '@/components/display/BigX';
import { TossScreen } from '@/components/display/Toss';
import { Sounds } from '@/components/display/Sounds';

/**
 * The big screen. Read-only: it connects with no credential (or DISPLAY_KEY),
 * and the server never sends it a correct answer before the reveal, nor the
 * host's notes. Sized in vw so it fills any 16:9 projector.
 */
export default function DisplayPage() {
  const { state, connected } = useGameState<DisplayState>('display', () => DISPLAY_KEY || null);

  if (!state) {
    return (
      <div className="stage flex h-screen items-center justify-center">
        <p className="font-display text-[3vw] text-white/40">Connecting…</p>
      </div>
    );
  }

  const { phase, teams } = state;
  const showBar = phase === 'board' || phase === 'question';
  const active = phase === 'question' && state.round ? state.round.teamId : phase === 'board' ? state.turn : null;
  const turnTeam = teamOf(teams, state.turn);

  return (
    <div className="stage relative flex h-screen w-screen cursor-none flex-col overflow-hidden">
      {/* Top strip */}
      {/* Three columns so the middle line is truly centred whatever sits either side. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw] px-[2.5vw] pt-[1vw] pb-[0.6vw]">
        {/* The title lives in the corner only on the question and toss screens;
            the board drops it, and the scoreboard and final screen show it big and centred. */}
        <div className="flex min-w-0 items-center">
          {(phase === 'question' || phase === 'toss') && (
            <ShowTitle
              title={state.title}
              image={state.titleImage}
              textClassName="font-display text-[3.4vw] text-gold"
              imageClassName="h-[9vw] max-w-[26vw] object-left"
            />
          )}
        </div>
        <span style={teamVars(state.turn)} className="text-center font-display text-[2.8vw] text-[var(--team-ink)]">
          {phase === 'board' && `${turnTeam.name} is selecting`}
        </span>
        <span className="text-right text-[1.2vw] text-white/50">
          {!connected && <span className="ml-[1vw] text-bad">● reconnecting</span>}
        </span>
      </div>

      <main className="min-h-0 flex-1 px-[2.5vw] pb-[1.4vw]">
        {phase === 'lobby' && <Lobby state={state} />}
        {phase === 'board' && <Board tiles={state.board} teams={teams} />}
        {phase === 'question' &&
          (state.round ? (
            <QuestionView round={state.round} teams={teams} />
          ) : (
            <Board tiles={state.board} teams={teams} />
          ))}
        {phase === 'toss' && <TossScreen toss={state.toss} teams={teams} />}
        {(phase === 'scores' || phase === 'final') && <Scores state={state} final={phase === 'final'} />}
      </main>

      {showBar && (
        <ScoreBar
          teams={teams}
          active={active}
          large={phase === 'question'}
          center={
            phase === 'question' && state.round ? (
              <div className="pop-in flex flex-col items-center gap-[0.5vw]">
                <span className="rounded-full bg-gold px-[1.6vw] py-[0.4vw] font-display text-[2.2vw] text-[#160d1f]">
                  {state.round.category}
                </span>
                <span className="font-display text-[1.8vw] text-gold">{state.round.points} points</span>
              </div>
            ) : null
          }
        />
      )}

      <BigXOverlay bigXOn={state.bigXOn} />
      <Sounds state={state} />
    </div>
  );
}
