'use client';

import { useEffect, useRef } from 'react';

/**
 * The red screen — the operator's "Big X" toggle. While it is on, the whole
 * display is washed red, the red breathing up and down, with the buzzer when it
 * comes on. A wrong answer does NOT trigger it; that is shown on the option card.
 *
 * The value seen when the page loads is only a baseline, so a refresh or a
 * reconnect with the toggle already on shows the red but does not buzz again.
 */
export function BigXOverlay({ bigXOn }: { bigXOn: boolean }) {
  const seenOn = useRef<boolean | undefined>(undefined);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audio.current = new Audio('/sfx/bigx.wav');
    audio.current.volume = 0.6;
    audio.current.preload = 'auto';
  }, []);

  useEffect(() => {
    const first = seenOn.current === undefined;
    const turnedOn = !first && bigXOn && !seenOn.current;
    seenOn.current = bigXOn;
    const a = audio.current;
    if (turnedOn && a) {
      a.currentTime = 0;
      // Browsers block sound until someone has clicked the page once.
      a.play().catch(() => {});
    }
  }, [bigXOn]);

  if (!bigXOn) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div className="red-pulse absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.45),rgba(150,16,28,0.75))]" />
    </div>
  );
}
