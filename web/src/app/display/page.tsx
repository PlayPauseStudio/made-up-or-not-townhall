'use client';

import { useGameState } from '@/hooks/useGameState';
import type { DisplayState } from '@/lib/types';
import { Board } from '@/components/display/Board';
import { QuestionView } from '@/components/display/QuestionView';
import { Final, Lobby } from '@/components/display/Screens';
import { ShowTitle } from '@/components/ShowTitle';
import { BigXOverlay } from '@/components/display/BigX';
import { Sounds } from '@/components/display/Sounds';

/**
 * The big screen. Read-only: it follows the game saved in this browser and is
 * only given what it should show — never a correct answer before the reveal,
 * nor the host's notes. Sized in vw so it fills any 16:9 projector.
 *
 * No teams: the questions roll one by one, each with its category on top.
 */
export default function DisplayPage() {
  const { state } = useGameState<DisplayState>('display');

  if (!state) {
    return (
      <div className="stage flex h-screen items-center justify-center">
        <p className="font-display text-[3vw] text-white/40">Loading…</p>
      </div>
    );
  }

  const { phase, round, board } = state;
  const index = round ? board.findIndex((t) => t.id === round.questionId) : -1;

  return (
    <div className="stage relative flex h-screen w-screen cursor-none flex-col overflow-hidden">
      {/* Top strip: title on the left; on the question screen, the category and
          "Question N of M" in the centre. Three columns keep the centre centred. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw] px-[2.5vw] pt-[1vw] pb-[0.6vw]">
        <div className="flex min-w-0 items-center">
          {phase === 'question' && (
            <ShowTitle
              title={state.title}
              image={state.titleImage}
              textClassName="font-display text-[3.4vw] text-gold"
              imageClassName="h-[9vw] max-w-[26vw] object-left"
            />
          )}
        </div>
        {phase === 'question' && round ? (
          <div key={round.questionId} className="pop-in flex flex-col items-center gap-[0.4vw]">
            <span className="rounded-full bg-gold px-[1.8vw] py-[0.45vw] font-display text-[2.6vw] text-[#160d1f]">
              {round.category}
            </span>
            {index >= 0 && (
              <span className="font-display text-[1.6vw] text-white/60">
                Question {index + 1} of {board.length}
              </span>
            )}
          </div>
        ) : (
          <span />
        )}
        <span />
      </div>

      <main className="min-h-0 flex-1 px-[2.5vw] pb-[2vw]">
        {phase === 'lobby' && <Lobby state={state} />}
        {phase === 'board' && <Board tiles={board} />}
        {phase === 'question' && (round ? <QuestionView round={round} /> : <Board tiles={board} />)}
        {phase === 'final' && <Final state={state} />}
        {/* Phases this show no longer uses (toss / scores) fall back to the lobby. */}
        {(phase === 'toss' || phase === 'scores') && <Lobby state={state} />}
      </main>

      <BigXOverlay bigXOn={state.bigXOn} />
      <Sounds state={state} />
    </div>
  );
}
