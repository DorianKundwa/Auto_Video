/**
 * Canned model responses for mock mode.
 *
 * Keyed by the `task` tag passed to `callLlm()`. Mock mode is what makes the
 * sample job runnable without a DeepSeek key: each stage resolves its own task
 * key here, and the same zod schema validates the fixture, so the pipeline is
 * exercised end to end. Fixtures are added per stage as stages are built;
 * stages 2 and 3 already have a shape example below.
 */

export const MOCK_FIXTURES: Record<string, unknown> = {
  'demo.ping': {
    message: 'pong',
    mode: 'mock',
  },

  // Stage 2 — research (consumed by the research stage when it lands)
  'research.queries': {
    queries: [
      'honeybee communication dance explained',
      'how bees use the waggle dance to share directions',
      'honeybee colony decision making research',
    ],
  },
  'research.claims': {
    claims: [
      {
        claim: 'Honeybees communicate the direction of food with a figure-eight waggle dance.',
        status: 'verified',
        source_url: 'https://example.org/bee-waggle-dance',
        confidence: 0.95,
      },
      {
        claim: 'The angle of the waggle run maps to the angle of the sun.',
        status: 'verified',
        source_url: 'https://example.org/bee-sun-angle',
        confidence: 0.9,
      },
    ],
  },

  // Stage 3 — script (consumed by the script stage when it lands)
  'script.beats': {
    beats: [
      {
        beat_id: 'b1',
        narration: 'A honeybee can point at a flower two kilometres away. Without a map.',
        purpose: 'hook',
        fact_ids: ['f1'],
        target_seconds: 5,
      },
      {
        beat_id: 'b2',
        narration: 'She dances. The wiggle tells the direction, the wobble tells the distance.',
        purpose: 'setup',
        fact_ids: ['f1', 'f2'],
        target_seconds: 6,
      },
    ],
  },
};

export class MissingMockFixtureError extends Error {
  constructor(task: string) {
    super(
      `Mock mode: no canned response for task "${task}". ` +
        'Add one to server/src/mock/fixtures.ts, or set DEEPSEEK_API_KEY in .env to call the real model.',
    );
    this.name = 'MissingMockFixtureError';
  }
}

export function resolveMockResponse(task: string): unknown {
  const fixture = MOCK_FIXTURES[task];
  if (fixture === undefined) throw new MissingMockFixtureError(task);
  return structuredClone(fixture);
}
