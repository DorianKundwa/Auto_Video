import type { ApiErrorBody } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function explain(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as ApiErrorBody;
  if (Array.isArray(record.issues) && record.issues.length > 0) {
    return record.issues
      .map((issue) => `${issue.path || 'field'}: ${issue.message}`)
      .join(' · ');
  }
  if (typeof record.error === 'string') return record.error;
  return null;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message = explain(body) ?? `${response.status} ${response.statusText}`;
    throw new ApiError(message, response.status, (body ?? undefined) as ApiErrorBody | undefined);
  }
  return body as T;
}
