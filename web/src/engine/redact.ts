import { type GameState, type Round, type TeamId } from './state';
import type { BackupStatus as SnapshotStatus } from '@/lib/types';

/**
 * What each screen is allowed to see.
 *
 * The rule that matters: until the operator reveals it, the correct answer
 * exists only on the server and the operator panel. The display gets the
 * prompt and the options that are up — never `correct` before the reveal, never
 * an option that has not been revealed yet, and never the host's notes.
 */

export interface BoardTile {
  id: string;
  category: string;
  points: number;
  /** The tile picked for the next question — highlighted on the board before the question shows. */
  selected: boolean;
  /** Set once the tile is spent. */
  played: { teamId: TeamId; correct: boolean; points: number } | null;
}

export interface PublicRound {
  questionId: string;
  teamId: TeamId;
  category: string;
  prompt: string;
  points: number;
  /** One slot per option; null until that option is revealed. */
  options: (string | null)[];
  revealedOptions: number[];
  teamAnswer: number | null;
  /** The locked answer has been marked right or wrong. */
  verdictShown: boolean;
  answerRevealed: boolean;
  /** Only after the reveal. */
  correct: number | null;
  awarded: Round['awarded'];
}

/** Every tile on the board, in question order. */
function board(gs: GameState): BoardTile[] {
  return gs.questions.map((q) => {
    const p = gs.played[q.id];
    return {
      id: q.id,
      category: q.category,
      points: q.points,
      selected: gs.round?.questionId === q.id,
      played: p ? { teamId: p.teamId, correct: p.correct, points: p.points } : null,
    };
  });
}

function publicRound(gs: GameState): PublicRound | null {
  const r = gs.round;
  // Until step 2 the room knows which tile was picked (board highlight), nothing more.
  if (!r || !r.questionShown) return null;
  const q = gs.questions.find((x) => x.id === r.questionId);
  if (!q) return null;
  return {
    questionId: r.questionId,
    teamId: r.teamId,
    category: q.category,
    prompt: q.prompt,
    points: q.points,
    options: q.options.map((o, i) => (r.revealedOptions.includes(i) ? o : null)),
    revealedOptions: r.revealedOptions,
    teamAnswer: r.teamAnswer,
    verdictShown: r.verdictShown,
    answerRevealed: r.answerRevealed,
    correct: r.answerRevealed ? q.correct : null,
    awarded: r.verdictShown ? r.awarded : null,
  };
}

/**
 * The operator sees everything except the full show log, which can run to
 * thousands of lines and would be re-sent on every click — the panel gets its
 * size and latest line, and fetches the whole log only to export it.
 */
export function operatorView(gs: GameState, backup?: SnapshotStatus) {
  const { log, ...rest } = gs;
  return {
    ...rest,
    logCount: log.length,
    lastLog: log.length ? log[log.length - 1] : null,
    backup: backup ?? null,
  };
}

export function displayView(gs: GameState) {
  return {
    title: gs.title,
    titleImage: gs.titleImage,
    bigXOn: gs.bigXOn,
    phase: gs.phase,
    teams: gs.teams,
    turn: gs.turn,
    toss: gs.toss,
    sounds: gs.settings.sounds,
    board: board(gs),
    round: publicRound(gs),
  };
}

export type OperatorView = ReturnType<typeof operatorView>;
export type DisplayView = ReturnType<typeof displayView>;
