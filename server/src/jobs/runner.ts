/**
 * Stage execution. Stage 1 is implemented here; later stages register handlers
 * in the same map. Every run updates stage status, streams log lines over SSE,
 * and leaves earlier artifacts untouched on failure.
 */
import type { RuntimeConfig } from '../config.js';
import { appendStageLog } from '../logger.js';
import { briefSchema } from '../schemas/brief.js';
import { summarizeJob, type Job, type StageNumber } from '../schemas/job.js';
import type { StyleRegistry } from '../styles/registry.js';
import type { EventBus } from '../events.js';
import { stageArtifact, STAGE_META, stageMeta } from './stages.js';
import type { JobStore } from './store.js';

export class StageBusyError extends Error {
  constructor(jobId: string) {
    super(`Job "${jobId}" is already running a stage.`);
    this.name = 'StageBusyError';
  }
}

export class StageNotImplementedError extends Error {
  constructor(stage: number) {
    super(`Stage ${stage} is not implemented in this build yet.`);
    this.name = 'StageNotImplementedError';
  }
}

export class StageCancelledError extends Error {
  constructor() {
    super('Stage cancelled by user.');
    this.name = 'StageCancelledError';
  }
}

export interface StageContext {
  jobId: string;
  stage: StageNumber;
  store: JobStore;
  styles: StyleRegistry;
  config: RuntimeConfig;
  signal: AbortSignal;
  log: (message: string) => Promise<void>;
}

export interface StageOutcome {
  artifact?: string;
  note?: string;
}

export type StageHandler = (ctx: StageContext) => Promise<StageOutcome>;

interface ActiveRun {
  controller: AbortController;
  stage: StageNumber | null;
}

async function stageOne(ctx: StageContext): Promise<StageOutcome> {
  const job = await ctx.store.read(ctx.jobId);
  if (!job.brief) throw new Error('brief.json is missing — cannot run Stage 1.');

  // Load from disk so a hand-edited Brief can never bypass validation.
  const parsed = briefSchema.parse((await ctx.store.readBrief(ctx.jobId)) ?? job.brief);

  const pack = await ctx.styles.get(parsed.styleId);
  if (!pack) {
    throw new Error(`Unknown style "${parsed.styleId}". Run "npm run style:all" to rebuild style packs.`);
  }

  await ctx.store.writeStageFile(ctx.jobId, 'brief.json', parsed);
  await ctx.log(
    `Brief validated: "${parsed.topic}" · ${pack.name} · ${parsed.lengthSeconds}s · ${parsed.aspect} · voice ${parsed.voice}`,
  );
  await ctx.log(
    `Narration budget: ${parsed.targetWords} words at ${parsed.wordsPerSecond} words/sec (used by Stage 3).`,
  );
  if (parsed.referenceImages.length > 0) {
    await ctx.log(`Reference images: ${parsed.referenceImages.join(', ')}`);
  }
  if (ctx.config.mockMode) {
    await ctx.log('Mock mode is on: later stages will use canned responses from server/src/mock/fixtures.ts.');
  }
  return {
    artifact: 'brief.json',
    note: `${pack.name} · ${parsed.lengthSeconds}s · ${parsed.aspect}`,
  };
}

const HANDLERS: Partial<Record<StageNumber, StageHandler>> = {
  1: stageOne,
};

export function isStageImplemented(stage: number): boolean {
  return Boolean(HANDLERS[stage as StageNumber]);
}

export interface RunnerDeps {
  store: JobStore;
  styles: StyleRegistry;
  bus: EventBus;
  config: RuntimeConfig;
}

export class JobRunner {
  private readonly active = new Map<string, ActiveRun>();

  constructor(private readonly deps: RunnerDeps) {}

  isRunning(jobId: string): boolean {
    return this.active.has(jobId);
  }

  private async log(jobId: string, stage: number, line: string): Promise<void> {
    await appendStageLog(this.deps.store.jobsDir, jobId, stage, 'stage', line).catch(() => undefined);
    this.deps.bus.publish({
      type: 'log',
      jobId,
      payload: { stage, line: `[${new Date().toISOString()}] ${line}` },
    });
  }

  private publishJob(job: Job): void {
    this.deps.bus.publish({
      type: 'job.updated',
      jobId: job.id,
      payload: { summary: summarizeJob(job) },
    });
  }

