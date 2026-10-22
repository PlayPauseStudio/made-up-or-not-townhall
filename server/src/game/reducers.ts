import {
  type GameState,
  type Phase,
  type Question,
  type Round,
  type Settings,
  type Team,
  type TeamId,
  type PlayedResult,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  type TitleImage,
  initialGameState,
  otherTeam,
  type CoinSide,
} from './state';

/**
 * Pure state transitions. Each takes the current state and returns either the
 * top-level slices that changed or an error code; the store applies the patch
 * and the broadcaster fans it out. Nothing here touches sockets or timers.
 */
export type Patch = Partial<GameState>;
export type Result = { ok: true; patch: Patch } | { ok: false; error: string };

const ok = (patch: Patch): Result => ({ ok: true, patch });
const fail = (error: string): Result => ({ ok: false, error });

function teamIndex(id: TeamId): 0 | 1 {
  return id === 'A' ? 0 : 1;
}

function withScore(gs: GameState, id: TeamId, delta: number): [Team, Team] {
  const teams = gs.teams.map((t) => ({ ...t })) as [Team, Team];
  teams[teamIndex(id)].score += delta;
  return teams;
}

function questionById(gs: GameState, id: string): Question | undefined {
  return gs.questions.find((q) => q.id === id);
}

function liveQuestion(gs: GameState): Question | undefined {
  return gs.round ? questionById(gs, gs.round.questionId) : undefined;
}

// ── Show setup ───────────────────────────────────────────────────────────────

export function setTitle(_gs: GameState, title: string): Result {
  return ok({ title });
}

export interface TeamInput {
  id: TeamId;
  name: string;
  players: [string, string];
}

export function setTeams(gs: GameState, input: TeamInput[]): Result {
  const teams = gs.teams.map((t) => {
    const next = input.find((i) => i.id === t.id);
    return next ? { ...t, name: next.name, players: next.players } : t;
  }) as [Team, Team];
  return ok({ teams });
}

export function adjustScore(gs: GameState, teamId: TeamId, delta: number): Result {
  return ok({ teams: withScore(gs, teamId, delta) });
}

export function setScore(gs: GameState, teamId: TeamId, score: number): Result {
  const current = gs.teams[teamIndex(teamId)].score;
  return ok({ teams: withScore(gs, teamId, score - current) });
}

export function setTurn(_gs: GameState, turn: TeamId): Result {
  return ok({ turn });
}

export function setPhase(gs: GameState, phase: Phase): Result {
  if (phase === 'question' && !gs.round?.questionShown) return fail('question_not_shown');
  return ok({ phase });
}

export function setSettings(gs: GameState, settings: Partial<Settings>): Result {
  const patch: Patch = { settings: { ...gs.settings, ...settings } };
  // "Points for a right answer" applies to every question not yet played.
  // Played ones keep what they scored, so the scoreboard never shifts.
  const pts = settings.questionPoints;
  if (pts !== undefined && pts !== gs.settings.questionPoints) {
    patch.questions = gs.questions.map((q) => (gs.played[q.id] || gs.round?.questionId === q.id ? q : { ...q, points: pts }));
  }
  return ok(patch);
}

// ── Questions ────────────────────────────────────────────────────────────────

export type QuestionInput = Omit<Question, 'id' | 'note' | 'points'> & {
  id?: string;
  note?: string;
  points?: number;
};

