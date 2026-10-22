// src/lib/realtime.ts
//
// Thin Socket.IO client wrapper for talking to made-up-or-not-server. Mirrors the
// server's wire protocol (server/src/protocol/events.ts). The server is the
// authority for game state; clients emit intent and receive redacted state.

import { io, type Socket } from 'socket.io-client';

export type Role = 'operator' | 'display';

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080';
export const DISPLAY_KEY = process.env.NEXT_PUBLIC_DISPLAY_KEY || '';

// ── Event names (must match the server) ──────────────────────────────────────
export const OP = {
  SET_TITLE: 'op:setTitle',
  SET_TITLE_IMAGE: 'op:setTitleImage',
  SET_BIG_X: 'op:setBigX',
  SET_TEAMS: 'op:setTeams',
  SET_SETTINGS: 'op:setSettings',
  REPLACE_QUESTIONS: 'op:replaceQuestions',
  UPSERT_QUESTION: 'op:upsertQuestion',
  DELETE_QUESTION: 'op:deleteQuestion',
  MOVE_QUESTION: 'op:moveQuestion',
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
  ADJUST_SCORE: 'op:adjustScore',
  SET_SCORE: 'op:setScore',
  NEW_GAME: 'op:newGame',
  FULL_RESET: 'op:fullReset',
  CLEAR_LOG: 'op:clearLog',
  GET_LOG: 'op:getLog',
} as const;

export const SRV = {
  STATE_FULL: 'state:full',
  STATE_PATCH: 'state:patch',
  ERROR: 'error',
} as const;

export interface Ack {
  ok: boolean;
  error?: string;
}

/** Server error codes turned into something the operator can read. */
export const ERROR_TEXT: Record<string, string> = {
  forbidden: 'Not allowed.',
  bad_payload: 'That input was not accepted.',
  rate_limited: 'Slow down a moment.',
  bad_choice: 'That option is not available.',
  no_round: 'Open a tile first.',
  round_in_progress: 'The question is already on screen — finish this tile first (Back to board).',
  already_played: 'That tile has already been played.',
  no_such_board: 'There is no such board.',
  win_announced: 'The win is already announced — take it back first.',
  question_already_shown: 'The question is already on screen.',
  already_revealed: 'The answer is already revealed — undo the reveal first.',
  already_judged: 'The answer has already been judged — undo first.',
  question_not_shown: 'Reveal the question on the display first.',
  question_in_play: 'Options are already up — the question can no longer be hidden.',
  option_not_shown: 'Show that option on the display before locking it.',
  option_is_locked: 'That option is the locked answer — unlock it first.',
  no_locked_answer: 'Lock the team’s answer first.',
  verdict_first: 'Show whether the locked answer is right first.',
  unknown_question: 'That question no longer exists.',
  question_is_live: 'That question is on screen right now.',
  nothing_to_reveal: 'Every option is already showing.',
  bad_options: 'A question needs 2 to 4 options, none of them blank.',
  bad_image: 'The title image must be a PNG file.',
  image_too_large: 'The title image must be under 5 MB.',
  bad_correct_answer: 'Pick which option is correct.',
  too_many_questions: 'That is more than 60 questions.',
  duplicate_question_id: 'Two questions share the same id.',
  not_connected: 'Not connected to the server.',
  timeout: 'The server did not respond.',
  server_error: 'Something went wrong on the server.',
};

export function errorText(code?: string): string {
  if (!code) return 'Something went wrong.';
  return ERROR_TEXT[code] ?? code;
}

export type TokenProvider = () => Promise<string | null> | string | null;

/**
 * Create a configured socket for a role. `getToken` is re-run on every
 * (re)connect, so a Firebase ID token never goes stale mid-show.
 */
export function createGameSocket(role: Role, getToken?: TokenProvider): Socket {
  return io(WS_URL, {
    // Polling first, then upgrade: venue Wi-Fi that blocks WebSocket degrades
    // to "slightly slower" instead of "dead".
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    auth: (cb) => {
      Promise.resolve(getToken ? getToken() : null)
        .then((token) => cb({ role, token: token ?? undefined }))
        .catch(() => cb({ role }));
    },
  });
}

/** Promise-based emit that resolves the server ack. */
export function emitAck(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload ?? {}, (err: unknown, ack: Ack) => {
      if (err) resolve({ ok: false, error: 'timeout' });
      else resolve(ack ?? { ok: false, error: 'no_ack' });
    });
  });
}

/** POST the operator password to the server and return a JWT (or null). */
export async function operatorLogin(password: string): Promise<string | null> {
  try {
    const res = await fetch(`${WS_URL}/auth/operator/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}
