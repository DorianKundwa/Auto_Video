import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { repoRoot } from '../src/config.js';
import { JobStore } from '../src/jobs/store.js';
import { briefSchema } from '../src/schemas/brief.js';
import type { Job, JobSummary } from '../src/schemas/job.js';
import { briefWith, makeTempDir, validBrief } from './helpers.js';

let app: FastifyInstance;
let jobsDir: string;

beforeAll(async () => {
  jobsDir = await makeTempDir('shortforge-stage1-');
  app = await buildApp({ jobsDir, stylesDir: path.join(repoRoot, 'styles') });
});

afterAll(async () => {
  await app.close();
});

interface CreateResponse {
  job: Job;
  summary: JobSummary;
  files: string[];
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

describe('Stage 1 acceptance', () => {
  it('creates a job folder that validates as a brief', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/jobs', payload: validBrief });
    expect(response.statusCode).toBe(201);
    const body = response.json<CreateResponse>();

    expect(body.job.brief?.topic).toBe(validBrief.topic);
    expect(body.job.stages['1'].status).toBe('done');
    expect(body.files).toContain('brief.json');
    expect(body.summary.currentStage).toBe(2);

    const jobDir = path.join(jobsDir, body.job.id);
    const stat = await fs.stat(jobDir);
    expect(stat.isDirectory()).toBe(true);

    const onDisk = JSON.parse(await fs.readFile(path.join(jobDir, 'brief.json'), 'utf8')) as unknown;
    expect(briefSchema.safeParse(onDisk).success).toBe(true);
    await expect(fs.access(path.join(jobDir, 'job.json'))).resolves.toBeUndefined();
  });

  it('lists the job for the sidebar with per-stage statuses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(response.statusCode).toBe(200);
    const { jobs } = response.json<{ jobs: JobSummary[] }>();

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const first = jobs[0];
    expect(first).toBeDefined();
    expect(first?.stageStatuses['1']).toBe('done');
    expect(first?.stageStatuses['2']).toBe('pending');
    expect(first?.cost.usd).toBe(0);
  });

  it('rejects an invalid brief with field-level errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { ...validBrief, tone: 'explosive' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string; issues: Array<{ path: string }> }>();
    expect(body.code).toBe('validation');
    expect(body.issues.some((issue) => issue.path === 'tone')).toBe(true);

    const unknownStyle = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { ...validBrief, styleId: 'claymation' },
    });
    expect(unknownStyle.statusCode).toBe(400);
  });

  it('exposes all ten style packs with preview images', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/styles' });
    const { styles } = response.json<{
      styles: Array<{ id: string; previewUrl: string | null; contrast: { ok: boolean } }>;
    }>();
    expect(styles).toHaveLength(10);
    expect(styles.every((style) => style.previewUrl?.includes('/preview.png'))).toBe(true);
    expect(styles.every((style) => style.contrast.ok)).toBe(true);

    const preview = await app.inject({ method: 'GET', url: '/api/styles/soft-3d/preview.png' });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toBe('image/png');
  });

  it('marks downstream stages stale when the brief is edited', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/jobs', payload: validBrief });
    const { job } = created.json<CreateResponse>();

    const store = new JobStore(jobsDir);
    await store.writeStageFile(job.id, 'facts.json', { claims: [] });
    await store.updateStage(job.id, 2, { status: 'done', artifact: 'facts.json' });

    const edited = await app.inject({
      method: 'PUT',
      url: `/api/jobs/${job.id}/brief`,
      payload: briefWith({ tone: 'funny', lengthSeconds: 30 }),
    });
    expect(edited.statusCode).toBe(200);
    const updated = edited.json<CreateResponse>();
    expect(updated.job.brief?.tone).toBe('funny');
    expect(updated.job.brief?.targetWords).toBe(75);
    expect(updated.job.stages['1'].status).toBe('done');
    expect(updated.job.stages['2'].status).toBe('stale');

    // The stale stage keeps its artifact so the job stays resumable.
    await expect(fs.access(path.join(jobsDir, job.id, 'facts.json'))).resolves.toBeUndefined();
  });

  it('re-runs Stage 1 and refuses stages that are not implemented yet', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/jobs', payload: validBrief });
    const { job } = created.json<CreateResponse>();

    const initialStartedAt = job.stages['1'].startedAt;
    const run = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stages/1/run` });
    expect(run.statusCode).toBe(202);

    // Stage 1 is already "done" from creation, so wait for the rerun's new
    // start timestamp and for the runner to release the job.
    const finished = await waitFor(
      async () =>
        (await app.inject({ method: 'GET', url: `/api/jobs/${job.id}` })).json<{ job: Job }>().job,
      (value) =>
        value.stages['1'].status === 'done' &&
        value.stages['1'].startedAt !== initialStartedAt &&
        value.run.status === 'idle',
    );
    expect(finished.stages['1'].artifact).toBe('brief.json');

    const notReady = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/stages/2/run` });
    expect(notReady.statusCode).toBe(400);
    expect(notReady.json<{ code: string }>().code).toBe('not_implemented');

    const runAll = await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/run`,
      payload: { pauseAfter: [3, 5] },
    });
    expect(runAll.statusCode).toBe(202);

    const paused = await waitFor(
      async () =>
        (await app.inject({ method: 'GET', url: `/api/jobs/${job.id}` })).json<{ job: Job }>().job,
      (value) => value.run.status === 'paused',
    );
    expect(paused.run.message).toContain('Stage 2');
  });

  it('serves a readiness report for the setup screen', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/system/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      checks: Array<{ id: string; status: string }>;
      config: { mockMode: boolean };
    }>();
    expect(body.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(['node', 'ffmpeg', 'python', 'disk']),
    );
    expect(body.checks.find((check) => check.id === 'node')?.status).toBe('ok');
  });
});
