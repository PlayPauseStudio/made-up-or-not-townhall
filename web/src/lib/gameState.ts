'use client';

/**
 * Socket-backed game-state manager. Nothing is written by the client: every
 * mutation is an intent emitted to the server, which validates it, applies it
 * and broadcasts the result back — so a page renders what the server says
 * happened, not what it hoped would happen.
 *
 * Each page connects as one role and receives that role's projection of the
 * state (see types.ts: OperatorState / DisplayState).
 */

import type { Socket } from 'socket.io-client';
import {
  createGameSocket,
  emitAck,
  OP,
  SRV,
  type Ack,
  type Role,
  type TokenProvider,
} from './realtime';
import type { CoinSide, LogEntry, Phase, QuestionInput, Settings, TeamId } from './types';

type Listener = () => void;
type StateMsg = { version: number; state: unknown };
type PatchMsg = { version: number; changed: Record<string, unknown> };

/** Handshake refusals that retrying the same credential cannot fix. */
const AUTH_REFUSALS = new Set([
  'unauthorized',
  'operator_token_required',
  'display_key_invalid',
  'invalid_role',
]);

class GameStateManager {
  private socket: Socket | null = null;
  private role: Role | null = null;
  private identity: string | undefined;
  private state: unknown = null;
  private connected = false;
  private authError: string | null = null;
  private listeners = new Set<Listener>();
  private teardown: (() => void) | null = null;

  /** Open (or reuse) the socket. Idempotent for the same role + identity. */
  connect(role: Role, getToken?: TokenProvider, identity?: string): void {
    if (this.role === role && this.identity === identity && this.socket) return;
    this.disconnect();
    this.role = role;
    this.identity = identity;
    this.authError = null;
    this.openSocket(role, getToken);
  }

  private openSocket(role: Role, getToken?: TokenProvider): void {
    const socket = createGameSocket(role, getToken);
    this.socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      this.authError = null;
      this.emitChange();
    });
    socket.on('disconnect', () => {
      this.connected = false;
      this.emitChange();
    });
    socket.on('connect_error', (err: Error) => {
      this.connected = false;
      const reason = err?.message ?? 'connect_error';
      if (AUTH_REFUSALS.has(reason)) {
        this.authError = reason;
        // A refused credential (an expired operator JWT) never fixes itself.
        socket.disconnect();
      }
      this.emitChange();
    });
    socket.on(SRV.STATE_FULL, (msg: StateMsg) => {
      this.state = msg.state;
      this.emitChange();
    });
    socket.on(SRV.STATE_PATCH, (msg: PatchMsg) => {
      this.state = { ...((this.state as object) ?? {}), ...msg.changed };
      this.emitChange();
    });

    // Laptops drop the socket when they sleep or the tab is hidden. Reconnect the moment the
    // page is visible again; the server answers with a fresh state:full.
    if (typeof document !== 'undefined') {
      const resume = () => {
        if (document.visibilityState !== 'visible') return;
        if (!socket.connected) socket.connect();
      };
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('online', resume);
      window.addEventListener('focus', resume);
      this.teardown = () => {
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('online', resume);
        window.removeEventListener('focus', resume);
      };
    }
  }

  disconnect(): void {
    this.teardown?.();
    this.teardown = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.connected = false;
    this.authError = null;
    this.role = null;
    this.identity = undefined;
    this.state = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getAuthError(): string | null {
    return this.authError;
  }

  getState(): unknown {
    return this.state;
  }

  private emitChange(): void {
    this.listeners.forEach((fn) => fn());
  }

  subscribe(deliver: Listener): () => void {
    this.listeners.add(deliver);
    return () => {
      this.listeners.delete(deliver);
    };
  }

  private emit(event: string, payload?: unknown): Promise<Ack> {
    if (!this.socket) return Promise.resolve({ ok: false, error: 'not_connected' });
    return emitAck(this.socket, event, payload);
  }

  // ── Operator ───────────────────────────────────────────────────────────────
  setTitle = (title: string) => this.emit(OP.SET_TITLE, { title });
  setTitleImage = (dataUrl: string | null) => this.emit(OP.SET_TITLE_IMAGE, { dataUrl });
  setBigX = (value: boolean) => this.emit(OP.SET_BIG_X, { value });
  setTeams = (teams: { id: TeamId; name: string; players: [string, string] }[]) =>
    this.emit(OP.SET_TEAMS, { teams });
  setSettings = (settings: Partial<Settings>) => this.emit(OP.SET_SETTINGS, { settings });
  replaceQuestions = (questions: QuestionInput[]) => this.emit(OP.REPLACE_QUESTIONS, { questions });
  upsertQuestion = (question: QuestionInput) => this.emit(OP.UPSERT_QUESTION, { question });
  deleteQuestion = (questionId: string) => this.emit(OP.DELETE_QUESTION, { questionId });
  moveQuestion = (questionId: string, toIndex: number) =>
    this.emit(OP.MOVE_QUESTION, { questionId, toIndex });
  setPhase = (phase: Phase) => this.emit(OP.SET_PHASE, { phase });
  /** Flip the coin (random), or land it on `teamId`. */
  tossCall = (heads: TeamId) => this.emit(OP.TOSS_CALL, { heads });
  toss = (side?: CoinSide) => this.emit(OP.TOSS, side ? { side } : {});
  setTurn = (teamId: TeamId) => this.emit(OP.SET_TURN, { teamId });
  openTile = (questionId: string, teamId?: TeamId) => this.emit(OP.OPEN_TILE, { questionId, teamId });
  showQuestion = () => this.emit(OP.SHOW_QUESTION);
  hideQuestion = () => this.emit(OP.HIDE_QUESTION);
  showVerdict = () => this.emit(OP.SHOW_VERDICT);
  setRoundTeam = (teamId: TeamId) => this.emit(OP.SET_ROUND_TEAM, { teamId });
  revealOption = (index?: number) => this.emit(OP.REVEAL_OPTION, index === undefined ? {} : { index });
  revealAllOptions = () => this.emit(OP.REVEAL_ALL_OPTIONS);
  hideOption = (index: number) => this.emit(OP.HIDE_OPTION, { index });
  lockAnswer = (choice: number | null) => this.emit(OP.LOCK_ANSWER, { choice });
  revealAnswer = () => this.emit(OP.REVEAL_ANSWER);
  unrevealAnswer = () => this.emit(OP.UNREVEAL_ANSWER);
  closeRound = () => this.emit(OP.CLOSE_ROUND);
  goToStep = (step: number) => this.emit(OP.GO_TO_STEP, { step });
  resetTile = (questionId: string) => this.emit(OP.RESET_TILE, { questionId });
  adjustScore = (teamId: TeamId, delta: number) => this.emit(OP.ADJUST_SCORE, { teamId, delta });
  setScore = (teamId: TeamId, score: number) => this.emit(OP.SET_SCORE, { teamId, score });
  newGame = () => this.emit(OP.NEW_GAME);
  fullReset = () => this.emit(OP.FULL_RESET);
  clearLog = () => this.emit(OP.CLEAR_LOG);
  /** The whole show log, for export (it is not part of the operator state). */
  getLog = async (): Promise<LogEntry[] | null> => {
    const ack = (await this.emit(OP.GET_LOG)) as { ok: boolean; log?: LogEntry[] };
    return ack.ok && ack.log ? ack.log : null;
  };
}

export const game = new GameStateManager();
