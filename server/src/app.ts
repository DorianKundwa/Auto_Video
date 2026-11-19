/**
 * Fastify application assembly. Everything is injected: tests build the app
 * against a temp jobs dir without touching the real one.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { getConfig, type RuntimeConfig } from './config.js';
import { EventBus } from './events.js';
import {
  JobRunner,
  StageBusyError,
  StageCancelledError,
  StageNotImplementedError,
} from './jobs/runner.js';
import { InvalidJobIdError, JobNotFoundError, JobStore } from './jobs/store.js';
import { configureLlmClient } from './llm.js';
import { jobRoutes } from './routes/jobs.js';
import { settingsRoutes } from './routes/settings.js';
import { styleRoutes } from './routes/styles.js';
import { systemRoutes } from './routes/system.js';
import { StylePackError, StyleRegistry } from './styles/registry.js';
import type { AppDeps } from './routes/deps.js';

export interface BuildAppOptions {
  jobsDir?: string;
  stylesDir?: string;
  config?: RuntimeConfig;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const baseConfig = options.config ?? getConfig();
  const config: RuntimeConfig = {
    ...baseConfig,
    jobsDir: options.jobsDir ? path.resolve(options.jobsDir) : baseConfig.jobsDir,
    stylesDir: options.stylesDir ?? baseConfig.stylesDir,
  };

  await fsp.mkdir(config.jobsDir, { recursive: true });

  const store = new JobStore(config.jobsDir);
  const bus = new EventBus();
  const styles = new StyleRegistry(config.stylesDir);
  const runner = new JobRunner({ store, styles, bus, config });

  // Every DeepSeek call is made from llm.ts; usage lands in the job's cost.
  configureLlmClient({
    config: () => config,
    onUsage: async (jobId, usage, usd) => {
      await store.addCost(jobId, usage, usd);
    },
  });

  const app = Fastify({
    logger: options.logger ? { level: process.env.SHORTFORGE_LOG_LEVEL ?? 'info' } : false,
    bodyLimit: 32 * 1024 * 1024,
  });

  const deps: AppDeps = { config, store, styles, bus, runner };

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        code: 'validation',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }
    if (error instanceof JobNotFoundError) {
      return reply.code(404).send({ error: error.message, code: 'job_not_found' });
    }
    if (error instanceof InvalidJobIdError) {
      return reply.code(400).send({ error: error.message, code: 'invalid_job_id' });
    }
    if (error instanceof StageBusyError) {
      return reply.code(409).send({ error: error.message, code: 'busy' });
    }
    if (error instanceof StageNotImplementedError) {
      return reply.code(400).send({ error: error.message, code: 'not_implemented' });
    }
    if (error instanceof StageCancelledError) {
      return reply.code(409).send({ error: error.message, code: 'cancelled' });
    }
    if (error instanceof StylePackError) {
      request.log.error({ err: error }, 'Style pack error');
      return reply.code(500).send({ error: error.message, code: 'style_pack' });
    }
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: message, code: 'request_error' });
    }
    request.log.error({ err: error }, 'Unhandled server error');
    return reply.code(500).send({
      error: 'Internal server error',
      code: 'internal',
      message,
    });
  });

  await app.register(systemRoutes, deps);
  await app.register(styleRoutes, deps);
  await app.register(settingsRoutes, deps);
  await app.register(jobRoutes, deps);

  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: '/',
      wildcard: false,
      index: false,
    });
    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? '';
      if (url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found', code: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if ((request.raw.url ?? '').startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found', code: 'not_found' });
      }
      return reply
        .code(503)
        .type('text/plain')
        .send('ShortForge API is running. The GUI build is missing — run "npm run dev:web" or "npm run build".');
    });
  }

  app.get('/api/ping', async () => ({ ok: true, name: 'shortforge', now: new Date().toISOString() }));

  return app;
}
