'use client';

/**
 * The game, run in the browser — no server.
 *
 * The rules are the same pure reducers the server used (state / reducers /
 * redact / log in this folder). The whole game state lives in localStorage, so
 * it survives a refresh or a closed tab; every change is announced on a
 * BroadcastChannel (and the `storage` event as a fallback), so the operator
 * window and the display window stay in step instantly.
 *
 * Both windows must be in the SAME browser on the SAME computer — the operator
 * on the laptop screen, the display full-screen on the second screen / HDMI.
 * There is nothing linking two different computers.
 */

import { OP } from './events';
import * as R from './reducers';
import { describe, MAX_LOG } from './log';
import { displayView, operatorView } from './redact';
import { type GameState, type TitleImage, initialGameState } from './state';

export interface Ack {
  ok: boolean;
  error?: string;
}

const STATE_KEY = 'made-up-or-not:state';
const CHANNEL = 'made-up-or-not';
const IMAGE_DB = 'made-up-or-not';
const MAX_TITLE_IMAGE_BYTES = 5 * 1024 * 1024;

// ── Persistence ──────────────────────────────────────────────────────────────

/** The saved game, with anything missing filled from a fresh one (older saves, new fields). */
export function loadState(): GameState {
  const fresh = initialGameState();
  let saved: Partial<GameState> | null = null;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) saved = JSON.parse(raw) as Partial<GameState>;
  } catch {
    saved = null;
  }
  if (!saved) return fresh;
  const state = { ...fresh } as GameState;
  for (const k of Object.keys(fresh) as (keyof GameState)[]) {
    if (saved[k] !== undefined) (state as unknown as Record<string, unknown>)[k] = saved[k];
  }
  state.settings = { ...fresh.settings, ...state.settings };
  return state;
}

let lastSaveError: string | null = null;
let lastSavedAt: number | null = null;

function saveState(gs: GameState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(gs));
    lastSaveError = null;
    lastSavedAt = Date.now();
  } catch (e) {
    // Full storage: drop the oldest half of the log and try once more.
    try {
      const trimmed = { ...gs, log: gs.log.slice(Math.floor(gs.log.length / 2)) };
      localStorage.setItem(STATE_KEY, JSON.stringify(trimmed));
      lastSaveError = null;
      lastSavedAt = Date.now();
    } catch {
      lastSaveError = e instanceof Error ? e.message : 'storage_full';
    }
  }
}

/** Shown where the server's Redis badge used to be. */
export function saveStatus() {
  return {
    mode: 'redis' as const,
    connected: lastSaveError === null,
    restoredVersion: null,
    lastSavedAt,
    lastError: lastSaveError,
  };
}

// ── Change notification between windows ──────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): void {
  if (channel || typeof window === 'undefined') return;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => listeners.forEach((fn) => fn());
  }
  // Fallback (and belt-and-braces): other tabs of this site see localStorage writes.
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY) listeners.forEach((fn) => fn());
  });
}

