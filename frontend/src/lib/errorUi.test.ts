import { ERROR_CODES } from '@cda/shared';
import { describe, expect, it } from 'vitest';
import { presentError } from './errorUi';

describe('presentError', () => {
  it('covers every API error code plus network errors', () => {
    for (const code of [...ERROR_CODES, 'NETWORK_ERROR'] as const) {
      expect(presentError(code).title.length).toBeGreaterThan(0);
    }
  });

  it('offers retry only for transient problems', () => {
    expect(presentError('NETWORK_ERROR').canRetry).toBe(true);
    expect(presentError('PROVIDER_TIMEOUT').canRetry).toBe(true);
    expect(presentError('CANNOT_ANSWER').canRetry).toBe(false);
    expect(presentError('INVALID_REQUEST').canRetry).toBe(false);
  });

  it('suggests example questions when the question was the problem', () => {
    expect(presentError('CANNOT_ANSWER').showSuggestions).toBe(true);
    expect(presentError('INTERNAL').showSuggestions).toBe(false);
  });
});
