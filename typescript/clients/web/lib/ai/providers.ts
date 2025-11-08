import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { xai } from '@ai-sdk/xai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.mock';

// OpenAI-compatible provider configuration
// You can switch between different providers by changing baseURL and apiKey:
// - OpenAI: baseURL: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY
// - OpenRouter: baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY
// - Together AI: baseURL: 'https://api.together.xyz/v1', apiKey: process.env.TOGETHER_API_KEY
// - Fireworks: baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: process.env.FIREWORKS_API_KEY
// - Groq: baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY

const openAICompatible = createOpenAICompatible({
  name: 'openai-compatible',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY || process.env.DEFAULT_API_KEY,
});

// Model configuration from environment variables with defaults
const CHAT_MODEL = process.env.OPENAI_MODEL || 'big-pickle';
const CHAT_MODEL_MEDIUM = process.env.OPENAI_MODEL || 'gpt-4o';
const TITLE_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ARTIFACT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const openRouterProvider: any = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        // Using OpenAI-compatible models (configurable via environment variables)
        // For OpenAI: 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'
        // For Together AI: 'meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'
        // For OpenRouter: 'google/gemini-2.0-flash-exp', 'anthropic/claude-3.5-sonnet'
        'chat-model': openAICompatible(CHAT_MODEL) as any,
        'chat-model-medium': openAICompatible(CHAT_MODEL_MEDIUM) as any,
        'title-model': openAICompatible(TITLE_MODEL) as any,
        'artifact-model': openAICompatible(ARTIFACT_MODEL) as any,
      },
      imageModels: {
        'small-model': xai.image('grok-2-image') as any,
      },
    });

export const grokProvider: any = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
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
