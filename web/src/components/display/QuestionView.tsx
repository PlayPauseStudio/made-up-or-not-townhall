import type { PublicRound, Team } from '@/lib/types';
import { LETTERS, teamOf } from '@/lib/types';
import { fitOption, fitPrompt, teamVars } from './teamStyle';

interface Props {
  round: PublicRound;
  teams: [Team, Team];
}

type OptionState = 'hidden' | 'shown' | 'locked' | 'correct' | 'wrong' | 'dim';

function optionState(round: PublicRound, i: number): OptionState {
  if (round.options[i] === null) return 'hidden';
  if (round.answerRevealed) {
    if (i === round.correct) return 'correct';
    if (i === round.teamAnswer) return 'wrong';
    return 'dim';
  }
  // Wrong verdict shown, correct answer not yet: only the team's pick changes.
  if (round.verdictShown && i === round.teamAnswer) return 'wrong';
  return i === round.teamAnswer ? 'locked' : 'shown';
}

const CARD: Record<OptionState, string> = {
  hidden: 'shimmer border-white/10',
  shown: 'border-white/20 bg-white/[0.07]',
  locked: 'border-[var(--team)] bg-[color-mix(in_srgb,var(--team)_22%,transparent)] pulse-glow',
  correct: 'border-good bg-[color-mix(in_srgb,var(--good)_32%,transparent)] pop-in',
  // A wrong pick goes red. (Teams are purple and orange, so red reads as wrong, not as a team.)
  wrong: 'border-bad bg-[color-mix(in_srgb,var(--bad)_35%,transparent)] pop-in',
  dim: 'border-white/10 bg-white/[0.03] opacity-45',
};

export function QuestionView({ round, teams }: Props) {
  const team = teamOf(teams, round.teamId);
  const n = round.options.length;
  // 2 options side by side, 3 in a row, 4 as a 2×2 grid. Fewer options get taller cards.
  const grid = n === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const cardHeight = n === 4 ? 'h-[6.6vw]' : 'h-[9vw]';

  return (
    <div className="flex h-full flex-col gap-[1.6vw]" style={teamVars(round.teamId)}>
      {/* Category and points sit in the score bar; who is answering is the glowing team panel. */}
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
              {st === 'locked' && (
                <span className="ml-auto rounded-full bg-[var(--team)] px-[0.9vw] py-[0.2vw] font-display text-[1.4vw] text-white">
                  {team.name}
                </span>
              )}
              {st === 'correct' && (
                <span className="ml-auto font-display text-[3.4vw]">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Result line */}
      <div className="flex min-h-[3.6vw] items-center justify-center gap-[1.4vw]">
        {round.verdictShown && round.awarded && (
          <span
            className={`pop-in font-display text-[3vw] ${
              round.awarded.points > 0 ? 'text-good' : round.awarded.points < 0 ? 'text-bad' : 'text-white/60'
            }`}
          >
            {round.awarded.points > 0
              ? `+${round.awarded.points} to ${team.name}`
              : round.awarded.points < 0
                ? `${team.name} ${round.awarded.points}`
                : round.teamAnswer === null
                  ? 'No answer — no points'
                  : `No points for ${team.name}`}
          </span>
        )}
      </div>
    </div>
  );
}
