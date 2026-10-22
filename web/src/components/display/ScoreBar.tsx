import type { Team, TeamId } from '@/lib/types';
import { needsMark, TeamMark } from './TeamArt';
import { teamVars } from './teamStyle';

interface Props {
  teams: [Team, Team];
  /** The team in the spotlight (whose pick / whose answer), if any. */
  active: TeamId | null;
  center?: React.ReactNode;
  /** Bigger team and player names (the question screen). */
  large?: boolean;
}

/**
 * A team as on its card: solid team colour, white type.
 * The team in the spotlight is full strength with a white outline; the other
 * steps back.
 */
function TeamPanel({ team, active, align, large }: { team: Team; active: boolean; align: 'left' | 'right'; large?: boolean }) {
  return (
    <div
      style={teamVars(team.id)}
      className={`relative flex items-center gap-[1.4vw] overflow-hidden rounded-[1.2vw] border-[0.22vw] bg-[var(--team)] px-[2.6vw] py-[0.9vw] transition-all duration-500 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      } ${active ? 'pulse-glow border-white' : 'border-transparent opacity-75'}`}
    >
      {needsMark(team.id, team.name) && <TeamMark id={team.id} className="relative text-[3.6vw]" />}
      <div className="relative min-w-0 flex-1">
        <div className={`font-display truncate font-black text-white ${large ? 'text-[3.4vw]' : 'text-[2.9vw]'}`}>{team.name}</div>
        <div className={`truncate font-bold text-white ${large ? 'text-[1.9vw]' : 'text-[1.5vw]'}`}>
          {team.players[0]} &amp; {team.players[1]}
        </div>
      </div>
      <div key={team.score} className="pop-in relative min-w-[6vw] text-center font-display text-[4.8vw] tabular-nums text-white">
        {team.score}
      </div>
    </div>
  );
}

export function ScoreBar({ teams, active, center, large }: Props) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw] px-[2.5vw] pb-[1.8vw]">
      <TeamPanel team={teams[0]} active={active === 'A'} align="left" large={large} />
      <div className="min-w-[14vw] text-center">{center}</div>
      <TeamPanel team={teams[1]} active={active === 'B'} align="right" large={large} />
    </div>
  );
}
