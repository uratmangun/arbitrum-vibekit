import type { UIMessage } from 'ai';
import {
  convertToModelMessages,
  smoothStream,
  streamText,
  stepCountIs,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  getMostRecentUserMessage,
  generateUUID,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
// import { createDocument } from '@/lib/ai/tools/create-document';
// import { updateDocument } from '@/lib/ai/tools/update-document';
// import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
// import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { getTools as getDynamicTools } from '@/lib/ai/tools/tool-agents';
// import { generateChart } from '@/lib/ai/tools/generate-chart'; // Now using MCP server

import type { Session } from 'next-auth';

import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const ContextSchema = z.object({
  walletAddress: z.string().optional(),
  mcpServers: z.array(z.object({
    id: z.string(),
    url: z.string(),
    enabled: z.boolean(),
    headers: z.record(z.string()).optional(),
    selectedTools: z.array(z.string()).optional(),
  })).optional(),
  customSystemPrompt: z.string().optional(),
});
type Context = z.infer<typeof ContextSchema>;

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const {
      id,
      messages,
      selectedChatModel,
      apiBaseUrl,
      providerApiKey,
      context,
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
      apiBaseUrl?: string | null;
      providerApiKey?: string | null;
      context: Context;
    } = await request.json();

    const session: Session | null = await auth();

    const validationResult = ContextSchema.safeParse(context);

    if (!validationResult.success) {
      return new Response(JSON.stringify(validationResult.error.issues), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const validatedContext = validationResult.data;

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    // Load default configuration from environment variables
    const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4o-mini';
    const defaultApiBaseUrl = process.env.DEFAULT_API_BASE_URL || '';
    const defaultApiKey = process.env.DEFAULT_API_KEY || null;

    // Use OpenAI-compatible provider with environment defaults
    const effectiveModel = selectedChatModel || defaultModel;
    const effectiveApiBaseUrl = apiBaseUrl ?? defaultApiBaseUrl;
    const effectiveApiKey = (providerApiKey && providerApiKey.trim() !== ''
      ? providerApiKey
      : defaultApiKey) ?? null;

    // Ensure we have a valid API base URL
    if (!effectiveApiBaseUrl || effectiveApiBaseUrl.trim() === '') {
      throw new Error('[CONFIG] DEFAULT_API_BASE_URL is missing in environment or request. Set DEFAULT_API_BASE_URL in .env.local or pass apiBaseUrl.');
    }

    if (!chat) {
      try {
        const title = await generateTitleFromUserMessage({
          message: userMessage,
          selectedModel: effectiveModel,
          apiBaseUrl: effectiveApiBaseUrl,
          apiKey: effectiveApiKey,
        });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          address: validatedContext.walletAddress || '',
        });
      } catch (error) {
        console.error(
          '[ROUTE] Error in title generation or chat saving:',
          error,
        );
        throw error; // Re-throw to be caught by outer try-catch
      }
    } else {
      if (chat.userId !== session.user.id) {
        console.log('[ROUTE] Unauthorized chat access attempt');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    try {
      // Extract file attachments from message parts (v5 represents files as parts)
      const fileAttachments = userMessage.parts
        .filter((part): part is { type: 'file'; mediaType: string; filename?: string; url: string } =>
          part.type === 'file'
        )
        .map((part) => ({
          url: part.url,
          name: part.filename ?? 'file',
          size: 0, // Size not available in UIMessage parts
          type: part.mediaType,
        }));

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: userMessage.id,
            role: 'user',
            parts: userMessage.parts,
            attachments: fileAttachments,
            createdAt: new Date(),
          },
        ],
      });
    } catch (error: any) {
      // Ignore duplicate key errors (message already exists from previous request)
      if (error?.code === '23505' && error?.constraint_name === 'Message_v2_pkey') {
        console.log('[ROUTE] Message already exists in database, skipping save');
      } else {
        console.error('[ROUTE] Error saving user message:', error);
        throw error;
      }
    }

    let dynamicTools: Awaited<ReturnType<typeof getDynamicTools>>;
    try {
      // Pass MCP servers from client context to getDynamicTools
      const mcpServers = validatedContext.mcpServers || [];

      // Load MCP servers from environment variables (backend-only)
      // Supports multiple servers via numbered pattern: MCP_SERVER_1_ID, MCP_SERVER_1_URL, etc.
      // Also supports single server via: MCP_SERVER_ID, MCP_SERVER_URL
      const envMcpServers: Array<{
        id: string;
        url: string;
        enabled: boolean;
        headers?: Record<string, string>;
        selectedTools?: string[];
      }> = [];

      // Check for numbered servers (MCP_SERVER_1_ID, MCP_SERVER_2_ID, etc.)
      let serverIndex = 1;
      while (true) {
        const serverId = process.env[`MCP_SERVER_${serverIndex}_ID`];
        const serverUrl = process.env[`MCP_SERVER_${serverIndex}_URL`];

        if (serverId && serverUrl) {
          envMcpServers.push({
            id: serverId,
            url: serverUrl,
            enabled: true,
          });
          serverIndex++;
        } else {
          break;
        }
      }

      // Check for single server without number (MCP_SERVER_ID, MCP_SERVER_URL) for backward compatibility
      if (envMcpServers.length === 0) {
        const serverId = process.env.MCP_SERVER_ID;
        const serverUrl = process.env.MCP_SERVER_URL;

        if (serverId && serverUrl) {
          envMcpServers.push({
            id: serverId,
            url: serverUrl,
            enabled: true,
          });
        }
      }

      // Merge environment-configured servers with user-configured servers
      const allMcpServers = [...envMcpServers, ...mcpServers];
      const enabledServers = allMcpServers.filter(s => s.enabled);
      const serverMap = new Map(enabledServers.map(s => [s.id, s.url]));
      const serverToolsMap = new Map(
        enabledServers
          .filter(s => s.selectedTools && s.selectedTools.length > 0)
          .map(s => [s.id, s.selectedTools!])
      );

      console.log('[ROUTE] Loading dynamic tools with MCP servers:', enabledServers.length);
      console.log('[ROUTE] Tool filters:', Array.from(serverToolsMap.entries()));
      dynamicTools = await getDynamicTools(serverMap, serverToolsMap);
    } catch (error) {
      console.error('[ROUTE] Error loading dynamic tools:', error);
      dynamicTools = {};
    }

    console.log('[ROUTE] Executing stream...');

    try {
      const model = createOpenAICompatible({
        baseURL: effectiveApiBaseUrl,
        apiKey: effectiveApiKey ?? undefined,
        name: 'custom',
      }).chatModel(effectiveModel);

      const systemPromptText = systemPrompt({
        selectedChatModel: effectiveModel,
        walletAddress: validatedContext.walletAddress,
        customPrompt: validatedContext.customSystemPrompt,
      });

      // Add approval handling instructions to system prompt
      const systemPromptWithApproval = `${systemPromptText}

IMPORTANT: When a tool execution is not approved by the user, do not retry it. Simply acknowledge that the tool execution was denied and continue the conversation without that information.`;

      const result = streamText({
        model,
        system: systemPromptWithApproval,
        messages: convertToModelMessages(messages),
        // Enable multi-step tool calling - allows AI to call multiple tools in sequence
        stopWhen: stepCountIs(20), // Stop after maximum of 20 steps if tools were called
        experimental_transform: smoothStream({ chunking: 'word' }),
        // experimental_generateMessageId: generateUUID, // TODO: Check if this exists in v5
        tools: {
          //getWeather,
          //createDocument: createDocument({ session }),
          //updateDocument: updateDocument({ session }),
          //requestSuggestions: requestSuggestions({ session }),
          ...(dynamicTools as any),
          // generateChart, // Now handled by MCP server via dynamicTools
        },
        // Log each step when tools are called
        onStepFinish: ({ stepType, toolCalls, toolResults, text, usage }) => {
          console.log('[ROUTE] Step finished:', {
            stepType,
            toolCallsCount: toolCalls?.length || 0,
            toolResultsCount: toolResults?.length || 0,
            hasText: !!text,
            usage,
          });

          // Log individual tool calls for debugging
          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((toolCall, index) => {
              console.log(`[ROUTE] Tool Call ${index + 1}:`, {
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
              });
            });
          }
        },
        experimental_telemetry: {
          isEnabled: isProductionEnvironment,
          functionId: 'stream-text',
        },
      });

      return result.toUIMessageStreamResponse({
        sendReasoning: true,
        onFinish: async ({ messages }) => {
          console.log('🔍 [ROUTE] StreamText finished');
          if (session.user?.id) {
            try {
              // Find the assistant message(s) in the UI messages
              const assistantMessages = messages.filter(
                (message) => message.role === 'assistant',
              );

              if (assistantMessages.length === 0) {
                throw new Error('No assistant message found!');
              }

              // Get the last assistant message
              const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

              if (!lastAssistantMessage) {
                throw new Error('No assistant message found!');
              }

              // Generate a valid UUID if the message ID is missing or invalid
              const messageId = lastAssistantMessage.id && lastAssistantMessage.id.trim() !== ''
                ? lastAssistantMessage.id
                : generateUUID();

              console.log('[ROUTE] Saving assistant message with ID:', messageId);

              // Extract file attachments from message parts (v5 represents files as parts)
              const assistantFileAttachments = lastAssistantMessage.parts
                .filter((part): part is { type: 'file'; mediaType: string; filename?: string; url: string } =>
                  part.type === 'file'
                )
                .map((part) => ({
                  url: part.url,
                  name: part.filename ?? 'file',
                  size: 0, // Size not available in UIMessage parts
                  type: part.mediaType,
                }));

              await saveMessages({
                messages: [
                  {
                    id: messageId,
                    chatId: id,
                    role: lastAssistantMessage.role,
                    parts: lastAssistantMessage.parts,
                    attachments: assistantFileAttachments,
                    createdAt: new Date(),
                  },
                ],
              });
            } catch (saveError: any) {
              // Ignore duplicate key errors (message already exists from previous request)
              if (saveError?.code === '23505' && saveError?.constraint_name === 'Message_v2_pkey') {
                console.log('[ROUTE] Assistant message already exists in database, skipping save');
              } else {
                console.error(
                  '[ROUTE] Failed to save assistant response:',
                  saveError,
                );
              }
            }
          }
        },
      });
    } catch (streamError) {
      console.error('[ROUTE] Stream error details:', {
        name: streamError instanceof Error ? streamError.name : 'Unknown',
        message:
          streamError instanceof Error
            ? streamError.message
            : String(streamError),
        stack: streamError instanceof Error ? streamError.stack : undefined,
      });
      throw streamError;
    }
  } catch (error) {
    console.error('[ROUTE] Main POST error:', error);
    const JSONerror = JSON.stringify(error, null, 2);
    return new Response(
      `An error occurred while processing your request! ${JSONerror}`,
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
