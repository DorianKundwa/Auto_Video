/**
 * Style pack contracts. Every style under /styles/<name>/ must validate against
 * these so Stages 4-9 can rely on palette, fonts, outline and vocabularies
 * being machine-usable rather than prose.
 */
import { z } from 'zod';

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');

export const themeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  palette: z.object({
    background: hexColor,
    surface: hexColor,
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
    text: hexColor,
    outline: hexColor,
  }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    subtitle: z.string().min(1),
  }),
  outline: z.object({
    color: hexColor,
    widthPx: z.number().min(0).max(40),
    style: z.enum(['ink', 'chalk', 'neon', 'none']),
  }),
  grain: z.object({
    enabled: z.boolean(),
    intensity: z.number().min(0).max(1),
  }),
  /** Post-processing switches consumed by Stage 8; values are style-specific. */
  post: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  subtitle: z.object({
    style: z.enum([
      'clean',
      'karaoke',
      'hand',
      'pixel',
      'terminal',
      'comic',
      'poster',
      'blueprint',
      'blocky',
      'cinematic',
    ]),
    safeAreaPct: z.number().min(0).max(0.3),
    karaokeHighlight: z.boolean(),
  }),
  render: z.object({
    fps: z.number().int().min(12).max(60),
    letterbox: z.boolean(),
    dof: z.boolean(),
    /** Internal render scale (8-bit uses a small buffer, upscaled). */
    internalScale: z.number().min(0.05).max(1).optional(),
  }),
});
export type StyleTheme = z.infer<typeof themeSchema>;

const slugList = (min: number) =>
  z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)).min(min);

/**
 * Allowed values for the shot plan (Stage 5). Keeping this closed is what makes
 * generated plans renderable: the renderer maps each enum to a real behaviour.
 */
export const vocabSchema = z.object({
  cameraTypes: slugList(2),
  cameraMoves: slugList(2),
  easings: slugList(2),
  poses: slugList(4),
  expressions: slugList(4),
  transitions: slugList(2),
  lightingPresets: slugList(2),
  actions: slugList(3),
  sfxCues: slugList(1),
  /** Optional per-pack notes surfaced in the GUI. */
  notes: z.array(z.string()).optional(),
});
export type StyleVocab = z.infer<typeof vocabSchema>;

export const REQUIRED_POSES = ['idle', 'walk', 'talk', 'react'] as const;
export const REQUIRED_EXPRESSIONS = ['neutral', 'happy', 'concerned', 'surprised'] as const;
export const REQUIRED_TRANSITIONS = ['cut'] as const;
