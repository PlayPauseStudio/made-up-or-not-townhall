/**
 * The quiz show's authoritative state.
 *
 * Format (not final — kept data-driven so it can move):
 *   - Two teams of two players.
 *   - One grid of N category tiles (N is however many questions are loaded, up to 60).
 *   - Each tile hides one question with 2 to 4 options, one of them correct.
 *   - The team whose turn it is picks a tile and answers.
 *
 * The server holds everything, including the correct answers; redact.ts decides
 * what each screen is allowed to see.
 */

export type TeamId = 'A' | 'B';
export type CoinSide = 'heads' | 'tails';
export interface Toss {
  heads: TeamId;
  side: CoinSide | null;
  result: TeamId | null;
  at: number | null;
}

export type Phase = 'lobby' | 'toss' | 'board' | 'question' | 'scores' | 'final';

export const MAX_QUESTIONS = 60;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export interface Question {
  id: string;
  /** The label on the board tile. */
  category: string;
  prompt: string;
  /** 2 to 4 options. */
  options: string[];
  /** Index into `options`. */
  correct: number;
  points: number;
  /** Optional line for the host. Shown on the operator panel only, never the big screen. */
  note: string;
}

export interface Team {
  id: TeamId;
  name: string;
  players: [string, string];
  score: number;
}

/**
 * The tile currently being played. It moves forward one operator click at a
 * time, and every step is visible on the big screen:
 *
 *   1. selected        — tile picked; the board highlights it with its points
 *   2. questionShown   — display flips to the question, options hidden
 *   3. revealedOptions — options go up one by one, or all together
 *   4. teamAnswer      — the team's answer is locked (shown in their colour)
 *   5. verdictShown    — the lock is marked right or wrong; points move
 *   6. answerRevealed  — the correct option is shown (same click as 5 when right)
 */
export interface Round {
  questionId: string;
  /** The team answering this one. */
  teamId: TeamId;
  /** Step 2: the question is on the display. Until then only the tile is highlighted. */
  questionShown: boolean;
  /** Option indices the display is showing, in reveal order. */
  revealedOptions: number[];
  /** The team's locked answer, or null. */
  teamAnswer: number | null;
  /** Step 5: the locked answer has been marked right or wrong, and scored. */
  verdictShown: boolean;
  /** Step 6: the correct option is on screen. */
  answerRevealed: boolean;
  /** Points actually moved on reveal — kept so an un-reveal can undo exactly that. */
  awarded: { teamId: TeamId; points: number } | null;
}

/** What happened on a tile once its answer was revealed. */
export interface PlayedResult {
  questionId: string;
  teamId: TeamId;
  teamAnswer: number | null;
  correct: boolean;
  points: number;
  playedAt: number;
}

export interface Settings {
  /** Hand the turn to the other team when a tile is finished. */
  alternateTurns: boolean;
  /** Points a team loses for a wrong answer (0 = no penalty). */
  wrongPenalty: number;
  /** Play sound effects on the display. */
  sounds: boolean;
  /** Points for a right answer. Setting it moves every unplayed question to it; new questions start there. */
  questionPoints: number;
}

export interface GameState {
  title: string;
  phase: Phase;
  teams: [Team, Team];
  /** Whose pick it is on the board. */
  turn: TeamId;
  questions: Question[];
  /** Results keyed by question id — a tile here is spent. */
  played: Record<string, PlayedResult>;
  round: Round | null;
  settings: Settings;
  /** The operator's red-screen ("Big X") toggle: while on, the display pulses red. */
  bigXOn: boolean;
  /**
   * The coin toss for who goes first. The operator first assigns which team
   * calls heads (the other has tails); a flip then lands on a side, and that
   * side's team goes first. `at` is when the coin was flipped (each new flip
   * animates on the display); side/result/at are null until flipped.
   */
  toss: Toss | null;
  /** Uploaded title artwork (served by the server at /title-image/<id>.png); null = text title. */
  titleImage: TitleImage | null;
  /** Everything the operator did, in order — exported as the show log. Survives resets. */
  log: LogEntry[];
}

export interface TitleImage {
  /** Content hash — changes whenever a new image is uploaded, so caches never go stale. */
  id: string;
  width: number;
  height: number;
}

/** One line of the show log. Scores are both teams' totals right after the action. */
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

export function defaultSettings(): Settings {
  return {
    alternateTurns: true,
    wrongPenalty: 0,
    sounds: true,
    questionPoints: 10,
  };
}

export function defaultTeams(): [Team, Team] {
  return [
    { id: 'A', name: 'Team X', players: ['Player 1', 'Player 2'], score: 0 },
    { id: 'B', name: 'Team O', players: ['Player 3', 'Player 4'], score: 0 },
  ];
}

/** Placeholder board so a fresh deploy has something to click through. */
export function sampleQuestions(): Question[] {
  const q = (
    id: string,
    category: string,
    prompt: string,
    options: string[],
    correct: number,
    note = '',
  ): Question => ({ id, category, prompt, options, correct, points: 10, note });
  return [
    q('q1', 'Bollywood', 'Which film features the song "Kajra Re"?', ['Bunty Aur Babli', 'Dhoom', 'Salaam Namaste', 'Kal Ho Naa Ho'], 0),
    q('q2', 'Cricket', 'Sachin Tendulkar never captained India in a Test match.', ['Fact', 'Fiction'], 1, 'He captained India in 25 Tests.'),
    q('q3', 'Food', 'Which state is the dish "Thukpa" most associated with?', ['Kerala', 'Sikkim', 'Gujarat', 'Punjab'], 1),
    q('q4', 'Space', 'Which planet has a day longer than its year?', ['Mars', 'Venus', 'Jupiter'], 1),
    q('q5', 'Geography', 'What is the capital of Australia?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 2),
    q('q6', 'Animals', 'Octopuses have three hearts.', ['True', 'False'], 0),
    q('q7', 'Music', 'Which instrument did Ustad Zakir Hussain play?', ['Sitar', 'Tabla', 'Sarod', 'Santoor'], 1),
    q('q8', 'History', 'The Great Wall of China is visible from the Moon with the naked eye.', ['Fact', 'Fiction'], 1),
    q('q9', 'Tech', 'What does the "www" in a web address stand for?', ['World Wide Web', 'Wide World Web', 'Web World Wide', 'World Web Wide'], 0),
  ];
}

export function initialGameState(): GameState {
  return {
    title: 'Made Up or Not',
    phase: 'lobby',
    teams: defaultTeams(),
    turn: 'A',
    questions: sampleQuestions(),
    played: {},
    round: null,
    settings: defaultSettings(),
    bigXOn: false,
    toss: null,
    titleImage: null,
    log: [],
  };
}

export function otherTeam(id: TeamId): TeamId {
  return id === 'A' ? 'B' : 'A';
}
