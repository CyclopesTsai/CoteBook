import type { ApiErrorBody, ErrorCode } from '@cotebook/shared';
import { CLIENT_ID_HEADER } from '@cotebook/shared';

/** Random id for this browser tab, used to ignore sync events we caused ourselves. */
export const clientId =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'network_error',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Json = Record<string, unknown> | unknown[];

export async function api<T>(
  path: string,
  init: { method?: string; body?: Json | FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { [CLIENT_ID_HEADER]: clientId };
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: init.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Network error');
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'internal_error',
      e?.message ?? res.statusText,
      e?.details,
    );
  }
  return data as T;
}
