/**
 * Stage metadata surfaced to the GUI stepper, plus the artifact filename each
 * stage owns. Single source of truth for stage order and outputs.
 */
import type { StageNumber } from '../schemas/job.js';

export interface StageMeta {
  n: StageNumber;
  key: 'input' | 'research' | 'script' | 'bible' | 'shots' | 'voice' | 'audio' | 'render' | 'qa' | 'export';
  name: string;
  short: string;
  output: string;
  description: string;
}

export const STAGE_META: readonly StageMeta[] = [
  {
    n: 1,
    key: 'input',
    name: 'Project input',
    short: 'Input',
    output: 'brief.json',
    description: 'Topic, audience, tone, length, language, style, voice and aspect. Validated into brief.json.',
  },
  {
    n: 2,
    key: 'research',
    name: 'Research + fact check',
    short: 'Facts',
    output: 'facts.json',
    description: 'Search-grounded claims with sources. Only verified claims reach the script.',
  },
  {
    n: 3,
    key: 'script',
    name: 'Script',
    short: 'Script',
    output: 'script.json',
    description: 'Narration beats with purpose, fact links and target seconds, within 10% of the length budget.',
  },
  {
    n: 4,
    key: 'bible',
    name: 'Characters + world bible',
    short: 'Bible',
    output: 'bible.json',
    description: 'Characters, locations and motifs as renderable parameters: shapes, hex palettes, props.',
  },
  {
    n: 5,
    key: 'shots',
    name: 'Shot plan',
    short: 'Shots',
    output: 'shots.json',
    description: 'Per-beat shots constrained to the style pack vocabulary, with camera, lighting and SFX cues.',
  },
  {
    n: 6,
    key: 'voice',
    name: 'Voice + timing',
    short: 'Voice',
    output: 'timing.json',
    description: 'Per-beat TTS, word timings, shot reconciliation and subtitle chunks.',
  },
  {
    n: 7,
    key: 'audio',
    name: 'Music + SFX mix',
    short: 'Mix',
    output: 'mix.json',
    description: 'Music selection, ducking under speech and a -14 LUFS master.',
  },
  {
    n: 8,
    key: 'render',
    name: 'Render',
    short: 'Render',
    output: 'final.mp4',
    description: 'Remotion + three.js chunks, concatenated and muxed with audio, plus a 540p proxy.',
  },
  {
    n: 9,
    key: 'qa',
    name: 'Automated QA',
    short: 'QA',
    output: 'qa.json',
    description: 'Programmatic frame checks, optional vision review, and revision loops back into Stage 5.',
  },
  {
    n: 10,
    key: 'export',
    name: 'Export',
    short: 'Export',
    output: 'export.json',
    description: 'Titles, description, hashtags, thumbnail copy and a reopenable project zip.',
  },
];

export function stageMeta(n: number): StageMeta | undefined {
  return STAGE_META.find((stage) => stage.n === n);
}

export function stageArtifact(n: number): string | undefined {
  return stageMeta(n)?.output;
}
