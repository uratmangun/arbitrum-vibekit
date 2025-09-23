/**
 * AI Provider Configuration
 *
 * This file contains production AI providers only.
 * For test mocks, see providers.test.ts which is only imported in test setup.
 */
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { xai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Create a dynamic OpenRouter instance with custom API key
export function createOpenRouterWithKey(apiKey?: string | null) {
  const effectiveApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  return createOpenRouter({
    apiKey: effectiveApiKey,
  });
}

// Create a dynamic language model function that handles any OpenRouter model ID
function createDynamicOpenRouterModel(modelId: string, apiKey?: string | null) {
  const router = apiKey ? createOpenRouterWithKey(apiKey) : openRouter;

  // Check if it's a predefined model with special settings
  const predefinedModels: Record<string, any> = {
    'chat-model': router('google/gemini-2.5-pro-preview', {
      reasoning: {
        exclude: true,
        effort: 'low',
      },
    }),
    'chat-model-medium': router('google/gemini-2.5-pro-preview', {
      reasoning: {
        effort: 'medium',
      },
    }),
    'title-model': router('google/gemini-2.5-flash'),
    'artifact-model': router('google/gemini-2.5-flash'),
  };

  // Return predefined model if it exists, otherwise create a new one with the modelId
  return predefinedModels[modelId] || router(modelId);
}

// Production OpenRouter provider
export const openRouterProvider: any = {
  languageModel: (modelId: string, apiKey?: string | null) => createDynamicOpenRouterModel(modelId, apiKey),
  imageModels: {
    'small-model': xai.image('grok-2-image') as any,
  },
};

// Production Grok provider
export const grokProvider: any = customProvider({
  languageModels: {
    'chat-model': xai('grok-2-1212') as any,
    'chat-model-reasoning': wrapLanguageModel({
      model: groq('deepseek-r1-distill-llama-70b') as any,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }) as any,
    'title-model': xai('grok-2-1212') as any,
    'artifact-model': xai('grok-2-1212') as any,
  },
  imageModels: {
    'small-model': xai.image('grok-2-image') as any,
  },
});
