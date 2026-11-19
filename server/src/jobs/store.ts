/**
 * Job folder persistence.
 *
 *   jobs/<id>/job.json      stage statuses, cost, run state
 *   jobs/<id>/brief.json    Stage 1 payload
 *   jobs/<id>/refs/         reference images
 *   jobs/<id>/logs/         per-stage logs
 *   jobs/<id>/audio/        voice + mix outputs (Stage 6/7)
 *   jobs/<id>/frames/       QA frame extracts (Stage 9)
 *
 * Writes are atomic (tmp file + rename) and serialized per job, so a stage that
 * fails halfway can never leave a truncated job.json behind.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { briefSchema, deriveBrief, type BriefInput } from '../schemas/brief.js';
import {
  initialStages,
  jobSchema,
  STAGE_KEYS,
  type Job,
  type StageKey,
  type StageState,
  type StageStatus,
} from '../schemas/job.js';

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job "${id}" was not found.`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidJobIdError extends Error {
  constructor(id: string) {
    super(`Invalid job id "${id}".`);
    this.name = 'InvalidJobIdError';
  }
}

const JOB_ID_RE = /^[a-z0-9][a-z0-9-]{5,63}$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function slugifyTopic(topic: string, max = 24): string {
  const slug = topic
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'short';
}

export function makeJobId(topic: string, now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${stamp}-${slugifyTopic(topic)}-${random}`;
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  try {
    await fs.rename(tmp, file);
  } catch {
    // Windows can refuse to replace an existing file under a rename.
    await fs.rm(file, { force: true });
    await fs.rename(tmp, file);
  }
}

export class JobStore {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(readonly jobsDir: string) {}

  jobDir(id: string): string {
    this.assertValidId(id);
    return path.join(this.jobsDir, id);
  }

  private assertValidId(id: string): void {
    if (!JOB_ID_RE.test(id)) throw new InvalidJobIdError(id);
  }

  /** Run a mutation for one job at a time. */
  private serialize<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.locks.set(
      id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  async createJob(
    input: BriefInput,
    referenceImageFiles: string[] = [],
    now: Date = new Date(),
  ): Promise<Job> {
    const brief = deriveBrief(input, referenceImageFiles, now);
    let id = makeJobId(input.topic, now);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fs.mkdir(path.join(this.jobsDir, id), { recursive: false });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt === 4) throw error;
        id = makeJobId(input.topic, new Date(now.getTime() + (attempt + 1) * 1000));
      }
    }

    const dir = path.join(this.jobsDir, id);
    await fs.mkdir(path.join(dir, 'refs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'audio'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tmp'), { recursive: true });

    const timestamp = now.toISOString();
    const stages = initialStages(1);
    stages['1'] = {
      status: 'done',
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      artifact: 'brief.json',
    };

    const job: Job = {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      brief,
      stages,
      cost: { inputTokens: 0, outputTokens: 0, usd: 0, calls: 0 },
      run: { status: 'idle', currentStage: null, pauseAfter: [3, 5] },
    };

    await writeJsonAtomic(path.join(dir, 'brief.json'), brief);
    await writeJsonAtomic(path.join(dir, 'job.json'), job);
    return job;
  }

  async read(id: string): Promise<Job> {
    this.assertValidId(id);
    try {
      const raw = await fs.readFile(path.join(this.jobsDir, id, 'job.json'), 'utf8');
      return jobSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new JobNotFoundError(id);
      throw error;
    }
  }

  async list(): Promise<Job[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.jobsDir);
    } catch {
      return [];
    }
    const jobs: Job[] = [];
    for (const entry of entries) {
      if (!JOB_ID_RE.test(entry)) continue;
      try {
        jobs.push(await this.read(entry));
      } catch {
        // Skip folders without a readable job.json.
      }
    }
    jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return jobs;
  }

  async updateJob(id: string, mutate: (job: Job) => Job): Promise<Job> {
    return this.serialize(id, async () => {
      const current = await this.read(id);
      const next = mutate(structuredClone(current));
      next.updatedAt = new Date().toISOString();
      await writeJsonAtomic(path.join(this.jobsDir, id, 'job.json'), next);
      return next;
    });
  }

  async updateStage(
    id: string,
    stage: number,
    patch: Partial<StageState> & { status?: StageStatus },
  ): Promise<Job> {
    const key = String(stage) as StageKey;
    if (!STAGE_KEYS.includes(key)) throw new Error(`Unknown stage ${stage}`);
    const now = new Date().toISOString();
    return this.updateJob(id, (job) => {
      const previous = job.stages[key];
      job.stages[key] = {
        ...previous,
        ...patch,
        status: patch.status ?? previous.status,
        updatedAt: now,
      };
      if (patch.status === 'done') {
        job.stages[key].finishedAt = now;
        job.stages[key].error = undefined;
      }
      if (patch.status === 'failed') {
        job.stages[key].finishedAt = now;
      }
      return job;
    });
  }

  /** Mark all completed stages after `stage` as stale (never loses files). */
  async invalidateDownstream(id: string, stage: number): Promise<Job> {
    const now = new Date().toISOString();
    return this.updateJob(id, (job) => {
      for (const key of STAGE_KEYS) {
        const n = Number(key);
        if (n <= stage) continue;
        const state = job.stages[key];
        if (state.status === 'done' || state.status === 'failed') {
          job.stages[key] = { ...state, status: 'stale', updatedAt: now };
        }
      }
      return job;
    });
  }

  async writeStageFile(id: string, filename: string, data: unknown): Promise<void> {
    this.assertValidId(id);
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) throw new Error(`Invalid artifact name ${filename}`);
    await writeJsonAtomic(path.join(this.jobsDir, id, filename), data);
  }

  async readStageFile<T>(id: string, filename: string, schema: z.ZodType<T>): Promise<T | null> {
    this.assertValidId(id);
    try {
      const raw = await fs.readFile(path.join(this.jobsDir, id, filename), 'utf8');
      return schema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readBrief(id: string) {
    return this.readStageFile(id, 'brief.json', briefSchema);
  }

  async writeBrief(id: string, input: BriefInput, referenceImageFiles: string[]): Promise<Job> {
    const brief = deriveBrief(input, referenceImageFiles);
    await this.writeStageFile(id, 'brief.json', brief);
    const now = new Date().toISOString();
    return this.updateJob(id, (job) => {
      job.brief = brief;
      job.stages['1'] = {
        status: 'done',
        updatedAt: now,
        startedAt: job.stages['1'].startedAt ?? now,
        finishedAt: now,
        artifact: 'brief.json',
      };
      for (const key of STAGE_KEYS) {
        if (key === '1') continue;
        const state = job.stages[key];
        if (state.status === 'done' || state.status === 'failed') {
          job.stages[key] = { ...state, status: 'stale', updatedAt: now };
        }
      }
      return job;
    });
  }

  async addCost(
    id: string,
    usage: { inputTokens: number; outputTokens: number },
    usd: number,
  ): Promise<void> {
    await this.updateJob(id, (job) => {
      job.cost = {
        inputTokens: job.cost.inputTokens + usage.inputTokens,
        outputTokens: job.cost.outputTokens + usage.outputTokens,
        usd: Math.round((job.cost.usd + usd) * 1_000_000) / 1_000_000,
        calls: job.cost.calls + 1,
      };
      return job;
    });
  }

  async setRun(
    id: string,
    patch: Partial<Job['run']>,
  ): Promise<Job> {
    return this.updateJob(id, (job) => {
      job.run = { ...job.run, ...patch };
      return job;
    });
  }

  async listFiles(id: string): Promise<string[]> {
    this.assertValidId(id);
    const dir = path.join(this.jobsDir, id);
    const out: string[] = [];
    const walk = async (relative: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(path.join(dir, relative), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(rel);
        } else if (rel !== 'job.json' && !rel.startsWith('logs/')) {
          out.push(rel);
        }
      }
    };
    await walk('');
    out.sort();
    return out;
  }
}
