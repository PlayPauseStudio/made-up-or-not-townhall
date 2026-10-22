import type { PublicRound } from '@/lib/types';
import { LETTERS } from '@/lib/types';
import { fitOption, fitPrompt } from './teamStyle';

type OptionState = 'hidden' | 'shown' | 'correct' | 'dim';

/** No teams: an option is hidden, up, or — once the answer is revealed — the right one or faded. */
function optionState(round: PublicRound, i: number): OptionState {
  if (round.options[i] === null) return 'hidden';
  if (round.answerRevealed) return i === round.correct ? 'correct' : 'dim';
  return 'shown';
}

const CARD: Record<OptionState, string> = {
  hidden: 'shimmer border-white/10',
  shown: 'border-white/20 bg-white/[0.07]',
  correct: 'border-good bg-[color-mix(in_srgb,var(--good)_32%,transparent)] pop-in',
  dim: 'border-white/10 bg-white/[0.03] opacity-45',
};

export function QuestionView({ round }: { round: PublicRound }) {
  const n = round.options.length;
  // 2 options side by side, 3 in a row, 4 as a 2×2 grid. Fewer options get taller cards.
  const grid = n === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const cardHeight = n === 4 ? 'h-[7.2vw]' : 'h-[10vw]';

  return (
    <div className="flex h-full flex-col gap-[1.6vw]">
      {/* Prompt */}
      <div
        key={round.questionId}
        className="flip-in flex min-h-[26%] flex-1 items-center justify-center rounded-[1.6vw] border-[0.18vw] border-gold/50 bg-gradient-to-b from-[#2a1f35] to-[#1c1426] px-[4vw] py-[2vw] text-center shadow-[0_1vw_3vw_rgba(0,0,0,0.4)]"
      >
        <p className="font-semibold leading-[1.18]" style={{ fontSize: fitPrompt(round.prompt) }}>
          {round.prompt}
        </p>
      </div>

      {/* Options */}
      <div className={`grid gap-[1.4vw] ${grid}`}>
        {round.options.map((text, i) => {
          const st = optionState(round, i);
          return (
            <div
              key={i}
              className={`relative flex items-center gap-[1.4vw] rounded-[1.2vw] border-[0.2vw] px-[1.6vw] transition-all duration-500 ${cardHeight} ${CARD[st]}`}
            >
              <span
                className={`flex h-[3.8vw] w-[3.8vw] shrink-0 items-center justify-center rounded-full font-display text-[2.4vw] ${
                  st === 'correct' ? 'bg-good text-black' : 'bg-gold text-[#160d1f]'
                }`}
              >
                {LETTERS[i]}
              </span>
              {st === 'hidden' ? (
                <span className="text-[2vw] text-white/25">?</span>
              ) : (
                <span className="pop-in font-semibold leading-tight" style={{ fontSize: fitOption(text ?? '') }}>
                  {text}
                </span>
              )}
              {st === 'correct' && <span className="ml-auto font-display text-[3.4vw]">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
