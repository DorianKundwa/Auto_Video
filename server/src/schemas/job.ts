/**
 * Job state persisted as jobs/<id>/job.json. One file per job holds stage
 * statuses, LLM cost, and run-control state; stage payloads live beside it in
 * their own JSON files so any stage can be re-run without losing earlier work.
 */
import { z } from 'zod';
import { briefSchema } from './brief.js';

export const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type StageNumber = (typeof STAGE_NUMBERS)[number];

export const STAGE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_STATUSES = ['pending', 'running', 'done', 'stale', 'failed'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const stageStateSchema = z.object({
  status: z.enum(STAGE_STATUSES),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  artifact: z.string().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});
export type StageState = z.infer<typeof stageStateSchema>;

export const jobCostSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  usd: z.number().nonnegative().default(0),
  calls: z.number().int().nonnegative().default(0),
});
export type JobCost = z.infer<typeof jobCostSchema>;

export const runStateSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'done', 'failed', 'cancelled']),
  currentStage: z.number().int().min(1).max(10).nullable().default(null),
  pauseAfter: z.array(z.number().int().min(1).max(10)).default([3, 5]),
  message: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type RunState = z.infer<typeof runStateSchema>;

export const jobSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{5,63}$/),
  createdAt: z.string(),
  updatedAt: z.string(),
  brief: briefSchema.nullable(),
  stages: z.record(z.enum(STAGE_KEYS), stageStateSchema),
  cost: jobCostSchema,
  run: runStateSchema,
});
export type Job = z.infer<typeof jobSchema>;

export interface JobSummary {
  id: string;
  topic: string;
  styleId: string;
  tone: string;
  lengthSeconds: number;
  aspect: string;
  voice: string;
  createdAt: string;
  updatedAt: string;
  stageStatuses: Record<StageKey, StageStatus>;
  currentStage: number;
  cost: JobCost;
  run: RunState;
}

export function initialStages(completedThrough = 1): Record<StageKey, StageState> {
  const now = new Date().toISOString();
  const stages = {} as Record<StageKey, StageState>;
  for (const key of STAGE_KEYS) {
    const n = Number(key);
    stages[key] = {
      status: n <= completedThrough ? 'done' : 'pending',
      updatedAt: now,
    };
  }
  return stages;
}

export function summarizeJob(job: Job): JobSummary {
  const stageStatuses = {} as Record<StageKey, StageStatus>;
  let currentStage: number | null = null;
  for (const key of STAGE_KEYS) {
    const status = job.stages[key].status;
    stageStatuses[key] = status;
    if (status !== 'done' && currentStage === null) currentStage = Number(key);
  }
  return {
    id: job.id,
    topic: job.brief?.topic ?? job.id,
    styleId: job.brief?.styleId ?? 'soft-3d',
    tone: job.brief?.tone ?? 'deadpan',
    lengthSeconds: job.brief?.lengthSeconds ?? 60,
    aspect: job.brief?.aspect ?? '9:16',
    voice: job.brief?.voice ?? '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    stageStatuses,
    currentStage: currentStage ?? 10,
    cost: job.cost,
    run: job.run,
  };
}
