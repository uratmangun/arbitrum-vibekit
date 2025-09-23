'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

// Legacy Attachment type for local state (AI SDK v5 removed this)
type Attachment = {
  url: string;
  name: string;
  contentType: string;
};

export function Chat({
  id,
  initialMessages,
  initialSelectedChatModel,
  selectedVisibilityType: _selectedVisibilityType,
  isReadonly,
  selectedChatAgent: initialChatAgent,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialSelectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  selectedChatAgent: string;
}) {
  const { mutate } = useSWRConfig();
  const { address } = useAccount();
  const { data: session } = useSession();

  const [selectedChatAgent, _setSelectedChatAgent] = useState(initialChatAgent);
  const [selectedChatModel, setSelectedChatModel] = useState(() => {
    // Try to load from localStorage first, fallback to empty string to use server defaults
    if (typeof window !== 'undefined') {
      const savedModel = localStorage.getItem('selected_model');
      if (savedModel) {
        return savedModel;
      }
    }
    // Return empty string to let server use environment variable defaults
    return '';
  });
  const [input, setInput] = useState('');

  // Load custom system prompt from localStorage
  const [_customSystemPrompt, setCustomSystemPrompt] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return localStorage.getItem('custom_system_prompt') || '';
  });

  // Load MCP servers from localStorage and keep them in sync
  const [mcpServers, setMcpServers] = useState<Array<{
    id: string;
    url: string;
    enabled: boolean;
    headers?: Record<string, string>;
    selectedTools?: string[];
  }>>(() => {
    // This function runs only once during initialization
    // Avoid SSR access to localStorage
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const stored = window.localStorage.getItem('mcp_servers_config');
      if (stored) {
        const servers = JSON.parse(stored);
        console.log('[Chat] Loaded MCP servers from localStorage:', servers.length);
        return servers;
      }
    } catch (error) {
      console.error('[Chat] Error loading MCP servers:', error);
    }
    return [];
  });

  // Listen for localStorage changes to update MCP servers immediately
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem('mcp_servers_config');
        if (stored) {
          const servers = JSON.parse(stored);
          console.log('[Chat] MCP servers updated from localStorage:', servers.length);
          setMcpServers(servers);
        } else {
          setMcpServers([]);
        }
      } catch (error) {
        console.error('[Chat] Error reloading MCP servers:', error);
      }
    };

    // Listen for storage events (changes from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);

    // Listen for custom event (changes from same tab)
    window.addEventListener('mcp-servers-updated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('mcp-servers-updated', handleStorageChange);
    };
  }, []);

  // Listen for model selection changes from model selector
  useEffect(() => {
    const handleModelChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const modelId = customEvent.detail?.modelId;
      if (modelId) {
        console.log('[Chat] Model updated:', modelId);
        setSelectedChatModel(modelId);
      }
    };

    // Listen for custom event when model is changed in the model selector
    window.addEventListener('chat-model-updated', handleModelChange);

    return () => {
      window.removeEventListener('chat-model-updated', handleModelChange);
    };
  }, []);

  // Listen for custom system prompt changes
  useEffect(() => {
    const handlePromptChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const customPrompt = customEvent.detail?.customPrompt;
      if (customPrompt !== undefined) {
        console.log('[Chat] Custom system prompt updated:', customPrompt);
        setCustomSystemPrompt(customPrompt);
      }
    };

    // Listen for custom event when system prompt is changed
    window.addEventListener('system-prompt-updated', handlePromptChange);

    return () => {
      window.removeEventListener('system-prompt-updated', handlePromptChange);
    };
  }, []);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    reload,
    addToolApprovalResponse,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // Use a function to get the latest mcpServers value dynamically
      body: () => {
        // Get provider settings from localStorage
        const openRouterApiKey = typeof window !== 'undefined'
          ? localStorage.getItem('openrouter_api_key')
          : null;
        const providerType = typeof window !== 'undefined'
          ? (localStorage.getItem('provider_type') as 'openrouter' | 'openai-compatible' | null)
          : null;
        const apiBaseUrl = typeof window !== 'undefined'
          ? localStorage.getItem('provider_api_base_url')
          : null;
        const providerApiKey = typeof window !== 'undefined'
          ? localStorage.getItem('provider_api_key')
          : null;
        const customPrompt = typeof window !== 'undefined'
          ? localStorage.getItem('custom_system_prompt')
          : null;
        
        return {
          id,
          selectedChatModel: selectedChatModel || undefined, // Only send if explicitly set
          openRouterApiKey, // Pass API key to server
          providerType: providerType ?? undefined,
          apiBaseUrl: apiBaseUrl ?? undefined,
          providerApiKey: providerApiKey ?? undefined,
          context: {
            walletAddress: address,
            mcpServers, // This will now use the latest value
            customSystemPrompt: customPrompt || undefined,
          },
        };
      },
    }),
    messages: initialMessages,
    generateId: generateUUID,
    // Note: We manually call sendMessage() after approval in handleToolApproval/handleToolDenial
    // so we don't need sendAutomaticallyWhen here
    onFinish: () => {
      mutate('/api/history');
    },
    onError: (error) => {
      console.error('Chat error:', error);

      let errorMessage = 'An error occurred, please try again!';

      // Check for specific error types and provide user-friendly messages
      if (error.name === 'AI_APICallError') {
        errorMessage = 'Connection error. Please check your internet connection and try again.';
      } else if (error.name === 'AI_NoSuchModelError') {
        errorMessage = 'The selected AI model is not available. Please choose a different model.';
      } else if (error.name === 'AI_UnsupportedFunctionalityError') {
        errorMessage = 'This feature is not supported. Please try a different approach.';
      } else if (error.name === 'AI_RetryError') {
        errorMessage = 'The request timed out. Please try again.';
      } else if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (error.message?.includes('fetch') || error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message) {
        // Use the actual error message if it's user-friendly
        errorMessage = `Error: ${error.message}`;
      }

      toast.error(errorMessage);
    },
  });

  // Handle tool approval - for tools with needsApproval: true (AI SDK v6)
  const handleToolApproval = async (approvalId: string, toolCallId: string) => {
    console.log('[Chat] ========== APPROVAL HANDLER CALLED ==========');
    console.log('[Chat] Tool approved:', { approvalId, toolCallId });
    
    try {
      // Add approval response
      console.log('[Chat] Adding approval response...');
      await addToolApprovalResponse({
        approvalId,
        approved: true,
      });
      console.log('[Chat] Approval response added successfully');
      
      // Manually send message to continue the conversation
      console.log('[Chat] Calling sendMessage()...');
      sendMessage();
      console.log('[Chat] sendMessage() called');
    } catch (error) {
      console.error('[Chat] Error in approval handler:', error);
    }
  };

  // Handle tool denial - for tools with needsApproval: true (AI SDK v6)
  const handleToolDenial = async (approvalId: string, toolCallId: string) => {
    console.log('[Chat] Tool denied:', { approvalId, toolCallId });
    // Add denial response
    await addToolApprovalResponse({
      approvalId,
      approved: false,
      reason: 'User denied permission',
    });
    console.log('[Chat] Denial response added, sending message to continue...');
    // Manually send message to continue the conversation
    sendMessage();
  };

  // Debug: Log all messages and their parts
  useEffect(() => {
    console.log('[Chat] Messages updated:', messages.length);
    console.log('[Chat] Status:', status);
    messages.forEach((msg, idx) => {
      console.log(`[Chat] Message ${idx}:`, {
        id: msg.id,
        role: msg.role,
        partsCount: msg.parts?.length || 0,
        parts: msg.parts?.map(p => ({ type: p.type, ...p }))
      });
    });
    
    // Check if we have pending approvals
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      const hasToolCalls = lastMessage.parts?.some(p => 
        typeof p.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool')
      );
      const hasInputAvailable = lastMessage.parts?.some(p => 
        'state' in p && p.state === 'input-available'
      );
      console.log('[Chat] Last assistant message tool status:', {
        hasToolCalls,
        hasInputAvailable,
      });
    }
  }, [messages, status]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // Wrapper functions for compatibility with AI SDK 5.0
  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  const append = (message: UIMessage | { role: string; content: string }) => {
    // Handle both old format (content) and new format (parts)
    let text = '';
    if ('content' in message && typeof message.content === 'string') {
      text = message.content;
    } else if ('parts' in message && Array.isArray(message.parts)) {
      text = message.parts.map(p => p.type === 'text' ? p.text : '').join('');
    }

    if (text.trim()) {
      sendMessage({ text });
    }
  };

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        {(!session || !session?.user) && (
          <div className="fixed inset-0 backdrop-blur-sm bg-background/70 z-50 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl font-semibold">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-4">
              Authentication required to chat with Ember Agents
            </p>
            <ConnectButton />
          </div>
        )}
        <ChatHeader />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages.filter((m) => m.role !== 'data') as Array<UIMessage>}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
          onToolApprove={handleToolApproval}
          onToolDeny={handleToolDenial}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages.filter((m) => m.role !== 'data') as Array<UIMessage>}
              setMessages={setMessages}
              append={append}
              selectedAgentId={selectedChatAgent}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages.filter((m) => m.role !== 'data') as Array<UIMessage>}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        selectedAgentId={selectedChatAgent}
      />
    </>
  );
}
