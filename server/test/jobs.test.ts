import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  InvalidJobIdError,
  JobNotFoundError,
  JobStore,
} from '../src/jobs/store.js';
import { jobSchema } from '../src/schemas/job.js';
import { makeTempDir, validBrief } from './helpers.js';

describe('job store', () => {
  it('creates a resumable job folder with brief.json and job.json', async () => {
    const jobsDir = await makeTempDir();
    const store = new JobStore(jobsDir);
    const job = await store.createJob(validBrief, []);

    expect(job.id).toMatch(/^[a-z0-9][a-z0-9-]{5,63}$/);
    expect(job.brief?.targetWords).toBe(150);
    expect(job.stages['1'].status).toBe('done');
    expect(job.stages['2'].status).toBe('pending');

    const dir = path.join(jobsDir, job.id);
    for (const sub of ['refs', 'logs', 'audio', 'tmp']) {
      await expect(fs.access(path.join(dir, sub))).resolves.toBeUndefined();
    }

    const briefRaw = JSON.parse(await fs.readFile(path.join(dir, 'brief.json'), 'utf8')) as {
      topic: string;
    };
    expect(briefRaw.topic).toBe(validBrief.topic);

    const jobRaw = JSON.parse(await fs.readFile(path.join(dir, 'job.json'), 'utf8')) as unknown;
    expect(jobSchema.safeParse(jobRaw).success).toBe(true);

    const listed = await store.list();
    expect(listed.map((entry) => entry.id)).toContain(job.id);
  });

  it('marks downstream stages stale but keeps their artifacts on disk', async () => {
    const jobsDir = await makeTempDir();
    const store = new JobStore(jobsDir);
    const job = await store.createJob(validBrief, []);

    await store.writeStageFile(job.id, 'facts.json', { claims: ['a'] });
    await store.updateStage(job.id, 2, { status: 'done', artifact: 'facts.json' });
    await store.writeStageFile(job.id, 'script.json', { beats: [1, 2] });
    await store.updateStage(job.id, 3, { status: 'done', artifact: 'script.json' });

    const afterEdit = await store.writeBrief(job.id, { ...validBrief, tone: 'dramatic' }, []);
    expect(afterEdit.stages['1'].status).toBe('done');
    expect(afterEdit.stages['2'].status).toBe('stale');
    expect(afterEdit.stages['3'].status).toBe('stale');
    expect(afterEdit.brief?.tone).toBe('dramatic');

    const facts = await store.readStageFile(
      job.id,
      'facts.json',
      z.object({ claims: z.array(z.string()) }),
    );
    expect(facts).toEqual({ claims: ['a'] });
  });

  it('accumulates token cost per job', async () => {
    const jobsDir = await makeTempDir();
    const store = new JobStore(jobsDir);
    const job = await store.createJob(validBrief, []);

    await store.addCost(job.id, { inputTokens: 1000, outputTokens: 500 }, 0.00082);
    await store.addCost(job.id, { inputTokens: 1000, outputTokens: 500 }, 0.00082);
    const updated = await store.read(job.id);

    expect(updated.cost.inputTokens).toBe(2000);
    expect(updated.cost.outputTokens).toBe(1000);
    expect(updated.cost.calls).toBe(2);
    expect(updated.cost.usd).toBeCloseTo(0.00164, 5);
  });

  it('rejects unknown and malformed job ids', async () => {
    const jobsDir = await makeTempDir();
    const store = new JobStore(jobsDir);
    await expect(store.read('does-not-exist-xyz')).rejects.toBeInstanceOf(JobNotFoundError);
    await expect(store.read('../escape')).rejects.toBeInstanceOf(InvalidJobIdError);
  });
});
