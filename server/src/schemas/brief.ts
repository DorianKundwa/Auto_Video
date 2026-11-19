/**
 * Brief schema (Stage 1). `BriefInput` is what the GUI posts; `Brief` is what
 * is persisted as jobs/<id>/brief.json, including derived narration budget.
 */
import { z } from 'zod';
import { ASPECTS, STYLE_ORDER, TONES, WORDS_PER_SECOND } from '../constants.js';

export const referenceImageInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /** Raw base64 (no data: prefix). Capped so a brief stays a few MB. */
  dataBase64: z.string().min(16).max(8_000_000),
});
export type ReferenceImageInput = z.infer<typeof referenceImageInputSchema>;

const ownStorySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(8000).optional(),
);

export const briefInputSchema = z.object({
  topic: z.string().trim().min(3, 'topic needs at least 3 characters').max(200),
  audience: z.string().trim().min(2, 'describe who this is for').max(120),
  tone: z.enum(TONES),
  lengthSeconds: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  language: z.string().trim().min(2).max(40),
  styleId: z.enum(STYLE_ORDER),
  voice: z.string().trim().min(1).max(60),
  aspect: z.enum(ASPECTS),
  ownStory: ownStorySchema,
  referenceImages: z.array(referenceImageInputSchema).max(6).optional().default([]),
});
export type BriefInput = z.infer<typeof briefInputSchema>;

export const briefSchema = briefInputSchema
  .omit({ referenceImages: true })
  .extend({
    /** Saved file names under jobs/<id>/refs/. */
    referenceImages: z.array(z.string().regex(/^[A-Za-z0-9._-]+$/)).default([]),
    targetWords: z.number().int().positive(),
    wordsPerSecond: z.number().positive(),
    createdAt: z.string(),
  });
export type Brief = z.infer<typeof briefSchema>;

export function deriveBrief(
  input: BriefInput,
  referenceImages: string[],
  now: Date = new Date(),
): Brief {
  const { referenceImages: _ignored, ...rest } = input;
  return {
    ...rest,
    ownStory: rest.ownStory,
    referenceImages,
    targetWords: Math.round(input.lengthSeconds * WORDS_PER_SECOND),
    wordsPerSecond: WORDS_PER_SECOND,
    createdAt: now.toISOString(),
  };
}

/** Duration budget the script stage must hit (±10%). */
export function durationBudget(brief: Brief) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    targetSeconds: brief.lengthSeconds,
    tolerancePct: 10,
    minSeconds: round(brief.lengthSeconds * 0.9),
    maxSeconds: round(brief.lengthSeconds * 1.1),
    targetWords: brief.targetWords,
  };
}
