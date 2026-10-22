import type { BoardTile, Team } from '@/lib/types';
import { teamVars } from './teamStyle';
import { TeamMark } from './TeamArt';

/** Columns for a board of `n` tiles: 40 questions lay out 8 × 5 on a 16:9 screen. */
function columnsFor(n: number): number {
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  if (n <= 25) return 5;
  if (n <= 30) return 6;
  if (n <= 42) return Math.max(7, Math.ceil(n / 5));
  return 10;
}

/**
 * The category board: one grid of every question, in question order. A played
 * tile turns the colour of the team that answered it. The picked tile lights up
 * with its points (the rest dim) until the question is revealed.
 */
export function Board({ tiles }: { tiles: BoardTile[]; teams: [Team, Team] }) {
  const anySelected = tiles.some((t) => t.selected);
  const cols = columnsFor(tiles.length);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // Type scales with the tile: a 3-across board gets big names, an 8-across one smaller.
  const scale = 3 / cols;
  const name = `${Math.max(1.3, 3.6 * scale).toFixed(2)}vw`;

  return (
    <div
      className="grid h-full gap-[0.8vw]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {tiles.map((t, i) => {
        const played = t.played;
        return (
          <div
            key={t.id}
            style={{ ...(played ? teamVars(played.teamId) : {}), animationDelay: `${Math.min(i, 40) * 25}ms` }}
            className={`rise-in relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-[0.9vw] border-[0.2vw] px-[0.6vw] text-center transition-all duration-500 ${
              anySelected && !t.selected ? '[filter:brightness(0.45)_saturate(0.6)] ' : ''
            }${
              t.selected
                ? 'pulse-glow z-10 border-[0.3vw] border-white bg-gradient-to-b from-[#3d2d4a] to-[#231a2c] [--glow:rgba(255,255,255,0.45)]'
                : played
                  ? 'border-transparent bg-[var(--team)]'
                  : 'border-white/25 bg-gradient-to-b from-[#281d33] to-[#1b1324] shadow-[inset_0_0.2vw_0_rgba(255,255,255,0.08),0_0.6vw_1.6vw_rgba(0,0,0,0.35)]'
            }`}
          >
            {played ? (
              <>
                <span className="pop-in relative leading-none" style={{ fontSize: `calc(${name} * 2.2)` }}>
                  <TeamMark id={played.teamId} />
                </span>
                <span
                  className="relative mt-[0.2vw] font-display font-extrabold leading-tight text-white/90"
                  style={{ fontSize: `calc(${name} * 0.8)` }}
                >
                  {t.category}
                </span>
              </>
            ) : (
              <>
                {/* Points stay hidden until the tile is picked; then they take
                    over the tile and the category steps down to a label. */}
                <span
                  className="font-display leading-tight text-white transition-all duration-500"
                  style={{ fontSize: t.selected ? `calc(${name} * 0.75)` : name, opacity: t.selected ? 0.85 : 1 }}
                >
                  {t.category}
                </span>
                {t.selected && (
                  <span className="pop-in mt-[0.3vw] flex items-baseline gap-[0.4vw] font-display leading-none text-white drop-shadow-[0_0_1.2vw_rgba(255,255,255,0.55)]">
                    <span className="font-black tabular-nums" style={{ fontSize: `calc(${name} * 2.6)` }}>
                      {t.points}
                    </span>
                    <span style={{ fontSize: `calc(${name} * 0.8)` }}>points</span>
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
