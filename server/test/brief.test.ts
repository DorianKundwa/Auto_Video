import { describe, expect, it } from 'vitest';
import {
  briefInputSchema,
  briefSchema,
  deriveBrief,
  durationBudget,
} from '../src/schemas/brief.js';
import { briefWith, validBrief } from './helpers.js';

describe('brief schema (Stage 1)', () => {
  it('accepts a complete brief and defaults reference images to empty', () => {
    const parsed = briefInputSchema.parse(validBrief);
    expect(parsed.topic).toContain('honeybees');
    expect(parsed.referenceImages).toEqual([]);
  });

  it('rejects unknown tone, length, aspect and style', () => {
    expect(briefInputSchema.safeParse(briefWith({ tone: 'sarcastic' as never })).success).toBe(false);
    expect(briefInputSchema.safeParse(briefWith({ lengthSeconds: 45 as never })).success).toBe(false);
    expect(briefInputSchema.safeParse(briefWith({ aspect: '1:1' as never })).success).toBe(false);
    expect(briefInputSchema.safeParse(briefWith({ styleId: 'not-a-style' as never })).success).toBe(false);
  });

  it('rejects empty or too-short topics', () => {
    expect(briefInputSchema.safeParse(briefWith({ topic: '' })).success).toBe(false);
    expect(briefInputSchema.safeParse(briefWith({ topic: 'ab' })).success).toBe(false);
  });

  it('normalizes blank optional narrative to undefined', () => {
    const parsed = briefInputSchema.parse(briefWith({ ownStory: '   ' }));
    expect(parsed.ownStory).toBeUndefined();
  });

  it('derives the narration budget at 2.5 words per second', () => {
    const brief = deriveBrief(briefWith({ lengthSeconds: 90, ownStory: 'my story', referenceImages: [] }), ['1-ref.png']);
    expect(brief.targetWords).toBe(225);
    expect(brief.wordsPerSecond).toBe(2.5);
    expect(brief.referenceImages).toEqual(['1-ref.png']);
    expect(briefSchema.safeParse(brief).success).toBe(true);

    const budget = durationBudget(brief);
    expect(budget.minSeconds).toBe(81);
    expect(budget.maxSeconds).toBe(99);
  });
});
