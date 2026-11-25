import type { Config } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { MockProvider } from './mock.js';
import type { LlmProvider } from './provider.js';

export type { LlmProvider, ProviderName } from './provider.js';
export { AnthropicProvider, mapProviderError } from './anthropic.js';
export { MockProvider } from './mock.js';

/** Anthropic when an API key is configured, otherwise the offline rule-based mock. */
export function createProvider(config: Pick<Config, 'anthropicApiKey' | 'anthropicModel'>): LlmProvider {
  return config.anthropicApiKey
    ? new AnthropicProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel })
    : new MockProvider();
}
