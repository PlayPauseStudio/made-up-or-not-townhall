import { OP } from './events';
import type { GameState, LogEntry, Question, TeamId } from './state';
import { otherTeam } from './state';
import { roundStep } from './reducers';

/**
 * Turns one accepted operator action into a line of the show log.
 *
 * Reducers stay pure; this looks at the state before and after the action and
 * says, in plain words, what happened on stage. Play-along controls are left
 * out on purpose — the play-along is likely to be dropped from the show.
 * Returns null for actions that are not worth a line.
 */

/** A long show is a few hundred lines; this only stops a runaway loop filling memory. */
export const MAX_LOG = 5000;

const STEP_NAME = ['Select tile', 'Reveal question', 'Show options', 'Lock answer', 'Right or wrong', 'Correct answer', 'Done'];

const PHASE_NAME: Record<string, string> = {
  lobby: 'Lobby',
  board: 'Board',
  question: 'Question',
  scores: 'Scores',
  final: 'Final',
};

function teamName(gs: GameState, id: TeamId | undefined): string {
  if (!id) return '';
  return (id === 'A' ? gs.teams[0] : gs.teams[1]).name;
}

function optionText(q: Question | undefined, i: number | null | undefined): string {
  if (!q || i === null || i === undefined) return '';
  return `${'ABCD'[i]} — ${q.options[i]}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

type Payload = Record<string, unknown>;

export function describe(event: string, payload: Payload, before: GameState, after: GameState, now = Date.now()): LogEntry | null {
  const round = after.round ?? before.round;
  const qid = round?.questionId ?? (payload.questionId as string | undefined);
  const q = after.questions.find((x) => x.id === qid) ?? before.questions.find((x) => x.id === qid);

  // Defaults: the tile in play (if any) and the team answering it.
  let team = teamName(after, round?.teamId);
  let category = q?.category ?? '';
  let question = q?.prompt ?? '';
  let label: string;
  let detail = '';

  switch (event) {
    case OP.OPEN_TILE:
      label = 'Tile selected';
      break;
    case OP.SHOW_QUESTION:
      label = 'Question revealed';
      break;
    case OP.HIDE_QUESTION:
      label = 'Question hidden (step back)';
      break;
    case OP.REVEAL_OPTION: {
      const added = (after.round?.revealedOptions ?? []).filter((i) => !(before.round?.revealedOptions ?? []).includes(i));
      if (!added.length) return null;
      label = 'Option shown';
      detail = added.map((i) => optionText(q, i)).join(', ');
      break;
    }
    case OP.REVEAL_ALL_OPTIONS:
      label = 'All options shown';
      break;
    case OP.HIDE_OPTION:
      label = 'Option hidden (step back)';
      detail = optionText(q, payload.index as number);
      break;
    case OP.SET_ROUND_TEAM:
      label = 'Answering team changed';
      break;
    case OP.LOCK_ANSWER:
      if (payload.choice === null) {
        label = 'Lock cleared (step back)';
        detail = optionText(q, before.round?.teamAnswer);
      } else {
        label = 'Answer locked';
        detail = optionText(q, payload.choice as number);
      }
      break;
    case OP.SHOW_VERDICT: {
      const r = after.round;
      const right = r !== null && q !== undefined && r.teamAnswer === q.correct;
      label = right ? 'Answer right' : 'Answer wrong';
      detail = `${optionText(q, r?.teamAnswer)} · ${signed(r?.awarded?.points ?? 0)} pts`;
      break;
    }
    case OP.REVEAL_ANSWER:
      label = before.round?.verdictShown ? 'Correct answer revealed' : 'No answer — correct answer revealed';
      detail = optionText(q, q?.correct);
      break;
    case OP.UNREVEAL_ANSWER: {
      if (!before.round?.verdictShown) return null;
      const keptVerdict = after.round?.verdictShown;
      label = keptVerdict ? 'Correct answer hidden (step back)' : 'Verdict undone (step back)';
      if (!keptVerdict && before.round.awarded) detail = `${signed(-before.round.awarded.points)} pts reversed`;
      break;
    }
    case OP.GO_TO_STEP: {
      const from = roundStep(before);
      const to = roundStep(after);
      if (from === to) return null;
      label = to < from ? 'Jumped back a step' : 'Jumped ahead';
      detail = `${STEP_NAME[from]} → ${STEP_NAME[to]}`;
      if (before.round?.awarded && !after.round?.verdictShown && before.round.verdictShown) {
        detail += ` (${signed(-before.round.awarded.points)} pts reversed)`;
      }
      break;
    }
    case OP.CLOSE_ROUND:
      if (!before.round) return null;
      label = before.round.verdictShown ? 'Back to board' : 'Tile cancelled (not played)';
      break;
    case OP.RESET_TILE: {
      const p = before.played[payload.questionId as string];
      if (!p) return null;
      label = 'Played tile put back on the board';
      team = teamName(before, p.teamId);
      detail = `${signed(-p.points)} pts reversed`;
      break;
    }
    case OP.TOSS:
      label = (payload.side ? 'Coin toss (set by operator)' : 'Coin toss');
      team = teamName(after, after.toss?.result ?? undefined);
      detail = `${after.toss?.side === 'heads' ? 'Heads' : 'Tails'} — ${teamName(after, after.toss?.result ?? undefined)} goes first`;
      category = question = '';
      break;
    case OP.TOSS_CALL:
      label = 'Toss call';
      team = teamName(after, after.toss?.heads);
      detail = `${teamName(after, after.toss?.heads)} heads, ${teamName(after, after.toss ? otherTeam(after.toss.heads) : undefined)} tails`;
      category = question = '';
      break;
    case OP.SET_TURN:
      label = 'Turn set';
      team = teamName(after, payload.teamId as TeamId);
      category = question = '';
      break;
    case OP.ADJUST_SCORE:
      label = 'Score adjusted by hand';
      team = teamName(after, payload.teamId as TeamId);
      detail = `${signed(payload.delta as number)} pts`;
      category = question = '';
      break;
    case OP.SET_SCORE:
      label = 'Score set by hand';
      team = teamName(after, payload.teamId as TeamId);
      detail = `set to ${payload.score as number}`;
      category = question = '';
      break;
    case OP.SET_PHASE:
      if (before.phase === after.phase) return null;
      label = 'Display changed';
      detail = PHASE_NAME[after.phase] ?? after.phase;
      team = category = question = '';
      break;
    case OP.SET_TITLE:
      label = 'Show title changed';
      detail = after.title;
      team = category = question = '';
      break;
    case OP.SET_BIG_X:
      if (before.bigXOn === after.bigXOn) return null;
      label = after.bigXOn ? 'Big X on' : 'Big X off';
      break;
    case OP.SET_TITLE_IMAGE:
      label = after.titleImage ? 'Title image uploaded' : 'Title image removed';
      detail = after.titleImage ? `${after.titleImage.width}×${after.titleImage.height}px` : '';
      team = category = question = '';
      break;
    case OP.SET_TEAMS:
      label = 'Teams edited';
      detail = after.teams.map((t) => `${t.name} (${t.players.join(' & ')})`).join(' vs ');
      team = category = question = '';
      break;
    case OP.SET_SETTINGS:
      label = 'Rules changed';
      detail = Object.entries((payload.settings ?? {}) as Payload)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
      team = category = question = '';
      break;
    case OP.REPLACE_QUESTIONS:
      label = 'Questions imported';
      detail = `${after.questions.length} questions`;
      team = category = question = '';
      break;
    case OP.UPSERT_QUESTION: {
      const input = payload.question as { id?: string; category: string; prompt: string };
      const existed = input.id && before.questions.some((x) => x.id === input.id);
      label = existed ? 'Question edited' : 'Question added';
      category = input.category;
      question = input.prompt;
      const diffA = after.teams[0].score - before.teams[0].score;
      const diffB = after.teams[1].score - before.teams[1].score;
      if (diffA || diffB) {
        detail = `re-scored: ${after.teams[0].name} ${signed(diffA)}, ${after.teams[1].name} ${signed(diffB)}`;
      }
      team = '';
      break;
    }
    case OP.DELETE_QUESTION:
      label = 'Question deleted';
      team = '';
      break;
    case OP.NEW_GAME:
      label = 'New game (scores and tiles cleared)';
      team = category = question = '';
      break;
    case OP.FULL_RESET:
      label = 'Full reset';
      team = category = question = '';
      break;
    default:
      // Reordering and similar housekeeping are not part of the show log.
      return null;
  }

  return {
    at: now,
    event: label,
    team,
    category,
    question,
    detail,
    scoreA: after.teams[0].score,
    scoreB: after.teams[1].score,
  };
}
