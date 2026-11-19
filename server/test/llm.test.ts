import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  LlmClient,
  LlmTransportError,
  LlmValidationError,
  extractJson,
} from '../src/llm.js';
import { makeTempDir, testRuntimeConfig } from './helpers.js';

const schema = z.object({ message: z.string(), mode: z.string() });
const schemaName = 'test.reply';

interface CapturedRequest {
  url: string;
  body: {
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    response_format?: { type?: string };
  };
}

function fakeResponse(content: string, status = 200, usage = { prompt_tokens: 100, completion_tokens: 40 }) {
  const payload =
    status === 200
      ? { choices: [{ message: { content } }], usage }
      : { error: { message: 'upstream failure' } };
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function makeClient(
  responses: Array<ReturnType<typeof fakeResponse>>,
  options: { jobsDir: string; apiKey?: string },
) {
  const requests: CapturedRequest[] = [];
  const usages: Array<{ usage: { inputTokens: number; outputTokens: number }; usd: number }> = [];
  const queue = [...responses];

  const fetchImpl = vi.fn(async (url: unknown, init?: { body?: string }) => {
    requests.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') as CapturedRequest['body'] });
    const next = queue.shift();
    if (!next) throw new Error('No more fake responses queued');
    return next;
  });

  const config = {
    ...testRuntimeConfig(options.jobsDir),
    apiKey: options.apiKey ?? 'sk-test-abcd1234efgh',
  };

  const client = new LlmClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    config: () => config,
    mockMode: () => false,
    sleep: async () => undefined,
    onUsage: (_jobId, usage, usd) => {
      usages.push({ usage, usd });
    },
  });

  return { client, requests, usages, fetchImpl };
}

function baseOptions(prompt = 'Give me a reply.') {
  return {
    task: 'test.reply',
    stage: 3,
    jobId: '20260101-000000-test-abc1',
    system: 'You reply with a message and mode.',
    prompt,
    schema,
    schemaName,
    jsonHint: '{"message": string, "mode": string}',
  };
}

describe('llm module', () => {
  it('retries after schema failure and feeds the validation error back', async () => {
    const jobsDir = await makeTempDir();
    const { client, requests, usages } = makeClient(
      [fakeResponse('{"message":"pong","mode":7}'), fakeResponse('{"message":"pong","mode":"live"}')],
      { jobsDir },
    );

    const result = await client.call(baseOptions());

    expect(result.data).toEqual({ message: 'pong', mode: 'live' });
    expect(result.attempts).toBe(2);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body.response_format).toEqual({ type: 'json_object' });

    const retryMessages = requests[1]?.body.messages ?? [];
    const feedback = retryMessages.at(-1);
    expect(feedback?.role).toBe('user');
    expect(String(feedback?.content)).toContain('did not validate against the schema');
    expect(String(feedback?.content)).toContain('mode');
    expect(usages[0]?.usd).toBeGreaterThan(0);

    const log = await fs.readFile(
      path.join(jobsDir, '20260101-000000-test-abc1', 'llm-log.jsonl'),
      'utf8',
    );
    const entries = log.trim().split('\n').map((line) => JSON.parse(line) as { ok: boolean });
    expect(entries).toHaveLength(2);
    expect(entries[0]?.ok).toBe(false);
    expect(entries[1]?.ok).toBe(true);
  });

  it('gives up after three attempts and reports every validation issue', async () => {
    const jobsDir = await makeTempDir();
    const { client, fetchImpl } = makeClient(
      [fakeResponse('{"message":1}'), fakeResponse('not json at all'), fakeResponse('{"mode":"x"}')],
      { jobsDir },
    );

    await expect(client.call(baseOptions())).rejects.toBeInstanceOf(LlmValidationError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('redacts API keys in prompts and responses on disk', async () => {
    const jobsDir = await makeTempDir();
    const secret = 'sk-live-super-secret-key-999';
    const { client } = makeClient(
      [fakeResponse('{"message":"the key is sk-abcdefghijkl","mode":"live"}')],
      { jobsDir, apiKey: secret },
    );

    await client.call(baseOptions(`Use my key ${secret} to authenticate. Then echo it.`));

    const log = await fs.readFile(
      path.join(jobsDir, '20260101-000000-test-abc1', 'llm-log.jsonl'),
      'utf8',
    );
    expect(log).not.toContain(secret);
    expect(log).not.toContain('sk-abcdefghijkl');
    expect(log).toContain('[redacted');

    const stageLog = await fs.readFile(
      path.join(jobsDir, '20260101-000000-test-abc1', 'logs', 'stage-3.log'),
      'utf8',
    );
    expect(stageLog).not.toContain(secret);
    expect(stageLog).toContain('tokens_in=');
  });

  it('does not retry auth failures and surfaces the provider message', async () => {
    const jobsDir = await makeTempDir();
    const { client, fetchImpl } = makeClient([fakeResponse('', 401)], { jobsDir });

    const error = await client.call(baseOptions()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmTransportError);
    expect((error as LlmTransportError).status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx responses and succeeds', async () => {
    const jobsDir = await makeTempDir();
    const { client, fetchImpl } = makeClient(
      [fakeResponse('', 503), fakeResponse('{"message":"after retry","mode":"live"}')],
      { jobsDir },
    );

    const result = await client.call(baseOptions());
    expect(result.data.message).toBe('after retry');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns the canned fixture in mock mode without calling the network', async () => {
    const jobsDir = await makeTempDir();
    const mockSchema = z.object({ message: z.string(), mode: z.string() });
    const fetchImpl = vi.fn();
    const client = new LlmClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      config: () => testRuntimeConfig(jobsDir),
      mockMode: () => true,
    });

    const result = await client.call({
      ...baseOptions(),
      task: 'demo.ping',
      schema: mockSchema,
      schemaName: 'demo.ping',
    });

    expect(result.mock).toBe(true);
    expect(result.data).toEqual({ message: 'pong', mode: 'mock' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to send images when vision is off', async () => {
    const jobsDir = await makeTempDir();
    const { client } = makeClient([fakeResponse('{"message":"x","mode":"y"}')], { jobsDir });

    const error = await client
      .call({ ...baseOptions(), images: ['data:image/png;base64,AAAA'] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('DEEPSEEK_VISION');
  });

  it('extracts JSON from fenced replies', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":[1,2]} hope that helps')).toEqual({ a: [1, 2] });
    expect(() => extractJson('no json here')).toThrow();
  });
});
