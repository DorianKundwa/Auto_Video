export type StageStatus = 'pending' | 'running' | 'done' | 'stale' | 'failed';

export interface StageState {
  status: StageStatus;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  artifact?: string;
  error?: string;
  note?: string;
}

export interface JobCost {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  calls: number;
}

export type RunStatus = 'idle' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface RunState {
  status: RunStatus;
  currentStage: number | null;
  pauseAfter: number[];
  message?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type Tone = 'deadpan' | 'dramatic' | 'funny' | 'educational';

export interface Brief {
  topic: string;
  audience: string;
  tone: Tone;
  lengthSeconds: 30 | 60 | 90;
  language: string;
  styleId: string;
  voice: string;
  aspect: '9:16' | '16:9';
  ownStory?: string;
  referenceImages: string[];
  targetWords: number;
  wordsPerSecond: number;
  createdAt: string;
}

export interface BriefDraft {
  topic: string;
  audience: string;
  tone: Tone;
  lengthSeconds: 30 | 60 | 90;
  language: string;
  styleId: string;
  voice: string;
  aspect: '9:16' | '16:9';
  ownStory?: string;
  referenceImages: Array<{ name: string; mimeType: string; dataBase64: string }>;
}

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  brief: Brief | null;
  stages: Record<string, StageState>;
  cost: JobCost;
  run: RunState;
}

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
  stageStatuses: Record<string, StageStatus>;
  currentStage: number;
  cost: JobCost;
  run: RunState;
}

export interface Budget {
  targetSeconds: number;
  tolerancePct: number;
  minSeconds: number;
  maxSeconds: number;
  targetWords: number;
}

export interface JobDetail {
  job: Job;
  summary: JobSummary;
  files: string[];
  budget: Budget | null;
}

export interface Palette {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  outline: string;
}

export interface StylePackSummary {
  id: string;
  name: string;
  description: string;
  palette: Palette;
  fonts: { heading: string; body: string; subtitle: string };
  outline: { color: string; widthPx: number; style: string };
  grain: { enabled: boolean; intensity: number };
  subtitle: { style: string; safeAreaPct: number; karaokeHighlight: boolean };
  render: { fps: number; letterbox: boolean; dof: boolean; internalScale?: number };
  post: Record<string, number | boolean | string>;
  previewUrl: string | null;
  stageReady: boolean;
  contrast: { ok: boolean; checks: Array<{ pair: string; ratio: number; min: number; ok: boolean }> };
  vocab: Record<string, string[]>;
}

export interface StageMeta {
  n: number;
  key: string;
  name: string;
  short: string;
  output: string;
  description: string;
  implemented: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
  language: string;
}

export interface Meta {
  stages: StageMeta[];
  tones: Tone[];
  lengths: number[];
  aspects: string[];
  voices: Record<string, VoiceOption[]>;
}

export interface HealthCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'missing';
  required: boolean;
  detail: string;
  hint?: string;
}

export interface Health {
  ok: boolean;
  checks: HealthCheck[];
  checkedAt: string;
  config: {
    model: string;
    mockMode: boolean;
    mockModeSetting: string;
    visionEnabled: boolean;
    ttsProvider: string;
    defaultVoice?: string;
    defaultStyle?: string;
    deepseekKeyConfigured: boolean;
    searchKeyConfigured: boolean;
    repoRoot: string;
  };
}

export interface SettingsResponse {
  settings: {
    model: string;
    ttsProvider: string;
    vision: 'on' | 'off';
    defaultStyle: string;
    concurrency: number;
  };
  secrets: { deepseekApiKey: boolean; searchApiKey: boolean };
  sources: { deepseekApiKey: string | null; searchApiKey: string | null };
  config: Health['config'];
}

export interface BusEvent {
  id: string;
  type: 'job.created' | 'job.updated' | 'stage.status' | 'run.state' | 'log' | 'system' | 'health';
  at: string;
  jobId?: string;
  payload?: unknown;
}

export interface ApiErrorBody {
  error?: string;
  code?: string;
  issues?: Array<{ path: string; message: string }>;
}
