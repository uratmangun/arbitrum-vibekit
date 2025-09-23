// Test-only file that sets up mock providers
// This file should only be imported in test setup files
import { customProvider } from 'ai';
import { chatModel, reasoningModel, titleModel, artifactModel } from './models.mock';

export const mockOpenRouterProvider = customProvider({
    languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
    },
});

export const mockGrokProvider = customProvider({
    languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
    },
});

