import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RuntimeConfig } from '../src/config.js';
import { repoRoot } from '../src/config.js';
import type { BriefInput } from '../src/schemas/brief.js';

export async function makeTempDir(prefix = 'shortforge-test-'): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export function testRuntimeConfig(jobsDir: string): RuntimeConfig {
  return {
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test-abcd1234efgh',
    searchApiKey: undefined,
    visionSetting: 'off',
    visionEnabled: false,
    ttsProvider: 'kokoro',
    defaultVoice: 'af_heart',
    defaultStyle: 'soft-3d',
    concurrency: 2,
    mockModeSetting: 'off',
    mockMode: false,
    port: 8787,
    host: '127.0.0.1',
    jobsDir,
    stylesDir: path.join(repoRoot, 'styles'),
    assetsAudioDir: path.join(repoRoot, 'assets', 'audio'),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
  };
}

export const validBrief: BriefInput = {
  topic: 'Why honeybees dance to give directions',
  audience: 'curious adults, no science background',
  tone: 'educational',
  lengthSeconds: 60,
  language: 'English',
  styleId: 'soft-3d',
  voice: 'af_heart',
  aspect: '9:16',
  referenceImages: [],
};

export function briefWith(overrides: Partial<BriefInput>): BriefInput {
  return { ...validBrief, ...overrides };
}