export function onChange(fn: Listener): () => void {
  ensureChannel();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(): void {
  ensureChannel();
  channel?.postMessage('changed');
  // This window's own listeners too.
  listeners.forEach((fn) => fn());
}

// ── Views ────────────────────────────────────────────────────────────────────

export function operatorState() {
  return operatorView(loadState(), saveStatus());
}

export function displayState() {
  return displayView(loadState());
}

export function fullLog() {
  return loadState().log;
}

// ── Title image (IndexedDB: too big for localStorage) ────────────────────────

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putImage(id: string, dataUrl: string): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    store.clear();
    store.put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const imageCache = new Map<string, string>();

/** The uploaded title image as a data URL, or null if this browser does not have it. */
export async function getImage(id: string): Promise<string | null> {
  if (imageCache.has(id)) return imageCache.get(id)!;
  try {
    const db = await idb();
    const url = await new Promise<string | null>((resolve, reject) => {
      const req = db.transaction('images').objectStore('images').get(id);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (url) imageCache.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/** Check a `data:image/png;base64,…` upload; returns the metadata for state, or an error code. */
function readPng(dataUrl: string): TitleImage | 'bad_image' | 'image_too_large' {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return 'bad_image';
  if ((m[1].length * 3) / 4 > MAX_TITLE_IMAGE_BYTES) return 'image_too_large';
  const head = atob(m[1].slice(0, 44));
  const bytes = Array.from(head, (c) => c.charCodeAt(0));
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b) || head.slice(12, 16) !== 'IHDR') return 'bad_image';
  const u32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  // FNV-1a over the data: the id changes with the content.
  let h = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i += 7) h = Math.imul(h ^ dataUrl.charCodeAt(i), 0x01000193) >>> 0;
  return { id: `${h.toString(16)}${dataUrl.length.toString(16)}`, width: u32(16), height: u32(20) };
}

// ── Operator actions ─────────────────────────────────────────────────────────

type P = Record<string, unknown>;
type Run = (gs: GameState, p: P) => R.Result | GameState;

const HANDLERS: Record<string, Run> = {
  [OP.SET_TITLE]: (gs, p) => R.setTitle(gs, String(p.title)),
  [OP.SET_BIG_X]: (gs, p) => R.setBigX(gs, !!p.value),
  [OP.SET_TEAMS]: (gs, p) => R.setTeams(gs, p.teams as never),
  [OP.SET_SETTINGS]: (gs, p) => R.setSettings(gs, p.settings as never),
  [OP.REPLACE_QUESTIONS]: (gs, p) => R.replaceQuestions(gs, p.questions as never),
  [OP.UPSERT_QUESTION]: (gs, p) => R.upsertQuestion(gs, p.question as never),
  [OP.DELETE_QUESTION]: (gs, p) => R.deleteQuestion(gs, String(p.questionId)),
  [OP.MOVE_QUESTION]: (gs, p) => R.moveQuestion(gs, String(p.questionId), Number(p.toIndex)),
  [OP.SET_PHASE]: (gs, p) => R.setPhase(gs, p.phase as never),
  [OP.TOSS_CALL]: (gs, p) => R.tossCall(gs, p.heads as never),
  [OP.TOSS]: (gs, p) => R.tossCoin(gs, p.side as never),
  [OP.SET_TURN]: (gs, p) => R.setTurn(gs, p.teamId as never),
  [OP.OPEN_TILE]: (gs, p) => R.openTile(gs, String(p.questionId), p.teamId as never),
  [OP.SHOW_QUESTION]: (gs) => R.showQuestion(gs),
  [OP.HIDE_QUESTION]: (gs) => R.hideQuestion(gs),
  [OP.SHOW_VERDICT]: (gs) => R.showVerdict(gs),
  [OP.SET_ROUND_TEAM]: (gs, p) => R.setRoundTeam(gs, p.teamId as never),
  [OP.REVEAL_OPTION]: (gs, p) => R.revealOption(gs, p.index as number | undefined),
  [OP.REVEAL_ALL_OPTIONS]: (gs) => R.revealAllOptions(gs),
  [OP.HIDE_OPTION]: (gs, p) => R.hideOption(gs, Number(p.index)),
  [OP.LOCK_ANSWER]: (gs, p) => R.lockTeamAnswer(gs, p.choice as number | null),
  [OP.REVEAL_ANSWER]: (gs) => R.revealAnswer(gs),
  [OP.UNREVEAL_ANSWER]: (gs) => R.unrevealAnswer(gs),
  [OP.CLOSE_ROUND]: (gs) => R.closeRound(gs),
  [OP.GO_TO_STEP]: (gs, p) => R.goToStep(gs, Number(p.step)),
  [OP.RESET_TILE]: (gs, p) => R.resetTile(gs, String(p.questionId)),
  [OP.ADJUST_SCORE]: (gs, p) => R.adjustScore(gs, p.teamId as never, Number(p.delta)),
  [OP.SET_SCORE]: (gs, p) => R.setScore(gs, p.teamId as never, Number(p.score)),
  [OP.NEW_GAME]: (gs) => R.newGame(gs),
  [OP.FULL_RESET]: (gs) => R.fullReset(gs),
  [OP.CLEAR_LOG]: () => ({ ok: true, patch: { log: [] } }),
};

/** Apply one operator action: same funnel as the server's (reducer, log line, save, announce). */
function apply(event: string, payload: P, run: Run): Ack {
  try {
    const before = loadState();
    const out = run(before, payload);
    if ('ok' in out && !out.ok) return { ok: false, error: out.error };
    const after = 'ok' in out ? { ...before, ...out.patch } : out;
    const entry = describe(event, payload, before, after);
    // A full reset starts from fresh state but keeps the log.
    const base = 'ok' in out ? after.log : before.log;
    const log = entry ? [...base, entry].slice(-MAX_LOG) : base;
    saveState({ ...after, log });
    announce();
    return { ok: true };
  } catch (e) {
    console.error('action failed', event, e);
    return { ok: false, error: 'server_error' };
  }
}

export async function dispatch(event: string, payload: P = {}): Promise<Ack> {
  if (event === OP.SET_TITLE_IMAGE) {
    const dataUrl = payload.dataUrl as string | null;
    if (dataUrl === null) return apply(event, payload, (gs) => R.setTitleImage(gs, null));
    const image = readPng(dataUrl);
    if (typeof image === 'string') return { ok: false, error: image };
    try {
      await putImage(image.id, dataUrl);
      imageCache.set(image.id, dataUrl);
    } catch {
      return { ok: false, error: 'server_error' };
    }
    return apply(event, payload, (gs) => R.setTitleImage(gs, image));
  }
  const run = HANDLERS[event];
  if (!run) return { ok: false, error: 'bad_payload' };
  return apply(event, payload, run);
}
