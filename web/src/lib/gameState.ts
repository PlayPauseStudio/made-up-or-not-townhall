'use client';

/**
 * Game-state manager for the pages. There is no server: actions run through the
 * in-browser engine (src/engine/local.ts), which saves the game in this browser
 * and tells every other window of it (operator, display) to re-read.
 *
 * Each page asks for one role and gets that role's projection of the state
 * (see types.ts: OperatorState / DisplayState) — the display still never sees a
 * correct answer before the reveal.
 */

import { dispatch, displayState, fullLog, onChange, operatorState } from '@/engine/local';
import { OP, type Ack, type Role, type TokenProvider } from './realtime';
import type { CoinSide, LogEntry, Phase, QuestionInput, Settings, TeamId } from './types';

type Listener = () => void;

class GameStateManager {
  private role: Role | null = null;
  private state: unknown = null;
  private listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;

  /** Start following the saved game as `role`. Idempotent for the same role. */
  connect(role: Role, _getToken?: TokenProvider, _identity?: string): void {
    if (this.role === role && this.unsubscribe) return;
    this.disconnect();
    this.role = role;
    this.refresh();
    this.unsubscribe = onChange(() => this.refresh());
  }

  private refresh(): void {
    if (!this.role) return;
    this.state = this.role === 'operator' ? operatorState() : displayState();
    this.listeners.forEach((fn) => fn());
  }

  disconnect(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.role = null;
    this.state = null;
  }

  /** Always "connected": everything is in this browser. */
  isConnected(): boolean {
    return this.role !== null;
  }

  getAuthError(): string | null {
    return null;
  }

  getState(): unknown {
    return this.state;
  }

  subscribe(deliver: Listener): () => void {
    this.listeners.add(deliver);
    return () => {
      this.listeners.delete(deliver);
    };
  }

  private emit(event: string, payload?: unknown): Promise<Ack> {
    return dispatch(event, (payload ?? {}) as Record<string, unknown>);
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
  /** Assign who calls heads, then flip (random) or land it on `side`. */
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
  /** The whole show log, for export. */
  getLog = async (): Promise<LogEntry[] | null> => fullLog() as LogEntry[];
}

export const game = new GameStateManager();
