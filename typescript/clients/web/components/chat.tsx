'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
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
  selectedChatModel,
  selectedVisibilityType: _selectedVisibilityType,
  isReadonly,
  selectedChatAgent: initialChatAgent,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  selectedChatAgent: string;
}) {
  const { mutate } = useSWRConfig();
  const { address } = useAccount();
  const { data: session } = useSession();

  const [selectedChatAgent, _setSelectedChatAgent] = useState(initialChatAgent);
  const [input, setInput] = useState('');

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    reload,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: {
        id,
        selectedChatModel,
        context: {
          walletAddress: address,
        },
      },
    }),
    messages: initialMessages,
    generateId: generateUUID,
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
