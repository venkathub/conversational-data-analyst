import type { AskFailure, AskResponse } from '@cda/shared';

/** Failure that happens before a structured API response exists (offline, proxy error, non-JSON reply). */
export interface NetworkFailure {
  ok: false;
  error: { code: 'NETWORK_ERROR'; message: string; suggestions?: undefined };
}

export type ClientResponse = AskResponse | NetworkFailure;
export type ClientFailure = AskFailure | NetworkFailure;

const network = (message: string): NetworkFailure => ({ ok: false, error: { code: 'NETWORK_ERROR', message } });

function isAskResponse(value: unknown): value is AskResponse {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof (value as { ok: unknown }).ok === 'boolean';
}

export async function askQuestion(question: string, signal?: AbortSignal): Promise<ClientResponse> {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (isAskResponse(body)) return body;
    return network('The server sent an unexpected response. Please try again.');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return network("Couldn't reach the server. Check that the API is running and try again.");
  }
}
