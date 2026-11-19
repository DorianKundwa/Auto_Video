/**
 * Settings routes. Secrets are write-only: GET reports whether one is set and
 * where it came from, never the value itself.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  env,
  getConfig,
  publicConfig,
  readStoredSettings,
  saveStoredSettings,
  type StoredSettings,
} from '../config.js';
import { TTS_PROVIDERS } from '../constants.js';
import type { AppDeps } from './deps.js';

const optionalSecret = z.union([z.string().trim().max(300), z.null()]).optional();

const settingsPatchSchema = z.object({
  model: z.string().trim().min(1).max(80).optional(),
  ttsProvider: z.enum(TTS_PROVIDERS).optional(),
  vision: z.enum(['on', 'off']).optional(),
  defaultStyle: z.string().trim().min(1).max(60).optional(),
  concurrency: z.number().int().min(1).max(8).optional(),
  deepseekApiKey: optionalSecret,
  searchApiKey: optionalSecret,
});
type SettingsPatch = z.infer<typeof settingsPatchSchema>;

function sources() {
  const stored = readStoredSettings();
  return {
    deepseekApiKey: stored.deepseekApiKey ? 'settings' : env.DEEPSEEK_API_KEY ? 'env' : null,
    searchApiKey: stored.searchApiKey ? 'settings' : env.SEARCH_API_KEY ? 'env' : null,
  };
}

function publicSettings() {
  const config = getConfig();
  return {
    settings: {
      model: config.model,
      ttsProvider: config.ttsProvider,
      vision: config.visionSetting,
      defaultStyle: config.defaultStyle,
      concurrency: config.concurrency,
    },
    secrets: {
      deepseekApiKey: Boolean(config.apiKey),
      searchApiKey: Boolean(config.searchApiKey),
    },
    sources: sources(),
    config: publicConfig(config),
  };
}

export const settingsRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.get('/api/settings', async () => publicSettings());

  app.put('/api/settings', async (request, reply) => {
    const patch: SettingsPatch = settingsPatchSchema.parse(request.body ?? {});

    if (patch.defaultStyle && !(await deps.styles.has(patch.defaultStyle))) {
      return reply.code(400).send({
        error: `Unknown default style "${patch.defaultStyle}".`,
        code: 'validation',
      });
    }

    const next: StoredSettings = { ...readStoredSettings() };
    const applySecret = (key: 'deepseekApiKey' | 'searchApiKey') => {
      const value = patch[key];
      if (value === undefined) return;
      if (value === null || value === '') delete next[key];
      else next[key] = value;
    };

    if (patch.model !== undefined) next.model = patch.model;
    if (patch.ttsProvider !== undefined) next.ttsProvider = patch.ttsProvider;
    if (patch.vision !== undefined) next.vision = patch.vision;
    if (patch.defaultStyle !== undefined) next.defaultStyle = patch.defaultStyle;
    if (patch.concurrency !== undefined) next.concurrency = patch.concurrency;
    applySecret('deepseekApiKey');
    applySecret('searchApiKey');

    try {
      saveStoredSettings(next);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Could not save settings',
        code: 'validation',
      });
    }

    deps.bus.publish({ type: 'system', payload: { event: 'settings.updated' } });
    return { ok: true, ...publicSettings() };
  });
};
