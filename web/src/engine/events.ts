/**
 * Wire protocol event names. The frontend mirrors these string constants in
 * web/src/lib/realtime.ts — change both together.
 */

// operator → server (require the operator role)
export const OP = {
  // Setup
  SET_TITLE: 'op:setTitle',
  SET_TITLE_IMAGE: 'op:setTitleImage',
  SET_BIG_X: 'op:setBigX',
  SET_TEAMS: 'op:setTeams',
  SET_SETTINGS: 'op:setSettings',
  REPLACE_QUESTIONS: 'op:replaceQuestions',
  UPSERT_QUESTION: 'op:upsertQuestion',
  DELETE_QUESTION: 'op:deleteQuestion',
  MOVE_QUESTION: 'op:moveQuestion',
  // Show flow
  SET_PHASE: 'op:setPhase',
  SET_TURN: 'op:setTurn',
  TOSS: 'op:toss',
  TOSS_CALL: 'op:tossCall',
  OPEN_TILE: 'op:openTile',
  SHOW_QUESTION: 'op:showQuestion',
  HIDE_QUESTION: 'op:hideQuestion',
  SHOW_VERDICT: 'op:showVerdict',
  SET_ROUND_TEAM: 'op:setRoundTeam',
  REVEAL_OPTION: 'op:revealOption',
  REVEAL_ALL_OPTIONS: 'op:revealAllOptions',
  HIDE_OPTION: 'op:hideOption',
  LOCK_ANSWER: 'op:lockAnswer',
  REVEAL_ANSWER: 'op:revealAnswer',
  UNREVEAL_ANSWER: 'op:unrevealAnswer',
  CLOSE_ROUND: 'op:closeRound',
  GO_TO_STEP: 'op:goToStep',
  RESET_TILE: 'op:resetTile',
  // Scores
  ADJUST_SCORE: 'op:adjustScore',
  SET_SCORE: 'op:setScore',
  // Resets
  NEW_GAME: 'op:newGame',
  FULL_RESET: 'op:fullReset',
  // Show log
  CLEAR_LOG: 'op:clearLog',
  /** The full show log, fetched on demand for export (it is not in the operator's state). */
  GET_LOG: 'op:getLog',
} as const;

// server → client
export const SRV = {
  STATE_FULL: 'state:full',
  STATE_PATCH: 'state:patch',
  ERROR: 'error',
} as const;

export interface Ack {
  ok: boolean;
  error?: string;
}
