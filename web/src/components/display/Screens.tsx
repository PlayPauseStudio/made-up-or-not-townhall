import type { DisplayState, Team } from '@/lib/types';
import { ShowTitle } from '@/components/ShowTitle';
import { teamVars } from './teamStyle';
import { needsMark, TeamMark } from './TeamArt';

export function Lobby({ state }: { state: DisplayState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1vw] px-[6vw] text-center">
        <div className="font-display text-[2.2vw] tracking-[0.2em] text-white/50">Tonight on</div>
        <h1 className="rise-in flex justify-center">
          <ShowTitle
            title={state.title}
            image={state.titleImage}
            textClassName="font-display text-[10vw] text-gold drop-shadow-[0_0.6vw_2vw_rgba(255,255,255,0.25)]"
            imageClassName="my-[0.5vw] h-[25vw] max-w-[70vw]"
          />
        </h1>
        <div className="mt-[2vw] grid w-full max-w-[80vw] grid-cols-2 gap-[2vw] text-left">
          {state.teams.map((t) => (
            <div
              key={t.id}
              style={teamVars(t.id)}
              className="rise-in relative flex items-center gap-[1.4vw] overflow-hidden rounded-[1.2vw] bg-[var(--team)] px-[2.8vw] py-[1.4vw]"
            >
              {needsMark(t.id, t.name) && <TeamMark id={t.id} className="relative text-[5vw]" />}
              <div className="relative min-w-0">
              <div className="truncate font-display text-[3vw] text-white">{t.name}</div>
              <div className="text-[1.8vw] font-bold text-white">
                {t.players[0]} &amp; {t.players[1]}
              </div>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}

function BigTeam({ team, leading, final }: { team: Team; leading: boolean; final: boolean }) {
  // The final screen crowns the winners in gold; the mid-show scoreboard uses team colours.
  const winner = final && leading;
  const style = winner
    ? ({ ...teamVars(team.id), '--glow': 'rgba(255, 201, 60, 0.9)' } as React.CSSProperties)
    : teamVars(team.id);
  return (
    <div className="relative flex min-w-0 flex-1">
      {winner && (
        // A speech bubble perched on the winners' box, its tail pointing down at it.
        <div className="pop-in absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[85%]">
          <div className="relative whitespace-nowrap rounded-full bg-win px-[2.4vw] py-[0.7vw] font-display text-[2.6vw] text-[#2a1a00] shadow-[0_0.6vw_1.6vw_rgba(0,0,0,0.45)]">
            ★ Winners ★
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[1vw] border-t-[1.1vw] border-x-transparent border-t-win" />
          </div>
        </div>
      )}
    <div
      style={style}
      className={`pop-in relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[2vw] border-[0.3vw] bg-[var(--team)] px-[2vw] text-center ${final ? 'py-[2vw]' : 'py-[3vw]'} ${
        winner
          ? 'border-[0.45vw] border-win pulse-glow'
          : leading
            ? 'border-white pulse-glow'
            : 'border-transparent'
      }`}
    >
      {needsMark(team.id, team.name) && <TeamMark id={team.id} className="relative text-[4vw]" />}
      <div className={`relative font-display text-white ${final ? 'text-[5vw] leading-tight' : 'text-[4.6vw]'}`}>{team.name}</div>
      <div className={`relative font-bold text-white ${final ? 'mt-[0.4vw] text-[2.8vw]' : 'text-[1.9vw]'}`}>
        {team.players[0]} &amp; {team.players[1]}
      </div>
      <div className={`relative mt-[1vw] font-display leading-none tabular-nums text-white ${final ? 'text-[9vw]' : 'text-[12vw]'}`}>{team.score}</div>
    </div>
    </div>
  );
}

export function Scores({ state, final }: { state: DisplayState; final: boolean }) {
  const [a, b] = state.teams;
  const tie = a.score === b.score;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vw]">
      {/* The title, big and centred, on both the scoreboard and the final screen. */}
      <div className="text-center">
        <h1 className="rise-in flex justify-center">
          <ShowTitle
            title={state.title}
            image={state.titleImage}
            textClassName="font-display text-[6.4vw] leading-none text-gold drop-shadow-[0_0.6vw_2vw_rgba(255,255,255,0.25)]"
            imageClassName="h-[13vw] max-w-[60vw]"
          />
        </h1>
        <p className="mt-[0.6vw] font-display text-[2.4vw] text-white/70">{final ? (tie ? "It's a tie!" : 'Final scores') : 'Scoreboard'}</p>
      </div>
      <div className={`flex w-full gap-[3vw] px-[4vw] ${final ? 'mt-[2.5vw]' : ''}`}>
        <BigTeam team={a} leading={!tie && a.score > b.score} final={final} />
        <BigTeam team={b} leading={!tie && b.score > a.score} final={final} />
      </div>
    </div>
  );
}
