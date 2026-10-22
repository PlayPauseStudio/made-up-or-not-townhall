import type { BoardTile } from '@/lib/types';

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
 * The category board: one grid of every question, in question order. A done
 * question is ticked off and faded; the picked tile lights up (the rest dim).
 * No teams and no points — the questions just roll one by one.
 */
export function Board({ tiles }: { tiles: BoardTile[] }) {
  const anySelected = tiles.some((t) => t.selected);
  const cols = columnsFor(tiles.length);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // Type scales with the tile: a 3-across board gets big names, an 8-across one smaller.
  const scale = 3 / cols;
  const name = `${Math.max(1.3, 3.6 * scale).toFixed(2)}vw`;
  const size = (k: number) => `calc(${name} * ${k})`;

  return (
    <div
      className="grid h-full gap-[0.8vw]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {tiles.map((t, i) => {
        const done = !!t.played && !t.selected;
        return (
          <div
            key={t.id}
            style={{ animationDelay: `${Math.min(i, 40) * 25}ms` }}
            className={`rise-in relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-[0.9vw] border-[0.2vw] px-[0.6vw] text-center transition-all duration-500 ${
              anySelected && !t.selected ? '[filter:brightness(0.45)_saturate(0.6)] ' : ''
            }${
              t.selected
                ? 'pulse-glow z-10 border-[0.3vw] border-white bg-gradient-to-b from-[#3d2d4a] to-[#231a2c] [--glow:rgba(255,255,255,0.45)]'
                : done
                  ? 'border-white/10 bg-white/[0.03] opacity-55'
                  : 'border-white/25 bg-gradient-to-b from-[#281d33] to-[#1b1324] shadow-[inset_0_0.2vw_0_rgba(255,255,255,0.08),0_0.6vw_1.6vw_rgba(0,0,0,0.35)]'
            }`}
          >
            {done && (
              <span className="pop-in leading-none text-good" style={{ fontSize: size(1.4) }}>
                ✓
              </span>
            )}
            <span
              className={`font-display leading-tight transition-all duration-500 ${done ? 'mt-[0.2vw] text-white/70' : 'text-white'}`}
              style={{ fontSize: done ? size(0.8) : t.selected ? size(1.15) : name }}
            >
              {t.category}
            </span>
          </div>
        );
      })}
    </div>
  );
}
