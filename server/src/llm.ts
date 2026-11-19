/**
 * The ONLY module that talks to DeepSeek.
 *
 * Responsibilities, all in one place:
 *  - JSON-mode chat completions against the OpenAI-compatible endpoint
 *  - zod validation of every response, with the validation error fed back to
 *    the model on retry (max 3 attempts total)
 *  - per-attempt logging (prompt + response, keys redacted) to
 *    jobs/<id>/llm-log.jsonl and jobs/<id>/logs/stage-<n>.log
 *  - token + USD accounting, reported to the job via `onUsage`
 *  - mock mode backed by server/src/mock/fixtures.ts
 *  - an optional image content path for vision QA (DEEPSEEK_VISION=on)
 *
 * API keys are read from config on the server only. Nothing in this module is
 * imported by /web.
 */
import { z } from 'zod';
import { getConfig, type RuntimeConfig } from './config.js';
import { costForUsage, estimateUsage, pricingFor, type LlmUsage } from './cost.js';
import {
  appendLlmLog,
  appendStageLog,
  redact,
  registerSecrets,
  type LlmLogEntry,
} from './logger.js';
import { resolveMockResponse } from './mock/fixtures.js';

export const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 180_000;
const REQUEST_LOG_MAX = 40_000;

export type LlmErrorKind = 'config' | 'transport' | 'validation' | 'mock' | 'aborted';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmValidationError extends LlmError {
  constructor(
    readonly schemaName: string,
    readonly issues: string[],
    readonly lastRaw: string,
    readonly attempts: number,
  ) {
    super(
      'validation',
      `DeepSeek response failed schema "${schemaName}" after ${attempts} attempts:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    );
    this.name = 'LlmValidationError';
  }
}

export class LlmTransportError extends LlmError {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly attempts: number,
  ) {
    super('transport', message);
    this.name = 'LlmTransportError';
  }
}

export interface LlmCallOptions<T> {
  /** Stable tag used for logging and mock fixtures, e.g. "research.queries". */
  task: string;
  /** Pipeline stage number (1-10). */
  stage: number;
  jobId?: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  /** Human-readable description of the required JSON shape. */
  jsonHint?: string;
  /** Data URLs for vision calls. Requires DEEPSEEK_VISION=on. */
  images?: string[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LlmResult<T> {
  data: T;
  attempts: number;
  usage: LlmUsage;
  costUsd: number;
  model: string;
  mock: boolean;
  requestId: string;
}

export interface LlmClientDeps {
  fetchImpl?: typeof fetch;
  config?: () => RuntimeConfig;
  mockMode?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onUsage?: (jobId: string, usage: LlmUsage, costUsd: number, model: string) => Promise<void> | void;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; type?: string };
}

function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schemaDocumentation<T>(schema: z.ZodType<T>): string {
  const candidate = (z as unknown as { toJSONSchema?: (value: unknown) => unknown }).toJSONSchema;
  if (typeof candidate === 'function') {
    try {
      return JSON.stringify(candidate(schema), null, 2);
    } catch {
      /* fall through to prose hint */
    }
  }
  return '(see the field description in the instructions)';
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const at = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${at}: ${issue.message}`;
  });
}

