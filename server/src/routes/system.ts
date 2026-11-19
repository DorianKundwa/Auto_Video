/**
 * System + metadata routes: stage list, readiness checks, disk cleanup.
 */
import type { FastifyPluginAsync } from 'fastify';
import { STAGE_META } from '../jobs/stages.js';
import { isStageImplemented } from '../jobs/runner.js';
import { runHealthChecks } from '../setup/checks.js';
import { cleanupJobTemps } from '../system/cleanup.js';
import { ASPECTS, LENGTHS, TONES, VOICE_CATALOG } from '../constants.js';
import type { AppDeps } from './deps.js';

export const systemRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.get('/api/meta', async () => ({
    stages: STAGE_META.map((stage) => ({
      ...stage,
      implemented: isStageImplemented(stage.n),
    })),
    tones: TONES,
    lengths: LENGTHS,
    aspects: ASPECTS,
    voices: VOICE_CATALOG,
    config: deps.config,
  }));

  let cached: { at: number; report: Awaited<ReturnType<typeof runHealthChecks>> } | null = null;

  app.get('/api/system/health', async () => {
    if (cached && Date.now() - cached.at < 15_000) return cached.report;
    const report = await runHealthChecks(deps.config);
    cached = { at: Date.now(), report };
    return report;
  });

  app.post('/api/system/cleanup', async () => {
    const result = await cleanupJobTemps(deps.store.jobsDir);
    deps.bus.publish({ type: 'system', payload: { event: 'cleanup', ...result } });
    return result;
  });
};
