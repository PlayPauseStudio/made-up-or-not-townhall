import { z } from 'zod';

/** Runtime validation for every inbound payload. Never trust the client shape. */

export const operatorLoginSchema = z.object({ password: z.string().min(1).max(200) });

const teamId = z.enum(['A', 'B']);
const text = (max: number) => z.string().trim().min(1).max(max);

export const titleSchema = z.object({ title: text(80) });
/** A PNG as a data URL, or null to remove it. Sized a little above 5 MB so a slightly-too-big file gets "too large" from the image store, not a generic refusal. */
export const titleImageSchema = z.object({ dataUrl: z.string().max(8_400_000).nullable() });

export const teamsSchema = z.object({
  teams: z
    .array(
      z.object({
        id: teamId,
        name: text(40),
        players: z.tuple([text(40), text(40)]),
      }),
    )
    .min(1)
    .max(2),
});

export const settingsSchema = z.object({
  settings: z
    .object({
      alternateTurns: z.boolean(),
      wrongPenalty: z.number().int().min(0).max(1000),
      sounds: z.boolean(),
      questionPoints: z.number().int().min(0).max(10_000),
    })
    .partial(),
});

export const questionInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  category: text(40),
  // Older clients still send a kind; it no longer means anything.
  kind: z.string().optional(),
  prompt: text(400),
  options: z.array(z.string().max(120)).min(2).max(4),
  correct: z.number().int().min(0).max(3),
  points: z.number().int().min(0).max(10_000).optional(),
  note: z.string().max(300).optional(),
});

export const replaceQuestionsSchema = z.object({ questions: z.array(questionInputSchema).max(60) });
export const upsertQuestionSchema = z.object({ question: questionInputSchema });
export const questionIdSchema = z.object({ questionId: z.string().min(1).max(64) });
export const moveQuestionSchema = questionIdSchema.extend({ toIndex: z.number().int().min(0).max(100) });

export const phaseSchema = z.object({ phase: z.enum(['lobby', 'toss', 'board', 'question', 'scores', 'final']) });
/** Which team calls heads (the other has tails). */
export const tossCallSchema = z.object({ heads: teamId });
/** No side = a fair random flip; a side = the coin lands on it (e.g. after a physical toss). */
export const tossSchema = z.object({ side: z.enum(['heads', 'tails']).optional() });
export const turnSchema = z.object({ teamId });
export const openTileSchema = questionIdSchema.extend({ teamId: teamId.optional() });
export const optionSchema = z.object({ index: z.number().int().min(0).max(3).optional() });
export const optionRequiredSchema = z.object({ index: z.number().int().min(0).max(3) });
export const lockAnswerSchema = z.object({ choice: z.number().int().min(0).max(3).nullable() });
export const adjustScoreSchema = z.object({ teamId, delta: z.number().int().min(-10_000).max(10_000) });
export const setScoreSchema = z.object({ teamId, score: z.number().int().min(-100_000).max(100_000) });
export const boolSchema = z.object({ value: z.boolean() });
export const stepSchema = z.object({ step: z.number().int().min(0).max(6) });
export const emptySchema = z.object({}).passthrough();