let idCounter = 0;
function newId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `q${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Normalise and validate one question; returns an error code if it is unusable. */
function normaliseQuestion(input: QuestionInput, id: string, defaultPoints = 10): Question | string {
  const options = input.options.map((o) => o.trim());
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS || options.some((o) => !o)) {
    return 'bad_options';
  }
  if (!Number.isInteger(input.correct) || input.correct < 0 || input.correct >= options.length) {
    return 'bad_correct_answer';
  }
  return {
    id,
    category: input.category.trim(),
    prompt: input.prompt.trim(),
    options,
    correct: input.correct,
    points: input.points ?? defaultPoints,
    note: (input.note ?? '').trim(),
  };
}

/**
 * Replace the whole board (CSV import). Refused while a tile is live, because
 * the round would point at a question that may no longer exist. Results for
 * questions whose id survives are kept; everything else is dropped.
 */
export function replaceQuestions(gs: GameState, inputs: QuestionInput[]): Result {
  if (gs.round) return fail('round_in_progress');
  if (inputs.length > MAX_QUESTIONS) return fail('too_many_questions');
  const questions: Question[] = [];
  for (const input of inputs) {
    const q = normaliseQuestion(input, input.id || newId(), gs.settings.questionPoints);
    if (typeof q === 'string') return fail(q);
    questions.push(q);
  }
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) return fail('duplicate_question_id');
  const played = Object.fromEntries(Object.entries(gs.played).filter(([id]) => ids.has(id)));
  return ok({ questions, played });
}

/**
 * Add a question, or edit one in place. Editing the correct answer of a tile
 * that has already been played re-scores it, so a mistake in the sheet can be
 * fixed mid-show without hand-adjusting the scoreboard.
 */
export function upsertQuestion(gs: GameState, input: QuestionInput): Result {
  const existing = input.id ? questionById(gs, input.id) : undefined;
  if (!existing && gs.questions.length >= MAX_QUESTIONS) return fail('too_many_questions');
  const q = normaliseQuestion(input, existing?.id ?? newId(), existing?.points ?? gs.settings.questionPoints);
  if (typeof q === 'string') return fail(q);

  const questions = existing
    ? gs.questions.map((x) => (x.id === q.id ? q : x))
    : [...gs.questions, q];

  const result = gs.played[q.id];
  if (!result) return ok({ questions });

  // Re-score a played tile against the corrected answer / points.
  const nowCorrect = result.teamAnswer !== null && result.teamAnswer === q.correct;
  const nowPoints = nowCorrect ? q.points : result.teamAnswer === null ? 0 : -gs.settings.wrongPenalty;
  const delta = nowPoints - result.points;
  const played = { ...gs.played, [q.id]: { ...result, correct: nowCorrect, points: nowPoints } };
  const patch: Patch = { questions, played };
  if (delta !== 0) patch.teams = withScore(gs, result.teamId, delta);
  if (gs.round?.questionId === q.id && gs.round.awarded) {
    patch.round = { ...gs.round, awarded: { teamId: result.teamId, points: nowPoints } };
  }
  return ok(patch);
}

export function deleteQuestion(gs: GameState, id: string): Result {
  if (gs.round?.questionId === id) return fail('question_is_live');
  if (!questionById(gs, id)) return fail('unknown_question');
  const played = { ...gs.played };
  delete played[id];
  return ok({ questions: gs.questions.filter((q) => q.id !== id), played });
}

export function moveQuestion(gs: GameState, id: string, toIndex: number): Result {
  const from = gs.questions.findIndex((q) => q.id === id);
  if (from < 0) return fail('unknown_question');
  const questions = [...gs.questions];
  const [q] = questions.splice(from, 1);
  questions.splice(Math.max(0, Math.min(toIndex, questions.length)), 0, q);
  return ok({ questions });
}

// ── A round (one tile) ───────────────────────────────────────────────────────

/**
 * Step 1 — pick a tile for `teamId` (default: whose turn it is). The display
 * stays on the board with the tile highlighted; nothing about the question is
 * public yet. Picking another tile before the question is shown just moves the
 * highlight.
 */
export function openTile(gs: GameState, questionId: string, teamId?: TeamId): Result {
  if (gs.round && gs.round.questionShown) return fail('round_in_progress');
  const q = questionById(gs, questionId);
  if (!q) return fail('unknown_question');
  if (gs.played[questionId]) return fail('already_played');

  const round: Round = {
    questionId,
    teamId: teamId ?? gs.round?.teamId ?? gs.turn,
    questionShown: false,
    revealedOptions: [],
    teamAnswer: null,
    verdictShown: false,
    answerRevealed: false,
    awarded: null,
  };
  return ok({ round, phase: 'board' });
}

/** Step 2 — flip the display to the question. Options stay hidden. */
export function showQuestion(gs: GameState, now = Date.now()): Result {
  if (!gs.round) return fail('no_round');
  if (gs.round.questionShown) return ok({ phase: 'question' });
  return ok({ round: { ...gs.round, questionShown: true }, phase: 'question' });
}

/** Take step 2 back: the display returns to the board, tile still highlighted. */
export function hideQuestion(gs: GameState): Result {
  if (!gs.round) return fail('no_round');
  const r = gs.round;
  if (r.revealedOptions.length || r.teamAnswer !== null || r.verdictShown) {
    return fail('question_in_play');
  }
  return ok({ round: { ...r, questionShown: false }, phase: 'board' });
}

export function setRoundTeam(gs: GameState, teamId: TeamId): Result {
  if (!gs.round) return fail('no_round');
  if (gs.round.verdictShown) return fail('already_judged');
  return ok({ round: { ...gs.round, teamId } });
}

/** Step 3 — show one option (the next hidden one by default). */
export function revealOption(gs: GameState, index?: number): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  if (!gs.round.questionShown) return fail('question_not_shown');
  const shown = gs.round.revealedOptions;
  const next = index ?? q.options.findIndex((_, i) => !shown.includes(i));
  if (next < 0 || next >= q.options.length) return fail('nothing_to_reveal');
  if (shown.includes(next)) return ok({});
  return ok({ round: { ...gs.round, revealedOptions: [...shown, next] } });
}

/** Step 3 — show every remaining option at once. */
export function revealAllOptions(gs: GameState): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  if (!gs.round.questionShown) return fail('question_not_shown');
  const shown = gs.round.revealedOptions;
  const rest = q.options.map((_, i) => i).filter((i) => !shown.includes(i));
  return ok({ round: { ...gs.round, revealedOptions: [...shown, ...rest] } });
}

export function hideOption(gs: GameState, index: number): Result {
  if (!gs.round) return fail('no_round');
  if (gs.round.verdictShown) return fail('already_judged');
  if (gs.round.teamAnswer === index) return fail('option_is_locked');
  return ok({
    round: { ...gs.round, revealedOptions: gs.round.revealedOptions.filter((i) => i !== index) },
  });
}

/** Step 4 — lock the team's answer (null clears it). Only an option on screen can be locked. */
export function lockTeamAnswer(gs: GameState, choice: number | null): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  if (gs.round.verdictShown) return fail('already_judged');
  if (choice !== null && !gs.round.revealedOptions.includes(choice)) return fail('option_not_shown');
  return ok({ round: { ...gs.round, teamAnswer: choice } });
}

/**
 * Step 5 — mark the locked answer right or wrong, and score it. A right answer
 * is also the correct answer, so it is revealed in the same click; a wrong one
 * leaves the correct option hidden for step 6.
 */
export function showVerdict(gs: GameState, now = Date.now()): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  if (gs.round.verdictShown) return ok({});
  const { teamId, teamAnswer } = gs.round;
  if (teamAnswer === null) return fail('no_locked_answer');
  const correct = teamAnswer === q.correct;
  const points = correct ? q.points : -gs.settings.wrongPenalty;
  const result: PlayedResult = { questionId: q.id, teamId, teamAnswer, correct, points, playedAt: now };
  return ok({
    round: {
      ...gs.round,
      verdictShown: true,
      answerRevealed: correct,
      awarded: { teamId, points },
    },
    played: { ...gs.played, [q.id]: result },
    teams: withScore(gs, teamId, points),
  });
}

/**
 * Step 6 — put the correct option on screen. If the team never locked an
 * answer, this is also the verdict (no points), so a tile can always be closed
 * out.
 */
export function revealAnswer(gs: GameState, now = Date.now()): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  if (!gs.round.questionShown) return fail('question_not_shown');
  if (gs.round.answerRevealed) return ok({});
  // Everything goes up with the answer, even options the host never got to.
  const allShown = q.options.map((_, i) => i);
  if (gs.round.verdictShown) {
    return ok({ round: { ...gs.round, answerRevealed: true, revealedOptions: allShown } });
  }
  if (gs.round.teamAnswer !== null) return fail('verdict_first');
  const { teamId } = gs.round;
  const result: PlayedResult = { questionId: q.id, teamId, teamAnswer: null, correct: false, points: 0, playedAt: now };
  return ok({
    round: {
      ...gs.round,
      verdictShown: true,
      answerRevealed: true,
      revealedOptions: allShown,
      awarded: { teamId, points: 0 },
    },
    played: { ...gs.played, [q.id]: result },
  });
}

/**
 * Step back once: hide the correct answer if a wrong verdict is showing it,
 * otherwise take the verdict back along with the points it moved.
 */
export function unrevealAnswer(gs: GameState): Result {
  if (!gs.round) return fail('no_round');
  const r = gs.round;
  if (!r.verdictShown) return ok({});
  const wasRight = r.teamAnswer !== null && r.awarded !== null && gs.played[r.questionId]?.correct;
  if (r.answerRevealed && !wasRight && r.teamAnswer !== null) {
    return ok({ round: { ...r, answerRevealed: false } });
  }
  const played = { ...gs.played };
  delete played[r.questionId];
  const awarded = r.awarded;
  return ok({
    round: { ...r, verdictShown: false, answerRevealed: false, awarded: null },
    played,
    teams: awarded ? withScore(gs, awarded.teamId, -awarded.points) : gs.teams,
  });
}

/**
 * Leave the tile and go back to the board. A judged tile stays spent and the
 * turn passes on; one that never reached a verdict is put back, unplayed.
 */
export function closeRound(gs: GameState): Result {
  if (!gs.round) return ok({ phase: 'board' });
  const spent = gs.round.verdictShown;
  const patch: Patch = { round: null, phase: 'board' };
  if (spent && gs.settings.alternateTurns) patch.turn = otherTeam(gs.round.teamId);
  return ok(patch);
}

/** Put a spent tile back on the board, reversing whatever it scored. */
export function resetTile(gs: GameState, questionId: string): Result {
  if (gs.round?.questionId === questionId) return fail('question_is_live');
  const result = gs.played[questionId];
  if (!result) return ok({});
  const played = { ...gs.played };
  delete played[questionId];
  return ok({ played, teams: withScore(gs, result.teamId, -result.points) });
}

// ── Big X and title artwork ──────────────────────────────────────────────────

/** The operator's Big X toggle: on holds the full-screen X up until it is switched off. */
export function setBigX(_gs: GameState, on: boolean): Result {
  return ok({ bigXOn: on });
}

export function setTitleImage(_gs: GameState, image: TitleImage | null): Result {
  return ok({ titleImage: image });
}

// ── Resets ───────────────────────────────────────────────────────────────────

/** New game: same questions and teams; scores and tiles cleared. */
export function newGame(gs: GameState): Result {
  return ok({
    phase: 'lobby',
    round: null,
    played: {},
    turn: 'A',
    teams: gs.teams.map((t) => ({ ...t, score: 0 })) as [Team, Team],
    toss: null,
  });
}

// ── Coin toss ────────────────────────────────────────────────────────────────

/**
 * Assign the call: `heads` calls heads, the other team has tails. Clears any
 * earlier flip, so changing the call means flipping again.
 */
export function tossCall(gs: GameState, heads: TeamId): Result {
  if (gs.round) return fail('round_in_progress');
  return ok({ toss: { heads, side: null, result: null, at: null }, phase: 'toss' });
}

/**
 * Flip the coin: a fair random flip, or (with `side`) a coin that lands on
 * that side — for when the toss happened on stage. The team that called the
 * side gets the first pick. Needs the call assigned first.
 */
export function tossCoin(gs: GameState, side?: CoinSide, now = Date.now(), random = Math.random): Result {
  if (gs.round) return fail('round_in_progress');
  if (!gs.toss?.heads) return fail('call_first');
  const landed: CoinSide = side ?? (random() < 0.5 ? 'heads' : 'tails');
  const result = landed === 'heads' ? gs.toss.heads : otherTeam(gs.toss.heads);
  return ok({ toss: { heads: gs.toss.heads, side: landed, result, at: now }, turn: result, phase: 'toss' });
}

/** Back to factory state, keeping only the question board. */
export function fullReset(gs: GameState): GameState {
  return {
    ...initialGameState(),
    questions: gs.questions,
    // Title artwork is setup, not show state — keep it.
    titleImage: gs.titleImage,
  };
}

// ── Jumping between steps ────────────────────────────────────────────────────

/**
 * Which step of the tile is next, numbered like the operator's stepper:
 *   0 select a tile · 1 reveal question · 2 show options · 3 lock answer ·
 *   4 right or wrong · 5 correct answer · 6 done.
 */
export function roundStep(gs: GameState): number {
  const r = gs.round;
  const q = liveQuestion(gs);
  if (!r || !q) return 0;
  if (!r.questionShown) return 1;
  if (r.teamAnswer === null && !r.verdictShown && r.revealedOptions.length < q.options.length) return 2;
  if (r.teamAnswer === null && !r.verdictShown) return 3;
  if (!r.verdictShown) return 4;
  if (!r.answerRevealed) return 5;
  return 6;
}

/**
 * Put the tile at `target` — the step that should be next — in one action.
 *
 * Backwards undoes everything from that step on: the verdict (and its points),
 * the lock, the options, the question; step 0 puts the tile back on the board
 * unplayed. Forwards runs the steps in between (reveal the question, show every
 * option, judge, reveal) but never invents the team's answer, so it stops short
 * of a missing lock and changes nothing.
 */
export function goToStep(gs: GameState, target: number, now = Date.now()): Result {
  const q = liveQuestion(gs);
  if (!gs.round || !q) return fail('no_round');
  const current = roundStep(gs);
  if (target === current) return ok({});

  if (target > current) {
    let cur = gs;
    const patch: Patch = {};
    while (roundStep(cur) < target) {
      const s = roundStep(cur);
      const res =
        s === 1 ? showQuestion(cur, now)
        : s === 2 ? revealAllOptions(cur)
        : s === 3 ? fail('no_locked_answer')
        : s === 4 ? showVerdict(cur, now)
        : revealAnswer(cur, now);
      if (!res.ok) return res;
      Object.assign(patch, res.patch);
      cur = { ...cur, ...res.patch };
    }
    return ok(patch);
  }

  // Backwards.
  let r = gs.round;
  const patch: Patch = {};
  const wasRight = r.verdictShown && r.teamAnswer !== null && r.teamAnswer === q.correct;
  // A right answer has no separate "correct answer" step: rewinding to it means
  // rewinding the verdict.
  const to = target === 5 && wasRight ? 4 : target;

  if (r.verdictShown) {
    if (to === 5) {
      r = { ...r, answerRevealed: false };
    } else {
      const played = { ...gs.played };
      delete played[r.questionId];
      patch.played = played;
      if (r.awarded) patch.teams = withScore(gs, r.awarded.teamId, -r.awarded.points);
      r = { ...r, verdictShown: false, answerRevealed: false, awarded: null };
    }
  }
  if (to <= 3) r = { ...r, teamAnswer: null };
  if (to <= 2) {
    r = { ...r, revealedOptions: [] };
  }
  if (to <= 1) r = { ...r, questionShown: false };

  if (to === 0) {
    return ok({ ...patch, round: null, phase: 'board' });
  }
  return ok({ ...patch, round: r, phase: to === 1 ? 'board' : 'question' });
}
