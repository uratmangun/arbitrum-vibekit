import { generateText, streamText } from 'ai';
import { describe, it, expect, beforeAll } from 'vitest';

import { createProviderSelector, DEFAULT_MODELS } from '../../src/ai/providers/index.js';

/**
 * Integration tests for Provider Selector
 * Tests real SDK integration with MSW-mocked HTTP responses
 *
 * MSW handlers intercept HTTP calls and return recorded API responses
 * This validates that:
 * - Provider selectors create working LanguageModel instances
 * - SDKs integrate correctly with Vercel AI SDK
 * - Custom models and default models work as expected
 */
describe('Provider Selector Integration', () => {
  // Test API keys - these trigger SDK initialization but HTTP is mocked by MSW
  const testConfig = {
    openRouterApiKey: 'test-openrouter-key',
    openaiApiKey: 'test-openai-key',
    xaiApiKey: 'test-xai-key',
    hyperbolicApiKey: 'test-hyperbolic-key',
  };

  let selector: ReturnType<typeof createProviderSelector>;

  beforeAll(() => {
    // Given provider selector with all test API keys
    selector = createProviderSelector(testConfig);
  });

  describe('OpenRouter provider', () => {
    // TODO: OpenRouter provider emits reasoning-only chunks in this SDK version.
    // The provider enqueues { type: 'text-delta', delta } instead of textDelta and
    // may only send reasoning chunks depending on upstream routing. Revisit when
    // @openrouter/ai-sdk-provider aligns with ai@5 stream part field names.
    it.skip('should perform streaming inference with default model', async () => {
      // Given OpenRouter provider with default model
      const model = selector.openrouter!();

      // When performing streaming inference (MSW intercepts HTTP, returns streaming-simple.json)
      const result = streamText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then stream should complete successfully
      let fullText = '';
      for await (const part of await result.fullStream) {
        if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
          // Support both legacy provider shape (delta) and AI SDK v2 (textDelta)
          fullText +=
            (part as { textDelta?: string }).textDelta ?? (part as { delta?: string }).delta ?? '';
        }
      }

      // Then text should be generated
      expect(fullText.length).toBeGreaterThan(0);
    });

    it('should perform non-streaming inference with default model', async () => {
      // Given OpenRouter provider with default model
      const model = selector.openrouter!();

      // When performing non-streaming inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should use DEFAULT_MODELS.openrouter when no model specified', () => {
      // Given OpenRouter provider without model parameter
      const model = selector.openrouter!();

      // Then it should use the default model from DEFAULT_MODELS
      expect(model.modelId).toContain(DEFAULT_MODELS.openrouter);
    });

    it('should accept custom model parameter', () => {
      // Given OpenRouter provider with custom model
      const customModel = 'anthropic/claude-opus-4';
      const model = selector.openrouter!(customModel);

      // Then it should use the custom model
      expect(model.modelId).toContain(customModel);
    });
  });

  describe('OpenAI provider', () => {
    it('should perform inference with default model', async () => {
      // Given OpenAI provider with default model
      const model = selector.openai!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello world',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should use DEFAULT_MODELS.openai when no model specified', () => {
      // Given OpenAI provider without model parameter
      const model = selector.openai!();

      // Then it should use the default model from DEFAULT_MODELS
      expect(model.modelId).toContain(DEFAULT_MODELS.openai);
    });

    it('should accept custom model parameter', () => {
      // Given OpenAI provider with custom model
      const customModel = 'gpt-4o';
      const model = selector.openai!(customModel);

      // Then it should use the custom model
      expect(model.modelId).toContain(customModel);
    });
  });

  describe('xAI provider', () => {
    it('should perform inference with default model', async () => {
      // Given xAI provider with default model
      const model = selector.xai!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should use DEFAULT_MODELS.xai when no model specified', () => {
      // Given xAI provider without model parameter
      const model = selector.xai!();

      // Then it should use the default model from DEFAULT_MODELS
      expect(model.modelId).toContain(DEFAULT_MODELS.xai);
    });

    it('should accept custom model parameter', () => {
      // Given xAI provider with custom model
      const customModel = 'grok-4-fast-non-reasoning';
      const model = selector.xai!(customModel);

      // Then it should use the custom model
      expect(model.modelId).toContain(customModel);
    });
  });

  describe.skip('Hyperbolic provider - TODO: wait for Hyperbolic to support AI SDK 5', () => {
    // Hyperbolic is currently disabled pending AI SDK 5 support
    // The @hyperbolic/ai-sdk-provider v0.1.3 implements v1 spec, incompatible with AI SDK 5 (v2)

    it('should perform inference with default model', async () => {
      // Given Hyperbolic provider with default model
      const model = selector.hyperbolic!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should use DEFAULT_MODELS.hyperbolic when no model specified', () => {
      // Given Hyperbolic provider without model parameter
      const model = selector.hyperbolic!();

      // Then it should use the default model from DEFAULT_MODELS
      expect(model.modelId).toContain(DEFAULT_MODELS.hyperbolic);
    });

    it('should accept custom model parameter', () => {
      // Given Hyperbolic provider with custom model
      const customModel = 'Qwen/Qwen2.5-72B-Instruct';
      const model = selector.hyperbolic!(customModel);

      // Then it should use the custom model
      expect(model.modelId).toContain(customModel);
    });
  });

  describe('SDK compatibility', () => {
    it('should return LanguageModel interface for all providers', () => {
      // Given available provider functions (Hyperbolic disabled)
      const openrouterModel = selector.openrouter!();
      const openaiModel = selector.openai!();
      const xaiModel = selector.xai!();

      // Then all should have LanguageModel interface properties
      expect(openrouterModel).toHaveProperty('modelId');
      expect(openaiModel).toHaveProperty('modelId');
      expect(xaiModel).toHaveProperty('modelId');
    });

    it('should work with Vercel AI SDK generateText', async () => {
      // Given any provider model
      const model = selector.openrouter!();

      // When using with Vercel AI SDK
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then it should work without type errors or runtime errors
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle provider initialization without API keys', () => {
      // Given empty configuration
      const emptySelector = createProviderSelector({});

      // Then no providers should be available
      expect(emptySelector.openrouter).toBeUndefined();
      expect(emptySelector.openai).toBeUndefined();
      expect(emptySelector.xai).toBeUndefined();
      expect(emptySelector.hyperbolic).toBeUndefined();
    });

    it('should handle partial provider configuration', () => {
      // Given configuration with only some providers
      const partialSelector = createProviderSelector({
        openRouterApiKey: 'test-key',
        xaiApiKey: 'test-key',
      });

      // Then only configured providers should be available
      expect(partialSelector.openrouter).toBeDefined();
      expect(partialSelector.openai).toBeUndefined();
      expect(partialSelector.xai).toBeDefined();
      expect(partialSelector.hyperbolic).toBeUndefined();
    });
  });
});
