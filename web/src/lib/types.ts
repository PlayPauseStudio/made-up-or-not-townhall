// Mirrors server/src/game/state.ts and redact.ts. Change both together.

export type TeamId = 'A' | 'B';
export type Phase = 'lobby' | 'toss' | 'board' | 'question' | 'scores' | 'final';

export type CoinSide = 'heads' | 'tails';
/**
 * The coin toss for who goes first: `heads` is the team that calls heads (the
 * other has tails). side/result/at are null until flipped; each new `at` is a new flip.
 */
export interface Toss {
  heads: TeamId;
  side: CoinSide | null;
  result: TeamId | null;
  at: number | null;
}

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const LETTERS = ['A', 'B', 'C', 'D'];

export interface Question {
  id: string;
  category: string;
  prompt: string;
  options: string[];
  correct: number;
  points: number;
  note: string;
}

export type QuestionInput = Omit<Question, 'id' | 'note' | 'points'> & {
  id?: string;
  note?: string;
  points?: number;
};

export interface Team {
  id: TeamId;
  name: string;
  players: [string, string];
  score: number;
}

export interface Round {
  questionId: string;
  teamId: TeamId;
  questionShown: boolean;
  revealedOptions: number[];
  teamAnswer: number | null;
  verdictShown: boolean;
  answerRevealed: boolean;
  awarded: { teamId: TeamId; points: number } | null;
}

export interface PlayedResult {
  questionId: string;
  teamId: TeamId;
  teamAnswer: number | null;
  correct: boolean;
  points: number;
  playedAt: number;
}

export interface Settings {
  alternateTurns: boolean;
  wrongPenalty: number;
  sounds: boolean;
  questionPoints: number;
}

export interface BoardTile {
  id: string;
  category: string;
  points: number;
  /** Picked for the next question; highlighted before the question shows. */
  selected: boolean;
  played: { teamId: TeamId; correct: boolean; points: number } | null;
}

export interface PublicRound {
  questionId: string;
  teamId: TeamId;
  category: string;
  prompt: string;
  points: number;
  options: (string | null)[];
  revealedOptions: number[];
  teamAnswer: number | null;
  verdictShown: boolean;
  answerRevealed: boolean;
  correct: number | null;
  awarded: Round['awarded'];
}

export interface OperatorState {
  title: string;
  phase: Phase;
  teams: [Team, Team];
  turn: TeamId;
  questions: Question[];
  played: Record<string, PlayedResult>;
  round: Round | null;
  settings: Settings;
  backup: BackupStatus | null;
  /** The show log is fetched only for export; the panel gets its size and latest line. */
  logCount: number;
  lastLog: LogEntry | null;
  titleImage: TitleImage | null;
  bigXOn: boolean;
  toss: Toss | null;
}

export interface LogEntry {
  at: number;
  event: string;
  team: string;
  category: string;
  question: string;
  detail: string;
  scoreA: number;
  scoreB: number;
}

export interface BackupStatus {
  mode: 'redis' | 'disabled';
  connected: boolean;
  restoredVersion: number | null;
  lastSavedAt: number | null;
  lastError: string | null;
}

export interface DisplayState {
  title: string;
  titleImage: TitleImage | null;
  bigXOn: boolean;
  phase: Phase;
  teams: [Team, Team];
  turn: TeamId;
  toss: Toss | null;
  sounds: boolean;
  board: BoardTile[];
  round: PublicRound | null;
}

export function teamOf<T extends { id: TeamId }>(teams: [T, T], id: TeamId): T {
  return id === 'A' ? teams[0] : teams[1];
}

export interface TitleImage {
  id: string;
  width: number;
  height: number;
}
