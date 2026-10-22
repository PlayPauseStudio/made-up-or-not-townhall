import type { GameState } from './state';
import { initialGameState } from './state';
import type { Patch } from './reducers';

export interface Snapshot {
  version: number;
  state: GameState;
}

/**
 * Authoritative in-memory store for one show. Holds the current GameState plus
 * a monotonic version counter clients use to order updates.
 */
export class RoomStore {
  private state: GameState;
  private _version = 0;

  constructor(
    public readonly roomId: string,
    initial?: GameState,
  ) {
    this.state = initial ?? initialGameState();
  }

  get version(): number {
    return this._version;
  }

  getState(): GameState {
    return this.state;
  }

  /** Shallow-merge changed top-level slices and bump the version. */
  applyPatch(patch: Patch): number {
    if (Object.keys(patch).length === 0) return this._version;
    this.state = { ...this.state, ...patch };
    return ++this._version;
  }

  /** Full replacement (new game / reset) and bump the version. */
  replace(next: GameState): number {
    this.state = next;
    return ++this._version;
  }

  snapshot(): Snapshot {
    return { version: this._version, state: this.state };
  }

  restore(snap: Snapshot): void {
    // Keep only fields the current game knows: older snapshots carry play-along
    // data (players, answers, …) that must not be restored and re-broadcast.
    const fresh = initialGameState();
    const saved = snap.state as Partial<GameState> & Record<string, unknown>;
    const state = { ...fresh } as GameState;
    for (const k of Object.keys(fresh) as (keyof GameState)[]) {
      if (saved[k] !== undefined) (state as unknown as Record<string, unknown>)[k] = saved[k];
    }
    if (state.round) {
      const { window: _w, ...round } = state.round as typeof state.round & { window?: unknown };
      state.round = round;
    }
    // Snapshots from before the step-by-step flow have no step flags on a live round.
    if (state.round && state.round.questionShown === undefined) {
      state.round = { ...state.round, questionShown: true, verdictShown: state.round.answerRevealed };
    }
    // Snapshots from older versions miss settings added since.
    state.settings = { ...initialGameState().settings, ...state.settings };
    this.state = state;
    this._version = snap.version;
  }
}
