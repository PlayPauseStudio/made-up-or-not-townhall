'use client';

import { useEffect, useRef } from 'react';
import type { DisplayState } from '@/lib/types';
import { FLIP_MS } from './Toss';

// Synthesised for this show by scripts/make-sfx.cjs (no third-party samples).
const CUES = ['select', 'reveal', 'lock', 'right', 'wrong', 'drumroll', 'land', 'win'] as const;
type Cue = (typeof CUES)[number];
/** The buzzer is much louder than the rest; even it out. */
const VOLUME: Partial<Record<Cue, number>> = { wrong: 0.7 };


/**
 * Sound effects for the big screen, played when the state moves:
 *
 *   tile picked → sting
 *   question revealed → reveal
 *   answer locked → lock         right → celebration    wrong → buzzer
 *   correct answer shown after a wrong one → reveal
 *   final screen → fanfare
 *   coin toss → drum roll while it spins, then a sting as it lands
 *
 * The state seen when the page loads is only a baseline, so a refresh or a
 * reconnect never replays a sound. Turned off with Teams & rules → Sound
 * effects. Browsers block sound until someone has clicked the page once.
 */
export function Sounds({ state }: { state: DisplayState }) {
  const prev = useRef<DisplayState | null>(null);
  const audio = useRef<Partial<Record<Cue, HTMLAudioElement>>>({});
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const cue of CUES) {
      const a = new Audio(`/sfx/${cue}.wav`);
      a.preload = 'auto';
      a.volume = VOLUME[cue] ?? 1;
      audio.current[cue] = a;
    }
    return () => {
      if (landTimer.current) clearTimeout(landTimer.current);
    };
  }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!before || !state.sounds) return;

    const play = (cue: Cue) => {
      const a = audio.current[cue];
      if (!a) return;
      a.currentTime = 0;
      a.play().catch(() => {});
    };
    const stop = (cue: Cue) => audio.current[cue]?.pause();

    // Coin toss: drum roll for the spin, sting on landing.
    if (state.toss?.at && state.toss.at !== before.toss?.at) {
      play('drumroll');
      if (landTimer.current) clearTimeout(landTimer.current);
      landTimer.current = setTimeout(() => {
        stop('drumroll');
        play('land');
      }, FLIP_MS);
      return;
    }

    // Final screen.
    if (state.phase === 'final' && before.phase !== 'final') return play('win');

    // A tile picked (or the highlight moved to another).
    const sel = state.board.find((t) => t.selected);
    const wasSel = before.board.find((t) => t.selected);
    if (sel && sel.id !== wasSel?.id && !state.round) return play('select');

    const r = state.round;
    const b = before.round?.questionId === r?.questionId ? before.round : null;
    if (!r) return;
    if (!b) return play('reveal'); // the question just went up
    if (r.verdictShown && !b.verdictShown) return play(r.answerRevealed ? 'right' : 'wrong');
    if (r.answerRevealed && !b.answerRevealed) return play('reveal'); // correct answer after a wrong one
    if (r.teamAnswer !== null && r.teamAnswer !== b.teamAnswer && !r.verdictShown) return play('lock');
  }, [state]);

  return null;
}