  async runStage(
    jobId: string,
    stage: StageNumber,
    options: { viaRunAll?: boolean } = {},
  ): Promise<Job> {
    if (this.active.has(jobId)) throw new StageBusyError(jobId);
    const handler = HANDLERS[stage];
    if (!handler) throw new StageNotImplementedError(stage);
    const meta = stageMeta(stage);
    if (!meta) throw new StageNotImplementedError(stage);

    const controller = new AbortController();
    const activeEntry: ActiveRun = { controller, stage };
    this.active.set(jobId, activeEntry);

    const now = new Date().toISOString();
    await this.deps.store.updateStage(jobId, stage, {
      status: 'running',
      startedAt: now,
      error: undefined,
      note: undefined,
    });
    this.deps.bus.publish({ type: 'stage.status', jobId, payload: { stage, status: 'running' } });
    await this.log(jobId, stage, `▶ Stage ${stage} — ${meta.name}`);

    const ctx: StageContext = {
      jobId,
      stage,
      store: this.deps.store,
      styles: this.deps.styles,
      config: this.deps.config,
      signal: controller.signal,
      log: (line: string) => this.log(jobId, stage, line),
    };

    try {
      const outcome = await handler(ctx);
      if (controller.signal.aborted) throw new StageCancelledError();
      // Release the job before persisting the terminal status so a caller that
      // observes "done" can immediately start the next stage.
      this.release(jobId, activeEntry);
      const job = await this.deps.store.updateStage(jobId, stage, {
        status: 'done',
        artifact: outcome.artifact ?? stageArtifact(stage),
        note: outcome.note,
        error: undefined,
      });
      this.deps.bus.publish({
        type: 'stage.status',
        jobId,
        payload: { stage, status: 'done', artifact: outcome.artifact ?? stageArtifact(stage) },
      });
      await this.log(jobId, stage, `✓ Stage ${stage} done${outcome.note ? ` — ${outcome.note}` : ''}`);
      this.publishJob(job);
      return job;
    } catch (error) {
      this.release(jobId, activeEntry);
      const cancelled = controller.signal.aborted || error instanceof StageCancelledError;
      const message = cancelled
        ? 'Cancelled by user'
        : error instanceof Error
          ? error.message
          : String(error);
      const job = await this.deps.store.updateStage(jobId, stage, {
        status: cancelled ? 'pending' : 'failed',
        error: cancelled ? undefined : message,
        note: cancelled ? 'Cancelled — resume when ready' : undefined,
      });
      this.deps.bus.publish({
        type: 'stage.status',
        jobId,
        payload: { stage, status: cancelled ? 'pending' : 'failed', error: message },
      });
      await this.log(jobId, stage, cancelled ? '■ Stage cancelled' : `✗ Stage ${stage} failed: ${message}`);
      this.publishJob(job);
      if (cancelled) throw new StageCancelledError();
      throw error;
    } finally {
      this.release(jobId, activeEntry);
      if (!options.viaRunAll) {
        await this.deps.store
          .setRun(jobId, { status: 'idle', currentStage: null })
          .catch(() => undefined);
      }
    }
  }

  async runAll(jobId: string, pauseAfter?: number[]): Promise<void> {
    if (this.active.has(jobId)) throw new StageBusyError(jobId);
    const store = this.deps.store;
    const job = await store.read(jobId);
    if (!job.brief) throw new Error('Create a brief before running the pipeline.');

    const pauses = (pauseAfter ?? job.run.pauseAfter).filter((n) => n >= 1 && n <= 10);
    await store.setRun(jobId, {
      status: 'running',
      currentStage: 1,
      pauseAfter: pauses,
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      message: 'Running pipeline',
    });
    this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'running' } });

    try {
      for (const meta of STAGE_META) {
        if (!isStageImplemented(meta.n)) {
          const message = `Stage ${meta.n} (${meta.name}) is not implemented in this build — stopping the run. Earlier stages are saved.`;
          await store.setRun(jobId, { status: 'paused', currentStage: meta.n, message });
          this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'paused', message } });
          await this.log(jobId, meta.n, message);
          return;
        }
        await store.setRun(jobId, { currentStage: meta.n, message: `Running stage ${meta.n}` });
        await this.runStage(jobId, meta.n, { viaRunAll: true });

        if (pauses.includes(meta.n) && meta.n < 10) {
          const message = `Paused for review after Stage ${meta.n}.`;
          await store.setRun(jobId, { status: 'paused', currentStage: meta.n, message });
          this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'paused', message } });
          await this.log(jobId, meta.n, message);
          return;
        }
      }

      await store.setRun(jobId, {
        status: 'done',
        currentStage: null,
        finishedAt: new Date().toISOString(),
        message: 'All implemented stages finished.',
      });
      this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'done' } });
    } catch (error) {
      if (error instanceof StageCancelledError) {
        await store.setRun(jobId, { status: 'cancelled', message: 'Cancelled by user' });
        this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'cancelled' } });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await store.setRun(jobId, { status: 'failed', message });
      this.deps.bus.publish({ type: 'run.state', jobId, payload: { status: 'failed', message } });
      throw error;
    }
  }

  private release(jobId: string, entry: ActiveRun): void {
    if (this.active.get(jobId) === entry) this.active.delete(jobId);
  }

  cancel(jobId: string): boolean {
    const active = this.active.get(jobId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }
}
