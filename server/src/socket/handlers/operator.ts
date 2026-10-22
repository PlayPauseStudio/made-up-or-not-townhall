import type { ZodTypeAny, z } from 'zod';
import type { AppSocket } from '../types';
import type { RoomStore } from '../../game/store';
import type { Broadcaster } from '../broadcast';
import type { TitleImageStore } from '../../media/titleImage';
import type { GameState } from '../../game/state';
import * as R from '../../game/reducers';
import * as S from '../../validation/schemas';
import { OP, type Ack } from '../../protocol/events';
import { logger } from '../../util/logger';
import { describe, MAX_LOG } from '../../game/log';

export interface HandlerCtx {
  store: RoomStore;
  broadcaster: Broadcaster;
  titleImages: TitleImageStore;
}

type AckFn = (ack: Ack) => void;

/**
 * Every operator event goes through one funnel: role guard, zod, pure reducer,
 * apply (with a log line), broadcast. A wrong-role or malformed emit
 * always gets an ack (never a silent hang) and never mutates state.
 */
export function registerOperatorHandlers(socket: AppSocket, ctx: HandlerCtx): void {
  const { store, broadcaster, titleImages } = ctx;

  function on<T extends ZodTypeAny>(
    event: string,
    schema: T,
    run: (gs: GameState, payload: z.infer<T>) => R.Result | GameState,
  ): void {
    socket.on(event, (payload: unknown, ack?: AckFn) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (socket.data.role !== 'operator') return reply({ ok: false, error: 'forbidden' });
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) return reply({ ok: false, error: 'bad_payload' });
      try {
        const before = store.getState();
        const out = run(before, parsed.data);
        if ('ok' in out && !out.ok) return reply({ ok: false, error: out.error });
        const after = 'ok' in out ? { ...before, ...out.patch } : out;
        // Show-log lines; the log itself survives every reset.
        const entries = [describe(event, parsed.data as Record<string, unknown>, before, after)].filter(
          (e): e is NonNullable<typeof e> => e !== null,
        );
        // A full reset starts from fresh state but keeps the log; anything else keeps
        // whatever the action did to it (Clear log empties it).
        const base = 'ok' in out ? after.log : before.log;
        const log = entries.length ? [...base, ...entries].slice(-MAX_LOG) : base;
        store.replace({ ...after, log });
        broadcaster.broadcastAll();
        reply({ ok: true });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e.stack : e, event }, 'operator handler failed');
        reply({ ok: false, error: 'server_error' });
      }
    });
  }

  on(OP.SET_TITLE, S.titleSchema, (gs, p) => R.setTitle(gs, p.title));
  on(OP.SET_TITLE_IMAGE, S.titleImageSchema, (gs, p) => {
    if (p.dataUrl === null) {
      titleImages.clear();
      return R.setTitleImage(gs, null);
    }
    const image = titleImages.put(p.dataUrl);
    return typeof image === 'string' ? { ok: false, error: image } : R.setTitleImage(gs, image);
  });
  on(OP.SET_BIG_X, S.boolSchema, (gs, p) => R.setBigX(gs, p.value));
  on(OP.SET_TEAMS, S.teamsSchema, (gs, p) => R.setTeams(gs, p.teams));
  on(OP.SET_SETTINGS, S.settingsSchema, (gs, p) => R.setSettings(gs, p.settings));
  on(OP.REPLACE_QUESTIONS, S.replaceQuestionsSchema, (gs, p) => R.replaceQuestions(gs, p.questions));
  on(OP.UPSERT_QUESTION, S.upsertQuestionSchema, (gs, p) => R.upsertQuestion(gs, p.question));
  on(OP.DELETE_QUESTION, S.questionIdSchema, (gs, p) => R.deleteQuestion(gs, p.questionId));
  on(OP.MOVE_QUESTION, S.moveQuestionSchema, (gs, p) => R.moveQuestion(gs, p.questionId, p.toIndex));

  on(OP.SET_PHASE, S.phaseSchema, (gs, p) => R.setPhase(gs, p.phase));
  on(OP.TOSS_CALL, S.tossCallSchema, (gs, p) => R.tossCall(gs, p.heads));
  on(OP.TOSS, S.tossSchema, (gs, p) => R.tossCoin(gs, p.side));
  on(OP.SET_TURN, S.turnSchema, (gs, p) => R.setTurn(gs, p.teamId));
  on(OP.OPEN_TILE, S.openTileSchema, (gs, p) => R.openTile(gs, p.questionId, p.teamId));
  on(OP.SHOW_QUESTION, S.emptySchema, (gs) => R.showQuestion(gs));
  on(OP.HIDE_QUESTION, S.emptySchema, (gs) => R.hideQuestion(gs));
  on(OP.SHOW_VERDICT, S.emptySchema, (gs) => R.showVerdict(gs));
  on(OP.SET_ROUND_TEAM, S.turnSchema, (gs, p) => R.setRoundTeam(gs, p.teamId));
  on(OP.REVEAL_OPTION, S.optionSchema, (gs, p) => R.revealOption(gs, p.index));
  on(OP.REVEAL_ALL_OPTIONS, S.emptySchema, (gs) => R.revealAllOptions(gs));
  on(OP.HIDE_OPTION, S.optionRequiredSchema, (gs, p) => R.hideOption(gs, p.index));
  on(OP.LOCK_ANSWER, S.lockAnswerSchema, (gs, p) => R.lockTeamAnswer(gs, p.choice));
  on(OP.REVEAL_ANSWER, S.emptySchema, (gs) => R.revealAnswer(gs));
  on(OP.UNREVEAL_ANSWER, S.emptySchema, (gs) => R.unrevealAnswer(gs));
  on(OP.CLOSE_ROUND, S.emptySchema, (gs) => R.closeRound(gs));
  on(OP.GO_TO_STEP, S.stepSchema, (gs, p) => R.goToStep(gs, p.step));
  on(OP.RESET_TILE, S.questionIdSchema, (gs, p) => R.resetTile(gs, p.questionId));

  on(OP.ADJUST_SCORE, S.adjustScoreSchema, (gs, p) => R.adjustScore(gs, p.teamId, p.delta));
  on(OP.SET_SCORE, S.setScoreSchema, (gs, p) => R.setScore(gs, p.teamId, p.score));


  on(OP.NEW_GAME, S.emptySchema, (gs) => R.newGame(gs));
  on(OP.FULL_RESET, S.emptySchema, (gs) => R.fullReset(gs));
  on(OP.CLEAR_LOG, S.emptySchema, () => ({ ok: true, patch: { log: [] } }));

  // The show log is not part of the operator's state (it would be re-sent on
  // every click); the export asks for it here.
  socket.on(OP.GET_LOG, (_payload: unknown, ack?: (res: { ok: boolean; log?: unknown; error?: string }) => void) => {
    if (typeof ack !== 'function') return;
    if (socket.data.role !== 'operator') return ack({ ok: false, error: 'forbidden' });
    ack({ ok: true, log: store.getState().log });
  });
}
