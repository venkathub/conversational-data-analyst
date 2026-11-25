export type ProviderName = 'mock' | 'anthropic';

/**
 * Turns a question into a JSON query plan. The result is UNTRUSTED (`unknown`):
 * callers must run it through parseLlmPlan() and validatePlan() before use.
 * Providers never produce SQL.
 */
export interface LlmProvider {
  readonly name: ProviderName;
  planQuery(question: string): Promise<unknown>;
}
