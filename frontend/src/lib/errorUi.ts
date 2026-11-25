import type { ErrorCode } from '@cda/shared';

export type UiErrorCode = ErrorCode | 'NETWORK_ERROR';

export interface ErrorPresentation {
  title: string;
  /** Retrying the same question can help (transient problems). */
  canRetry: boolean;
  /** Offer example questions (the question itself was the problem). */
  showSuggestions: boolean;
}

const PRESENTATION: Record<UiErrorCode, ErrorPresentation> = {
  CANNOT_ANSWER: { title: "I couldn't answer that", canRetry: false, showSuggestions: true },
  INVALID_REQUEST: { title: 'Please check your question', canRetry: false, showSuggestions: true },
  NETWORK_ERROR: { title: 'Connection problem', canRetry: true, showSuggestions: false },
  PROVIDER_ERROR: { title: 'The AI service had a problem', canRetry: true, showSuggestions: false },
  PROVIDER_TIMEOUT: { title: 'The AI service timed out', canRetry: true, showSuggestions: false },
  RATE_LIMITED: { title: 'Too many requests', canRetry: true, showSuggestions: false },
  NOT_FOUND: { title: 'Not found', canRetry: false, showSuggestions: false },
  INTERNAL: { title: 'Something went wrong', canRetry: true, showSuggestions: false },
};

export function presentError(code: UiErrorCode): ErrorPresentation {
  return PRESENTATION[code];
}
