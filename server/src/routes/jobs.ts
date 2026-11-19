/**
 * Job routes: create, list, read, edit the brief, run stages, logs, refs, SSE.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { briefInputSchema, durationBudget, type BriefInput } from '../schemas/brief.js';
import { summarizeJob, type Job, type StageNumber } from '../schemas/job.js';
import { isStageImplemented } from '../jobs/runner.js';
import { slugifyTopic } from '../jobs/store.js';
import { readJobLogs } from '../logger.js';
import type { AppDeps } from './deps.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const runBodySchema = z
  .object({
    pauseAfter: z.array(z.number().int().min(1).max(10)).max(10).optional(),
  })
  .optional();

async function saveReferenceImages(
  refsDir: string,
  images: NonNullable<BriefInput['referenceImages']>,
): Promise<string[]> {
  await fs.mkdir(refsDir, { recursive: true });
  const names: string[] = [];
  for (const [index, image] of images.entries()) {
    const buffer = Buffer.from(image.dataBase64, 'base64');
    if (buffer.byteLength === 0) throw new Error(`Reference image "${image.name}" is empty.`);
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Reference image "${image.name}" exceeds 8 MB.`);
    }
    const extension = MIME_EXTENSION[image.mimeType];
    if (!extension) throw new Error(`Unsupported image type "${image.mimeType}".`);
    const base = slugifyTopic(path.parse(image.name).name || 'ref', 24);
    const name = `${index + 1}-${base}.${extension}`;
    await fs.writeFile(path.join(refsDir, name), buffer);
    names.push(name);
  }
  return names;
}

function jobResponse(job: Job, files: string[], budget: ReturnType<typeof durationBudget> | null) {
  return {
    job,
    summary: summarizeJob(job),
    files,
    budget,
  };
}

export const jobRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  const { store, bus, runner } = deps;

  app.get('/api/jobs', async () => {
    const jobs = await store.list();
    return { jobs: jobs.map(summarizeJob) };
  });

  app.post('/api/jobs', async (request, reply) => {
    const input = briefInputSchema.parse(request.body ?? {});

    const pack = await deps.styles.get(input.styleId);
    if (!pack) {
      return reply
        .code(400)
        .send({ error: `Unknown style "${input.styleId}".`, code: 'validation' });
    }

    const job = await store.createJob({ ...input, referenceImages: [] }, []);
    let updated = job;
    if (input.referenceImages.length > 0) {
      const names = await saveReferenceImages(
        path.join(store.jobDir(job.id), 'refs'),
        input.referenceImages,
      );
      updated = await store.writeBrief(job.id, input, names);
    }

    await fs
      .mkdir(path.join(store.jobDir(job.id), 'logs'), { recursive: true })
      .catch(() => undefined);
    bus.publish({
      type: 'job.created',
      jobId: updated.id,
      payload: { summary: summarizeJob(updated) },
    });
    const files = await store.listFiles(updated.id);
    return reply
      .code(201)
      .send(jobResponse(updated, files, updated.brief ? durationBudget(updated.brief) : null));
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request) => {
    const job = await store.read(request.params.id);
    const files = await store.listFiles(job.id);
    return jobResponse(job, files, job.brief ? durationBudget(job.brief) : null);
  });

  app.put<{ Params: { id: string } }>('/api/jobs/:id/brief', async (request, reply) => {
    const id = request.params.id;
    const existing = await store.read(id);
    const input = briefInputSchema.parse(request.body ?? {});

    if (!(await deps.styles.has(input.styleId))) {
      return reply
        .code(400)
        .send({ error: `Unknown style "${input.styleId}".`, code: 'validation' });
    }

    let referenceFiles = existing.brief?.referenceImages ?? [];
    if (input.referenceImages.length > 0) {
      referenceFiles = await saveReferenceImages(
        path.join(store.jobDir(id), 'refs'),
        input.referenceImages,
      );
    }

    const job = await store.writeBrief(id, input, referenceFiles);
    bus.publish({
      type: 'job.updated',
      jobId: id,
      payload: { summary: summarizeJob(job) },
    });
    const files = await store.listFiles(id);
    return jobResponse(job, files, job.brief ? durationBudget(job.brief) : null);
  });

  app.post<{ Params: { id: string; n: string } }>(
    '/api/jobs/:id/stages/:n/run',
    async (request, reply) => {
      const stage = Number(request.params.n);
      if (!Number.isInteger(stage) || stage < 1 || stage > 10) {
        return reply.code(400).send({
          error: 'Stage must be an integer from 1 to 10.',
          code: 'validation',
        });
      }
      const job = await store.read(request.params.id);
      if (!job.brief) {
        return reply.code(400).send({ error: 'This job has no brief yet.', code: 'no_brief' });
      }
      if (!isStageImplemented(stage)) {
        return reply.code(400).send({
          error: `Stage ${stage} is not implemented in this build yet.`,
          code: 'not_implemented',
        });
      }
      if (runner.isRunning(job.id)) {
        return reply.code(409).send({ error: 'This job is already running.', code: 'busy' });
      }

      void runner.runStage(job.id, stage as StageNumber).catch((error: unknown) => {
        request.log.error({ err: error }, `Stage ${stage} failed`);
      });
      return reply.code(202).send({ started: true, stage });
    },
  );

  app.post<{ Params: { id: string } }>('/api/jobs/:id/run', async (request, reply) => {
    const body = runBodySchema.parse(request.body ?? {});
    const job = await store.read(request.params.id);
    if (!job.brief) {
      return reply.code(400).send({ error: 'This job has no brief yet.', code: 'no_brief' });
    }
    if (runner.isRunning(job.id)) {
      return reply.code(409).send({ error: 'This job is already running.', code: 'busy' });
    }
    void runner.runAll(job.id, body?.pauseAfter).catch((error: unknown) => {
      request.log.error({ err: error }, 'Pipeline run failed');
    });
    return reply.code(202).send({ started: true });
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (request) => {
    const job = await store.read(request.params.id);
    const cancelled = runner.cancel(job.id);
    return { cancelled };
  });

  app.get<{ Params: { id: string }; Querystring: { stage?: string } }>(
    '/api/jobs/:id/logs',
    async (request, reply) => {
      const job = await store.read(request.params.id);
      const rawStage = request.query.stage;
      let stage: number | undefined;
      if (rawStage !== undefined && rawStage !== '') {
        const n = Number(rawStage);
        if (!Number.isInteger(n) || n < 1 || n > 10) {
          return reply.code(400).send({ error: 'stage must be 1-10', code: 'validation' });
        }
        stage = n;
      }
      const text = await readJobLogs(store.jobsDir, job.id, stage);
      return { stage: stage ?? null, text };
    },
  );

  app.get<{ Params: { id: string; name: string } }>(
    '/api/jobs/:id/refs/:name',
    async (request, reply) => {
      const job = await store.read(request.params.id);
      const name = request.params.name;
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        return reply.code(400).send({ error: 'Invalid reference name' });
      }
      const file = path.join(store.jobDir(job.id), 'refs', name);
      try {
        const buffer = await fs.readFile(file);
        const type = name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        return reply.type(type).header('Cache-Control', 'private, max-age=30').send(buffer);
      } catch {
        return reply.code(404).send({ error: 'Reference image not found' });
      }
    },
  );

  app.get<{ Querystring: { jobId?: string } }>('/api/events', async (request, reply) => {
    const jobId = request.query.jobId;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    const unsubscribe = bus.subscribe((event) => {
      if (jobId) {
        if (event.jobId !== jobId) return;
      }
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* client gone */
      }
    });

    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* client gone */
      }
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
};
