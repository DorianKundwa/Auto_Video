/**
 * Logging + redaction.
 *
 * Every stage logs to `jobs/<id>/logs/stage-<n>.log`. Every LLM exchange is
 * additionally appended as one JSON line to `jobs/<id>/llm-log.jsonl`.
 * All text passes through `redact()` so API keys and bearer tokens never land
 * on disk or in the GUI log drawer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const knownSecrets = new Set<string>();

export function registerSecrets(values: Array<string | undefined>): void {
  for (const value of values) {
    if (value && value.length >= 8) knownSecrets.add(value);
  }
}

const MAX_LOG_CHARS = 200_000;

export function truncate(text: string, max = 20_000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export function redact(input: unknown, max = 20_000): string {
  let text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  if (typeof text !== 'string') text = String(input);

  for (const secret of knownSecrets) {
    if (secret.length >= 8) text = text.split(secret).join('[redacted]');
  }

  text = text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, '[redacted:key]')
    .replace(/tvly-[A-Za-z0-9_-]{6,}/g, '[redacted:key]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/(access[_-]?token|api[_-]?key|authorization)("?\s*[:=]\s*"?)([^"\s,}]{6,})/gi, '$1$2[redacted]');

  return truncate(text, max);
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function formatLogLine(scope: string, message: string): string {
  return `[${timestamp()}] [${scope}] ${redact(message)}`;
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let text = line.endsWith('\n') ? line : `${line}\n`;
  if (text.length > MAX_LOG_CHARS) text = `${text.slice(0, MAX_LOG_CHARS)}…[line truncated]\n`;
  await fs.appendFile(filePath, text, 'utf8');
}

export function jobLogPath(jobsDir: string, jobId: string, stage: number): string {
  return path.join(jobsDir, jobId, 'logs', `stage-${stage}.log`);
}

export function jobLlmLogPath(jobsDir: string, jobId: string): string {
  return path.join(jobsDir, jobId, 'llm-log.jsonl');
}

export interface LlmLogEntry {
  requestId: string;
  task: string;
  stage: number;
  model: string;
  attempt: number;
  ok: boolean;
  mock: boolean;
  durationMs: number;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}

export async function appendLlmLog(
  jobsDir: string,
  jobId: string | undefined,
  entry: LlmLogEntry,
): Promise<void> {
  const file = jobId
    ? jobLlmLogPath(jobsDir, jobId)
    : path.join(jobsDir, '_global', 'llm-log.jsonl');
  await appendLine(file, JSON.stringify({ at: timestamp(), ...entry, request: entry.request ? redact(entry.request, 40_000) : undefined, response: entry.response ? redact(entry.response, 40_000) : undefined }));
}

export async function appendStageLog(
  jobsDir: string,
  jobId: string,
  stage: number,
  scope: string,
  message: string,
): Promise<void> {
  await appendLine(jobLogPath(jobsDir, jobId, stage), formatLogLine(scope, message));
}

export async function readJobLogs(jobsDir: string, jobId: string, stage?: number): Promise<string> {
  const dir = path.join(jobsDir, jobId, 'logs');
  try {
    if (stage !== undefined) {
      return await fs.readFile(jobLogPath(jobsDir, jobId, stage), 'utf8');
    }
    const files = (await fs.readdir(dir)).filter((name) => name.startsWith('stage-') && name.endsWith('.log'));
    files.sort();
    const parts = await Promise.all(files.map(async (name) => {
      const text = await fs.readFile(path.join(dir, name), 'utf8');
      return `===== ${name} =====\n${text}`;
    }));
    return parts.join('\n');
  } catch {
    return '';
  }
}
