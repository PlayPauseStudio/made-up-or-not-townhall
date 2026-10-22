'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoinSide, Team, Toss } from '@/lib/types';
import { teamOf } from '@/lib/types';
import { TeamMark } from './TeamArt';
import { teamVars } from './teamStyle';

/** How long the coin spins before it lands. The sound effects follow this too. */
export const FLIP_MS = 3000;

const SIDE_NAME: Record<CoinSide, string> = { heads: 'Heads', tails: 'Tails' };

/** One face of the gold coin: just the word, Heads or Tails. */
function face(side: CoinSide) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center rounded-full border-[0.9vw] border-[#fff2c2] bg-[radial-gradient(circle_at_35%_30%,#fff1b8_0%,#ffc93c_45%,#c98d12_100%)] shadow-[inset_0_0_2.6vw_rgba(120,70,0,0.55)] [backface-visibility:hidden] ${
        side === 'tails' ? '[transform:rotateX(180deg)]' : ''
      }`}
    >
      <div className="absolute inset-[1.4vw] rounded-full border-[0.3vw] border-dashed border-[#8a5a06]/50" />
      <span className="font-display text-[4.2vw] font-black uppercase leading-none tracking-[0.08em] text-[#5a3a02] drop-shadow-[0_0.2vw_0_rgba(255,240,190,0.7)]">
        {SIDE_NAME[side]}
      </span>
    </div>
  );
}

/**
 * The coin toss for who goes first. The operator assigns which team calls
 * heads (the other has tails) — shown beside the coin — then each new flip (a
 * new `toss.at` from the server) spins the coin through the air and lands it
 * on a side; that side's team goes first. A refresh or reconnect just shows
 * where it landed, without replaying the flip.
 */
export function TossScreen({ toss, teams }: { toss: Toss | null; teams: [Team, Team] }) {
  const seenAt = useRef<number | null | undefined>(undefined);
  const coin = useRef<HTMLDivElement>(null);
  const angleRef = useRef(toss?.side === 'tails' ? 180 : 0);
  const [angle, setAngle] = useState(angleRef.current);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    const at = toss?.at ?? null;
    if (seenAt.current === undefined) {
      seenAt.current = at;
      return;
    }
    if (at === seenAt.current) return;
    seenAt.current = at;
    if (!toss?.side || !at) return; // the call changed; nothing to spin
    // Tumble end over end through several whole turns from where it is now,
    // ending on the side it landed. Driven by the Web Animations API so the
    // spin plays even when the coin was idling (a CSS transition would not).
    const from = angleRef.current;
    const to = Math.ceil(from / 360) * 360 + 360 * 8 + (toss.side === 'tails' ? 180 : 0);
    angleRef.current = to;
    setAngle(to);
    setFlipping(true);
    coin.current?.getAnimations().forEach((a) => a.cancel());
    coin.current?.animate([{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${to}deg)` }], {
      duration: FLIP_MS,
      easing: 'cubic-bezier(0.15, 0.6, 0.25, 1)',
    });
    const t = setTimeout(() => setFlipping(false), FLIP_MS);
    return () => clearTimeout(t);
  }, [toss]);

  const called = !!toss?.heads;
  const landed = !!toss?.side && !flipping;
  const winner = landed && toss?.result ? teamOf(teams, toss.result) : null;
  const sideOf = (id: Team['id']): CoinSide => (toss?.heads === id ? 'heads' : 'tails');

  const heading = flipping
    ? 'Flipping…'
    : landed && toss?.side
      ? `${SIDE_NAME[toss.side]}!`
      : called
        ? 'Heads or tails?'
        : 'Who goes first?';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3.5vw]">
      <h2 key={heading} className="pop-in font-display text-[4.6vw] leading-none text-white">
        {heading}
      </h2>

      <div className="flex w-full items-center justify-center gap-[5vw]">
        <CallCard team={teams[0]} side={called ? sideOf(teams[0].id) : null} winner={winner} />

        <div className="relative mt-[1vw] flex items-center justify-center">
          {/* Glow in the winner's colour once the coin lands. */}
          {winner && (
            <div
              style={teamVars(winner.id)}
              className="pop-in absolute h-[28vw] w-[28vw] rounded-full bg-[var(--team)] opacity-45 blur-[4vw]"
            />
          )}
          <div className={`[perspective:60vw] ${flipping ? 'coin-arc' : ''}`}>
            <div
              ref={coin}
              className={`relative h-[19vw] w-[19vw] [transform-style:preserve-3d] ${!toss?.side ? 'coin-idle' : ''}`}
              style={
toss?.side ? { transform: `rotateX(${angle}deg)` } : undefined
              }
            >
              {face('heads')}
              {face('tails')}
            </div>
          </div>
        </div>

        <CallCard team={teams[1]} side={called ? sideOf(teams[1].id) : null} winner={winner} />
      </div>

      <div className="flex min-h-[9vw] items-center">
        {winner && (
          <div style={teamVars(winner.id)} className="pop-in text-center">
            <div className="font-display text-[5vw] leading-none text-[var(--team-ink)]">{winner.name}</div>
            <div className="mt-[0.6vw] font-display text-[2.6vw] text-white">goes first!</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A team's card beside the coin: its mark and name, and the side it called
 * once assigned. After the coin lands, the winner's card lifts and glows and
 * the other dims.
 */
function CallCard({ team, side, winner }: { team: Team; side: CoinSide | null; winner: Team | null }) {
  const won = winner?.id === team.id;
  const lost = !!winner && !won;
  return (
    <div
      style={teamVars(team.id)}
      className={`flex w-[22vw] flex-col items-center gap-[0.8vw] rounded-[1.6vw] border-[0.3vw] bg-[var(--team)] px-[1.5vw] py-[2vw] text-center transition-all duration-500 ${
        won ? 'win-glow scale-110 border-white' : 'border-transparent'
      } ${lost ? '[filter:brightness(0.45)_saturate(0.6)] scale-95' : ''}`}
    >
      <TeamMark id={team.id} className="text-[5vw]" />
      <div className="font-display text-[2.6vw] font-extrabold leading-tight text-white">{team.name}</div>
      <div className="flex min-h-[3.4vw] items-center">
        {side && (
          <span
            key={side}
            className="pop-in rounded-full bg-white px-[1.4vw] py-[0.4vw] font-display text-[1.9vw] font-extrabold uppercase tracking-[0.15em] text-[#2a1d35]"
          >
            {SIDE_NAME[side]}
          </span>
        )}
      </div>
    </div>
  );
}
