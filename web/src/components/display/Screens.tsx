import type { DisplayState } from '@/lib/types';
import { ShowTitle } from '@/components/ShowTitle';

/** Before the show: the title, big. */
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
    </div>
  );
}

/** The end: the title and a sign-off. No teams, no scores. */
export function Final({ state }: { state: DisplayState }) {
  const done = state.board.filter((t) => t.played).length;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vw] text-center">
      <h1 className="rise-in flex justify-center">
        <ShowTitle
          title={state.title}
          image={state.titleImage}
          textClassName="font-display text-[8vw] leading-none text-gold drop-shadow-[0_0.6vw_2vw_rgba(255,255,255,0.25)]"
          imageClassName="h-[18vw] max-w-[60vw]"
        />
      </h1>
      <p className="pop-in font-display text-[4vw] text-white">That&apos;s a wrap!</p>
      {done > 0 && <p className="font-display text-[2vw] text-white/60">{done} questions played</p>}
    </div>
  );
}
