/**
 * Environment + settings resolution.
 *
 * Sources, lowest precedence first:
 *   1. `.env` in the repo root (never shipped to the browser)
 *   2. `settings.json` in the repo root (written by the Settings page, gitignored)
 *
 * Secrets live only here and in settings.json. Anything returned to the client
 * goes through `publicConfig()` which reports presence, never values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_VOICE, TTS_PROVIDERS, type TtsProvider } from './constants.js';
import { registerSecrets } from './logger.js';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalNonEmpty = (max = 500) =>
  z.preprocess(emptyToUndefined, z.string().trim().min(1).max(max).optional());

const envSchema = z.object({
  DEEPSEEK_API_KEY: optionalNonEmpty(),
  DEEPSEEK_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().trim().url().default('https://api.deepseek.com'),
  ),
  DEEPSEEK_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(80).default('deepseek-chat'),
  ),
  DEEPSEEK_VISION: z.preprocess(emptyToUndefined, z.enum(['on', 'off']).default('off')),
  SEARCH_API_KEY: optionalNonEmpty(),
  TTS_PROVIDER: z.preprocess(emptyToUndefined, z.enum(TTS_PROVIDERS).default('kokoro')),
  // 0 means "unset" in some host environments; ShortForge always binds a known port.
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(65535).default(8787)),
  HOST: z.preprocess(emptyToUndefined, z.string().trim().min(1).default('127.0.0.1')),
  MOCK_MODE: z.preprocess(emptyToUndefined, z.enum(['on', 'off', 'auto']).default('auto')),
  JOBS_DIR: optionalNonEmpty(2048),
});

export type RawEnv = z.infer<typeof envSchema>;

function parseEnv(): RawEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration in .env:\n${details}`);
  }
  return parsed.data;
}

export const env: RawEnv = parseEnv();

export const settingsFile = path.join(repoRoot, 'settings.json');

const storedSettingsSchema = z.object({
  model: z.string().trim().min(1).max(80).optional(),
  ttsProvider: z.enum(TTS_PROVIDERS).optional(),
  vision: z.enum(['on', 'off']).optional(),
  defaultStyle: z.string().trim().min(1).max(60).optional(),
  concurrency: z.number().int().min(1).max(8).optional(),
  deepseekApiKey: z.string().trim().min(1).optional(),
  searchApiKey: z.string().trim().min(1).optional(),
});

export type StoredSettings = z.infer<typeof storedSettingsSchema>;

export function readStoredSettings(): StoredSettings {
  try {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const parsed = storedSettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`settings.json is invalid, ignoring it: ${parsed.error.message}`);
      return {};
    }
    return parsed.data;
  } catch {
    return {};
  }
}

/** Write exactly the settings given (used when a secret is cleared). */
export function saveStoredSettings(next: StoredSettings): StoredSettings {
  const parsed = storedSettingsSchema.parse(next);
  const cleaned = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined && value !== ''),
  );
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, `${JSON.stringify(cleaned, null, 2)}\n`, { mode: 0o600 });
  return cleaned;
}


export interface RuntimeConfig {
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
  searchApiKey: string | undefined;
  visionSetting: 'on' | 'off';
  visionEnabled: boolean;
  ttsProvider: TtsProvider;
  defaultVoice: string;
  defaultStyle: string;
  concurrency: number;
  mockModeSetting: 'on' | 'off' | 'auto';
  mockMode: boolean;
  port: number;
  host: string;
  jobsDir: string;
  stylesDir: string;
  assetsAudioDir: string;
  webDistDir: string;
}

export function jobsRootDir(override?: string): string {
  if (override) return path.resolve(override);
  return env.JOBS_DIR ? path.resolve(repoRoot, env.JOBS_DIR) : path.join(repoRoot, 'jobs');
}

export function getConfig(): RuntimeConfig {
  const stored = readStoredSettings();
  const apiKey = stored.deepseekApiKey ?? env.DEEPSEEK_API_KEY;
  const searchApiKey = stored.searchApiKey ?? env.SEARCH_API_KEY;
  const ttsProvider = stored.ttsProvider ?? env.TTS_PROVIDER;
  const visionSetting = stored.vision ?? env.DEEPSEEK_VISION;
  const mockModeSetting = env.MOCK_MODE;
  const mockMode = mockModeSetting === 'on' || (mockModeSetting === 'auto' && !apiKey);

  registerSecrets([apiKey, searchApiKey]);

  return {
    model: stored.model ?? env.DEEPSEEK_MODEL,
    baseUrl: env.DEEPSEEK_BASE_URL.replace(/\/+$/, ''),
    apiKey,
    searchApiKey,
    visionSetting,
    visionEnabled: visionSetting === 'on',
    ttsProvider,
    defaultVoice: DEFAULT_VOICE[ttsProvider],
    defaultStyle: stored.defaultStyle ?? 'soft-3d',
    concurrency: stored.concurrency ?? 2,
    mockModeSetting,
    mockMode,
    port: env.PORT === 0 ? 8787 : env.PORT,
    host: env.HOST,
    jobsDir: jobsRootDir(),
    stylesDir: path.join(repoRoot, 'styles'),
    assetsAudioDir: path.join(repoRoot, 'assets', 'audio'),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
  };
}

/** Safe-to-send view of the config. Never includes key material. */
export function publicConfig(config: RuntimeConfig) {
  return {
    model: config.model,
    baseUrl: config.baseUrl,
    visionEnabled: config.visionEnabled,
    visionSetting: config.visionSetting,
    ttsProvider: config.ttsProvider,
    defaultVoice: config.defaultVoice,
    defaultStyle: config.defaultStyle,
    concurrency: config.concurrency,
    mockMode: config.mockMode,
    mockModeSetting: config.mockModeSetting,
    deepseekKeyConfigured: Boolean(config.apiKey),
    searchKeyConfigured: Boolean(config.searchApiKey),
    envFilePresent: fs.existsSync(path.join(repoRoot, '.env')),
    settingsFilePresent: fs.existsSync(settingsFile),
    repoRoot,
  };
}
