'use server';

import { generateText, type UIMessage as Message } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { cookies } from 'next/headers';

import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function saveChatAgentAsCookie(agent: string) {
  const cookieStore = await cookies();
  cookieStore.set('agent', agent);
}

export async function generateTitleFromUserMessage({
  message,
  selectedModel,
  apiBaseUrl,
  apiKey,
}: {
  message: Message;
  selectedModel?: string;
  apiBaseUrl?: string;
  apiKey?: string | null;
}) {
  // Use environment defaults
  const effectiveApiBaseUrl = apiBaseUrl ?? process.env.DEFAULT_API_BASE_URL;
  const effectiveApiKey = apiKey ?? process.env.DEFAULT_API_KEY ?? undefined;
  const effectiveModel = selectedModel ?? process.env.DEFAULT_MODEL ?? 'gpt-4o-mini';

  if (!effectiveApiBaseUrl) {
    throw new Error('[ACTIONS] DEFAULT_API_BASE_URL is required');
  }

  const model = createOpenAICompatible({
    baseURL: effectiveApiBaseUrl,
    apiKey: effectiveApiKey,
    name: 'custom',
  }).chatModel(effectiveModel);

  const { text: title } = await generateText({
    model,
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}