/** Extract the first JSON object/array from a model reply (tolerates fences). */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstObject = candidate.indexOf('{');
  const firstArray = candidate.indexOf('[');
  let start = -1;
  if (firstObject === -1) start = firstArray;
  else if (firstArray === -1) start = firstObject;
  else start = Math.min(firstObject, firstArray);

  if (start === -1) throw new Error('Response contained no JSON object or array.');

  const opener = candidate[start];
  const closer = opener === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(closer);
  if (end <= start) throw new Error('Response JSON was not terminated.');

  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export class LlmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly config: () => RuntimeConfig;
  private readonly mockMode: () => boolean;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onUsage: NonNullable<LlmClientDeps['onUsage']>;

  constructor(deps: LlmClientDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.config = deps.config ?? getConfig;
    this.mockMode = deps.mockMode ?? (() => getConfig().mockMode);
    this.sleep = deps.sleep ?? sleepDefault;
    this.now = deps.now ?? (() => Date.now());
    this.onUsage = deps.onUsage ?? (() => undefined);
  }

  async call<T>(options: LlmCallOptions<T>): Promise<LlmResult<T>> {
    if (options.signal?.aborted) throw new LlmError('aborted', 'LLM call aborted before start.');

    const config = this.config();
    const model = options.model ?? config.model;
    const requestId = newRequestId();

    if (this.mockMode()) return this.callMock(options, config, model, requestId);
    if (!config.apiKey) {
      throw new LlmError(
        'config',
        'No DeepSeek API key. Set DEEPSEEK_API_KEY in .env (or in Settings), or enable mock mode.',
      );
    }
    registerSecrets([config.apiKey]);

    const useVision = Boolean(options.images && options.images.length > 0);
    if (useVision && !config.visionEnabled) {
      throw new LlmError(
        'config',
        'Images were supplied but DEEPSEEK_VISION is off. Set DEEPSEEK_VISION=on to use the vision pass.',
      );
    }

    const baseMessages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt(options) },
      { role: 'user', content: this.userContent(options, useVision) },
    ];

    let lastRaw = '';
    let lastIssues: string[] = [];
    let lastTransport: string | undefined;
    let lastStatus: number | undefined;
    let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    let totalCost = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (options.signal?.aborted) throw new LlmError('aborted', 'LLM call aborted by caller.');

      const messages: ChatMessage[] = [...baseMessages];
      if (attempt > 1 && lastRaw) {
        messages.push({ role: 'assistant', content: lastRaw });
        messages.push({
          role: 'user',
          content: this.retryFeedback(options.schemaName, lastIssues, lastRaw),
        });
      }

      const requestBody = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        response_format: { type: 'json_object' as const },
        stream: false,
      };

      const started = this.now();
      let response: Response;
      try {
        const controller = this.timeoutController(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        try {
          response = await this.fetchImpl(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } finally {
          controller.cleanup();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastTransport = `Network error calling DeepSeek: ${message}`;
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
          request: requestBody,
          error: lastTransport,
        });
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        break;
      }

      const rawText = await response.text();

      if (!response.ok) {
        const detail = this.describeHttpError(response.status, rawText);
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
          request: requestBody,
          response: rawText,
          error: detail,
        });
        const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        lastStatus = response.status;
        lastTransport = detail;
        if (retryable && attempt < MAX_ATTEMPTS) {
          await this.sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw new LlmTransportError(detail, response.status, attempt);
      }

      let parsedResponse: ChatCompletionResponse;
      try {
        parsedResponse = JSON.parse(rawText) as ChatCompletionResponse;
      } catch {
        lastIssues = ['The API returned a non-JSON envelope.'];
        lastRaw = rawText.slice(0, 4000);
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
          request: requestBody,
          response: rawText,
          error: 'Non-JSON API envelope',
        });
        if (attempt < MAX_ATTEMPTS) continue;
        break;
      }

      const attemptUsage: LlmUsage = {
        inputTokens: parsedResponse.usage?.prompt_tokens ?? 0,
        outputTokens: parsedResponse.usage?.completion_tokens ?? 0,
      };
      usage = {
        inputTokens: usage.inputTokens + attemptUsage.inputTokens,
        outputTokens: usage.outputTokens + attemptUsage.outputTokens,
      };
      const attemptCost = costForUsage(model, attemptUsage);
      totalCost += attemptCost;

      const content = parsedResponse.choices?.[0]?.message?.content ?? '';
      lastRaw = typeof content === 'string' ? content : '';

      if (!lastRaw.trim()) {
        lastIssues = ['The reply was empty.'];
        const detail = parsedResponse.error?.message ?? 'Empty completion content';
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: attemptUsage,
          costUsd: attemptCost,
          request: requestBody,
          response: rawText,
          error: detail,
        });
        if (attempt < MAX_ATTEMPTS) continue;
        break;
      }

      let candidate: unknown;
      try {
        candidate = extractJson(lastRaw);
      } catch (error) {
        lastIssues = [error instanceof Error ? error.message : String(error)];
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: attemptUsage,
          costUsd: attemptCost,
          request: requestBody,
          response: lastRaw,
          error: `JSON parse failed: ${lastIssues.join('; ')}`,
        });
        if (attempt < MAX_ATTEMPTS) continue;
        break;
      }

      const validated = options.schema.safeParse(candidate);
      if (!validated.success) {
        lastIssues = issuesOf(validated.error);
        await this.log({
          jobsDir: config.jobsDir,
          options,
          config,
          model,
          requestId,
          attempt,
          ok: false,
          mock: false,
          durationMs: this.now() - started,
          usage: attemptUsage,
          costUsd: attemptCost,
          request: requestBody,
          response: lastRaw,
          error: `Schema validation failed: ${lastIssues.join('; ')}`,
        });
        if (attempt < MAX_ATTEMPTS) continue;
        break;
      }

      await this.log({
        jobsDir: config.jobsDir,
        options,
        config,
        model,
        requestId,
        attempt,
        ok: true,
        mock: false,
        durationMs: this.now() - started,
        usage: attemptUsage,
        costUsd: attemptCost,
        request: requestBody,
        response: lastRaw,
      });
      await this.reportUsage(options.jobId, usage, totalCost, model);

      return {
        data: validated.data,
        attempts: attempt,
        usage,
        costUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
        model,
        mock: false,
        requestId,
      };
    }

    if (lastIssues.length > 0) {
      throw new LlmValidationError(options.schemaName, lastIssues, lastRaw, MAX_ATTEMPTS);
    }
    throw new LlmTransportError(
      lastTransport ?? 'DeepSeek request failed for an unknown reason.',
      lastStatus,
      MAX_ATTEMPTS,
    );
  }

  private async callMock<T>(
    options: LlmCallOptions<T>,
    config: RuntimeConfig,
    model: string,
    requestId: string,
  ): Promise<LlmResult<T>> {
    const fixture = resolveMockResponse(options.task);
    const validated = options.schema.safeParse(fixture);
    if (!validated.success) {
      throw new LlmValidationError(
        options.schemaName,
        [...issuesOf(validated.error), 'The canned mock fixture is invalid — fix server/src/mock/fixtures.ts.'],
        JSON.stringify(fixture, null, 2),
        1,
      );
    }

    const usage = estimateUsage(options.system, options.prompt, JSON.stringify(fixture));
    const costUsd = costForUsage(model, usage);
    const serializedFixture = JSON.stringify(fixture);

    await this.log({
      jobsDir: config.jobsDir,
      options,
      config,
      model,
      requestId,
      attempt: 1,
      ok: true,
      mock: true,
      durationMs: 0,
      usage,
      costUsd,
      request: { mock: true, task: options.task, prompt: options.prompt },
      response: serializedFixture,
    });
    await this.reportUsage(options.jobId, usage, costUsd, model);

    return {
      data: validated.data,
      attempts: 1,
      usage,
      costUsd,
      model,
      mock: true,
      requestId,
    };
  }

  private systemPrompt<T>(options: LlmCallOptions<T>): string {
    const parts = [
      'You are a deterministic reasoning component inside ShortForge, a local animated-short generator.',
      options.system.trim(),
      '',
      `You must respond with a single JSON object that validates against the schema "${options.schemaName}".`,
      'No markdown fences. No commentary. No trailing text. Use snake_case keys exactly as specified.',
      'Never invent facts beyond the supplied material. If the schema asks for an id, reuse supplied ids verbatim.',
    ];
    if (options.jsonHint) parts.push('', 'Expected shape:', options.jsonHint.trim());
    parts.push('', 'JSON Schema:', schemaDocumentation(options.schema));
    return parts.join('\n');
  }

  private userContent<T>(
    options: LlmCallOptions<T>,
    useVision: boolean,
  ): string | Array<Record<string, unknown>> {
    if (!useVision) return options.prompt;
    return [
      { type: 'text', text: options.prompt },
      ...(options.images ?? []).map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
  }

  private retryFeedback(schemaName: string, issues: string[], lastRaw: string): string {
    return [
      `Your previous reply did not validate against the schema "${schemaName}".`,
      'Validation errors:',
      ...issues.map((issue) => `- ${issue}`),
      '',
      'Previous reply (truncated):',
      truncateForFeedback(lastRaw, 4000),
      '',
      'Return ONLY a corrected JSON object. Follow the schema exactly.',
    ].join('\n');
  }

  private describeHttpError(status: number, body: string): string {
    let detail = '';
    try {
      const parsed = JSON.parse(body) as ChatCompletionResponse;
      detail = parsed.error?.message ?? '';
    } catch {
      detail = body.slice(0, 300);
    }
    const hint =
      status === 401 || status === 403
        ? ' Check DEEPSEEK_API_KEY.'
        : status === 402
          ? ' The DeepSeek account has no remaining credit.'
          : status === 429
            ? ' Rate limited — retrying.'
            : '';
    return `DeepSeek HTTP ${status}${detail ? `: ${detail}` : ''}.${hint} (${status === 402 ? 'billing' : 'http'})`;
  }

  private timeoutController(
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('LLM request timed out')), timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      },
    };
  }

  private async reportUsage(
    jobId: string | undefined,
    usage: LlmUsage,
    costUsd: number,
    model: string,
  ): Promise<void> {
    if (!jobId) return;
    try {
      await this.onUsage(jobId, usage, costUsd, model);
    } catch (error) {
      console.warn(`Failed to record LLM usage for job ${jobId}: ${String(error)}`);
    }
  }

  private async log(args: {
    jobsDir: string;
    options: LlmCallOptions<unknown>;
    config: RuntimeConfig;
    model: string;
    requestId: string;
    attempt: number;
    ok: boolean;
    mock: boolean;
    durationMs: number;
    usage: LlmUsage;
    costUsd: number;
    request?: unknown;
    response?: unknown;
    error?: string;
  }): Promise<void> {
    const entry: LlmLogEntry = {
      requestId: args.requestId,
      task: args.options.task,
      stage: args.options.stage,
      model: args.model,
      attempt: args.attempt,
      ok: args.ok,
      mock: args.mock,
      durationMs: args.durationMs,
      usage: args.usage,
      costUsd: args.costUsd,
      request: args.request,
      response: args.response,
      error: args.error,
    };

    try {
      await appendLlmLog(args.jobsDir, args.options.jobId, entry);
    } catch (error) {
      console.warn(`Could not write LLM log: ${String(error)}`);
    }

    if (!args.options.jobId) return;
    const status = args.ok ? 'ok' : `FAILED (${args.error ?? 'unknown'})`;
    const summary = [
      `task=${args.options.task}`,
      `attempt=${args.attempt}/${MAX_ATTEMPTS}`,
      `model=${args.model}`,
      `status=${status}`,
      args.mock ? 'mock=true' : null,
      `tokens_in=${args.usage.inputTokens}`,
      `tokens_out=${args.usage.outputTokens}`,
      `cost_usd=${args.costUsd}`,
      `pricing_in=${pricingFor(args.model).inputPerMillionUsd}/M`,
      `duration_ms=${args.durationMs}`,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      await appendStageLog(args.jobsDir, args.options.jobId, args.options.stage, 'llm', summary);
      if (args.options.jobId && args.request) {
        await appendStageLog(
          args.jobsDir,
          args.options.jobId,
          args.options.stage,
          'llm.request',
          `request_id=${args.requestId} ${redact(args.request, REQUEST_LOG_MAX)}`,
        );
      }
      if (args.options.jobId && args.response !== undefined) {
        await appendStageLog(
          args.jobsDir,
          args.options.jobId,
          args.options.stage,
          'llm.response',
          `request_id=${args.requestId} ${redact(args.response, REQUEST_LOG_MAX)}`,
        );
      }
    } catch (error) {
      console.warn(`Could not write stage log: ${String(error)}`);
    }
  }
}

function truncateForFeedback(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Module-level client used by pipeline stages.
// ---------------------------------------------------------------------------

let defaultClient = new LlmClient();

/** Wire per-job usage accounting (called once at server startup). */
export function configureLlmClient(deps: LlmClientDeps): void {
  defaultClient = new LlmClient(deps);
}

export function callLlm<T>(options: LlmCallOptions<T>): Promise<LlmResult<T>> {
  return defaultClient.call(options);
}
