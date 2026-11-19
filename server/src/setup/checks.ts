/**
 * Startup / readiness checks surfaced by GET /api/system/health and rendered as
 * a "setup needed" screen by the GUI. Nothing here mutates the system.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { publicConfig, type RuntimeConfig } from '../config.js';

const execFileAsync = promisify(execFile);

export type CheckStatus = 'ok' | 'warn' | 'missing';

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
  hint?: string;
}

export interface HealthReport {
  ok: boolean;
  checks: HealthCheck[];
  checkedAt: string;
  config: ReturnType<typeof publicConfig>;
}

const REQUIRED_FREE_BYTES = 3 * 1024 ** 3;

async function commandVersion(
  command: string,
  args: string[],
  timeout = 6000,
): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const output = `${stdout || ''}${stderr || ''}`.trim();
    return output.split(/\r?\n/)[0] ?? '';
  } catch {
    return null;
  }
}

async function findPython(): Promise<string | null> {
  for (const candidate of ['python', 'python3', 'py']) {
    const version = await commandVersion(candidate, ['--version']);
    if (version) return `${candidate}: ${version}`;
  }
  return null;
}

async function checkDisk(target: string): Promise<{ freeBytes: number | null; error?: string }> {
  try {
    await fs.mkdir(target, { recursive: true });
    const stats = await fs.statfs(target);
    const blockSize = Number(stats.bsize);
    const available = Number(stats.bavail);
    if (!Number.isFinite(blockSize) || !Number.isFinite(available) || available <= 0) {
      return { freeBytes: null };
    }
    return { freeBytes: blockSize * available };
  } catch (error) {
    return { freeBytes: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export async function runHealthChecks(config: RuntimeConfig): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    id: 'node',
    label: 'Node.js 20+',
    status: nodeMajor >= 20 ? 'ok' : 'missing',
    required: true,
    detail: `v${process.versions.node}`,
    hint: nodeMajor >= 20 ? undefined : 'Install Node.js 20 or newer from nodejs.org.',
  });

  const ffmpegVersion = await commandVersion('ffmpeg', ['-version']);
  checks.push({
    id: 'ffmpeg',
    label: 'ffmpeg',
    status: ffmpegVersion ? 'ok' : 'missing',
    required: true,
    detail: ffmpegVersion ?? 'not found on PATH',
    hint: ffmpegVersion
      ? undefined
      : 'Install ffmpeg and add it to PATH (Windows: winget install Gyan.FFmpeg; macOS: brew install ffmpeg; Linux: apt install ffmpeg).',
  });

  const pythonNeeded = config.ttsProvider === 'kokoro' || config.ttsProvider === 'piper';
  const python = pythonNeeded ? await findPython() : null;
  checks.push({
    id: 'python',
    label: `Python${pythonNeeded ? '' : ' (not needed for this TTS)'}`,
    status: pythonNeeded ? (python ? 'ok' : 'missing') : 'ok',
    required: pythonNeeded,
    detail: pythonNeeded ? (python ?? 'not found on PATH') : `TTS provider "${config.ttsProvider}" does not use Python`,
    hint:
      pythonNeeded && !python
        ? 'Install Python 3.9+ (Windows: python.org; macOS: brew install python; Linux: apt install python3). Only needed for local Kokoro/Piper TTS.'
        : undefined,
  });

  const disk = await checkDisk(config.jobsDir);
  const diskStatus: CheckStatus =
    disk.freeBytes === null ? 'warn' : disk.freeBytes >= REQUIRED_FREE_BYTES ? 'ok' : 'missing';
  checks.push({
    id: 'disk',
    label: 'Free disk space (3 GB)',
    status: diskStatus,
    required: true,
    detail:
      disk.freeBytes === null
        ? `could not determine free space at ${config.jobsDir}${disk.error ? ` (${disk.error})` : ''}`
        : `${formatBytes(disk.freeBytes)} free in ${config.jobsDir}`,
    hint:
      diskStatus === 'missing'
        ? 'Rendering needs at least 3 GB free. Free space or set JOBS_DIR to another drive.'
        : undefined,
  });

  const audioEntries = await fs
    .readdir(config.assetsAudioDir, { withFileTypes: true })
    .catch(() => []);
  const audioFiles = audioEntries.filter(
    (entry) => entry.isFile() && /\.(mp3|wav|ogg|m4a|flac)$/i.test(entry.name),
  );
  checks.push({
    id: 'audio-library',
    label: 'Royalty-free audio library',
    status: audioFiles.length > 0 ? 'ok' : 'warn',
    required: false,
    detail:
      audioFiles.length > 0
        ? `${audioFiles.length} track(s) in assets/audio`
        : 'assets/audio is empty — add tagged tracks before Stage 7',
    hint: 'Stage 7 picks music by mood/bpm from assets/audio. Not needed for Stage 1.',
  });

  checks.push({
    id: 'deepseek',
    label: 'DeepSeek API',
    status: 'ok',
    required: false,
    detail: config.mockMode
      ? 'Mock mode — canned responses, no key required'
      : `Live model ${config.model}${config.visionEnabled ? ' with vision QA' : ''}`,
    hint: config.mockMode
      ? 'Set DEEPSEEK_API_KEY in .env (or Settings) to use real reasoning.'
      : undefined,
  });

  const ok = checks.filter((check) => check.required).every((check) => check.status !== 'missing');
  return { ok, checks, checkedAt: new Date().toISOString(), config: publicConfig(config) };
}

export function formatHealthReport(report: HealthReport): string {
  const icon = (status: CheckStatus) => (status === 'ok' ? '[ok]  ' : status === 'warn' ? '[warn]' : '[MISS]');
  const lines = report.checks.map(
    (check) => `  ${icon(check.status)} ${check.label} — ${check.detail}`,
  );
  lines.push(
    report.ok
      ? '  Setup complete.'
      : '  Setup needed: fix the [MISS] items above, then restart. The GUI shows the same checklist.',
  );
  return `ShortForge readiness:\n${lines.join('\n')}`;
}

