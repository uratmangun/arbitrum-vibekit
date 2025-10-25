'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon } from './icons';
import { Markdown } from './markdown';
import { Weather } from './weather';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import { Swaps } from './Swaps';
import { Pendle } from './Pendle';
import { Lending } from './Lending';
import { Liquidity } from './Liquidity';
import type { Dispatch } from 'react';
import { TemplateComponent } from './TemplateComponent';
import { PriceChart } from './price-chart';

interface MessageRendererProps {
  message: UIMessage;
  part: UIMessage['parts'][number];
  isLoading: boolean;
  mode: 'view' | 'edit';
  setMode: Dispatch<React.SetStateAction<'view' | 'edit'>>;
  isReadonly: boolean;
  setMessages: UseChatHelpers<any>['setMessages'];
  reload: UseChatHelpers<any>['reload'];
}

export const MessageRenderer = ({
  part,
  isLoading,
  mode,
  message,
  setMode,
  isReadonly,
  setMessages,
  reload,
}: MessageRendererProps) => {
  const { role } = message;
  const { type } = part;
  console.log('[MessageRenderer] Part:', { type, role, part, messageId: message.id });

  if (type === 'reasoning') {
    return (
      <MessageReasoning isLoading={isLoading} reasoning={part.text} />
    );
  }

  if (type === 'text' && mode === 'view') {
    return (
      <div className="flex flex-row gap-2 items-start">
        {role === 'user' && !isReadonly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="message-edit-button"
                variant="ghost"
                className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                onClick={() => {
                  setMode('edit');
                }}
              >
                <PencilEditIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit message</TooltipContent>
          </Tooltip>
        )}

        <div
          data-testid="message-content"
          className={cn('flex flex-col gap-4', {
            'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
              role === 'user',
          })}
        >
          <Markdown>{part.text}</Markdown>
        </div>
      </div>
    );
  }

  if (type === 'text' && mode === 'edit') {
    return (
      <div className="flex flex-row gap-2 items-start">
        <div className="size-8" />

        <MessageEditor
          key={message.id}
          message={message}
          setMode={setMode}
          setMessages={setMessages}
          reload={reload}
        />
      </div>
    );
  }

  // Handle both old format (type === 'tool-call') and new AI SDK v5 format (type starts with 'tool-')
  // Only match if it has 'input' but NOT 'output' (to avoid matching output phase)
  if (type === 'tool-call' || (typeof type === 'string' && type.startsWith('tool-') && 'input' in part && !('output' in part))) {
    const toolCall = part as unknown as { toolName?: string; toolCallId: string; input: unknown; state?: string };
    const { toolName = type, toolCallId, input: args } = toolCall;

    console.log('[MessageRenderer] tool-call/input:', { toolName, toolCallId, input: args, state: (part as any).state });
    
    // Skip rendering if this is just the input phase (state: 'input-available')
    if ((part as any).state === 'input-available') {
      return (
        <div className="flex items-center gap-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          <p className="text-blue-700">
            Calling {toolName}...
          </p>
        </div>
      );
    }

    return (
      <div
        key={toolCallId}
        className={cx({
          skeleton:
            ['getWeather'].includes(toolName) ||
            ['askSwapAgent'].includes(toolName),
        })}
      >
        {toolName.endsWith('getWeather') ? (
          <Weather />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} args={args as never} />
        ) : toolName === 'updateDocument' ? (
          <DocumentToolCall type="update" args={args as never} isReadonly={isReadonly} />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolCall
            type="request-suggestions"
            args={args as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('generate_chart') ||
          toolName === 'coingecko-generate_chart' ? (
          <div className="flex items-center gap-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="text-blue-700">
              Generating price chart for {(args as { token?: string }).token}...
            </p>
          </div>
        ) : toolName.endsWith('askSwapAgent') ? (
          <Swaps txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLendingAgent') ? (
          <Lending txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLiquidityAgent') ? (
          <Liquidity
            positions={null}
            txPreview={null}
            txPlan={null}
            pools={null}
          />
        ) : toolName.endsWith('askYieldTokenizationAgent') ? (
          <Pendle
            txPreview={null}
            txPlan={null}
            markets={[]}
            isMarketList={false}
          />
        ) : (
          <TemplateComponent txPreview={null} txPlan={null} />
        )}
      </div>
    );
  }

  // Handle both old format (type === 'tool-result') and new AI SDK v5 format (type starts with 'tool-' with output)
  if (type === 'tool-result' || (typeof type === 'string' && type.startsWith('tool-') && 'output' in part)) {
    const toolResult = part as unknown as { output: unknown; toolCallId: string; toolName?: string; state?: string };
    const { output: result, toolCallId, toolName = type, state } = toolResult;
    
    console.log('[MessageRenderer] tool-result/output:', { toolName, toolCallId, output: result, state });
    
    // Skip if not in output-available state (still processing)
    if (state && state !== 'output-available') {
      console.log('[MessageRenderer] Skipping render - state is not output-available:', state);
      return null;
    }

    // // Handle local generateChart tool (legacy)
    // if (toolName.endsWith('generateChart')) {
    //   return <PriceChart data={result as any} />;
    // }

    // Handle MCP server chart generation tools
    if (
      toolName.endsWith('generate_chart') ||
      toolName === 'coingecko-generate_chart'
    ) {
      try {
        const resultData = result as { result?: { content?: Array<{ text?: string }> } };
        const mcpResultString = resultData?.result?.content?.[0]?.text;
        if (mcpResultString) {
          const chartData = JSON.parse(mcpResultString);
          console.log('🔍 [MCP Chart] Parsed chart data:', chartData);
          return <PriceChart data={chartData} />;
        }
      } catch (error) {
        console.error('🔍 [MCP Chart] Error parsing chart data:', error);
        return (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50">
            <p className="text-red-700">Error loading chart data</p>
          </div>
        );
      }
    }

    const resultData = result as { 
      result?: { 
        content?: Array<{ text?: string; resource?: { text?: string } }>;
        structuredContent?: any;
      };
      status?: string;
      structuredContent?: any;
    };
    
    // Try to get data from content first, then fall back to structuredContent
    let toolInvocationResult = null;
    
    console.log('[MessageRenderer] resultData structure:', resultData);
    
    if (resultData?.result?.content?.[0]) {
      const toolInvocationParsableString = resultData.result.content[0].text
        ? resultData.result.content[0].text
        : resultData.result.content[0].resource?.text;
      
      if (toolInvocationParsableString) {
        try {
          toolInvocationResult = JSON.parse(toolInvocationParsableString);
          console.log('[MessageRenderer] Parsed from content:', toolInvocationResult);
        } catch (error) {
          console.error('[MessageRenderer] Error parsing content:', error);
          toolInvocationResult = null;
        }
      }
    } else if (resultData?.result?.structuredContent) {
      // Use structuredContent directly if content is empty
      toolInvocationResult = resultData.result.structuredContent;
      console.log('[MessageRenderer] Using structuredContent:', toolInvocationResult);
    } else if (resultData?.structuredContent) {
      // Also check top-level structuredContent
      toolInvocationResult = resultData.structuredContent;
      console.log('[MessageRenderer] Using top-level structuredContent:', toolInvocationResult);
    }
    console.log('[MessageRenderer] Final toolInvocationResult:', toolInvocationResult);
    console.log('[MessageRenderer] Will pass to TemplateComponent:', toolInvocationResult || resultData);
    
    const getKeyFromResult = (key: string) =>
      toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.[key] || null;

    // Default keys
    const txPlan = getKeyFromResult('txPlan');
    const txPreview = getKeyFromResult('txPreview');

    const getParts = () =>
      toolInvocationResult?.artifacts
        ? toolInvocationResult?.artifacts[0]?.parts
        : null;
    const getArtifact = () =>
      toolInvocationResult?.artifacts
        ? toolInvocationResult?.artifacts[0]
        : null;

    return (
      <div key={toolCallId}>
        {toolName.endsWith('getWeather') ? (
          <Weather weatherAtLocation={result as never} />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} result={result as never} />
        ) : toolName.endsWith('updateDocument') ? (
          <DocumentToolResult
            type="update"
            result={result as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolResult
            type="request-suggestions"
            result={result as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('askSwapAgent') ? (
          toolInvocationResult && (
            <Swaps txPreview={txPreview} txPlan={txPlan} />
          )
        ) : toolName.endsWith('askLendingAgent') ? (
          toolInvocationResult && (
            <Lending txPreview={txPreview} txPlan={txPlan} />
          )
        ) : toolName.endsWith('askLiquidityAgent') ? (
          toolInvocationResult && (
            <Liquidity
              positions={getKeyFromResult('positions')}
              pools={getKeyFromResult('pools')}
              txPreview={txPreview}
              txPlan={txPlan}
            />
          )
        ) : toolName.endsWith('askYieldTokenizationAgent') ? (
          toolInvocationResult && (
            <Pendle
              txPreview={txPreview}
              txPlan={txPlan}
              markets={getParts()}
              isMarketList={getArtifact()?.name === 'yield-markets'}
            />
          )
        ) : (
          <TemplateComponent
            txPreview={txPreview}
            txPlan={txPlan}
            jsonObject={toolInvocationResult || resultData}
          />
        )}
      </div>
    );
  }

  // Handle tool errors (AI SDK v5)
  if (type === 'tool-output-error' || (typeof type === 'string' && type.startsWith('tool-') && 'errorText' in part)) {
    const toolError = part as unknown as { errorText: string; toolCallId: string; toolName?: string };
    const { errorText, toolCallId, toolName = type } = toolError;
    
    console.error('[MessageRenderer] Tool error:', { toolName, toolCallId, errorText });
    
    // Parse the error message to make it more readable
    let displayError = errorText;
    try {
      // Try to extract the main error message
      if (errorText.includes('Invalid arguments for tool')) {
        const match = errorText.match(/Invalid arguments for tool (\w+):/);
        const toolNameFromError = match?.[1] || toolName;
        displayError = `Invalid arguments for ${toolNameFromError}`;
        
        // Try to parse the validation errors
        const jsonMatch = errorText.match(/\[([\s\S]*)\]/);
        if (jsonMatch) {
          try {
            const errors = JSON.parse(jsonMatch[0]);
            const errorMessages = errors
              .map((err: any) => {
                if (err.path && err.message) {
                  return `• ${err.path.join('.')}: ${err.message}`;
                }
                return null;
              })
              .filter(Boolean);
            
            if (errorMessages.length > 0) {
              displayError += '\n\nValidation errors:\n' + errorMessages.join('\n');
            }
          } catch (parseError) {
            // If parsing fails, use the original error
          }
        }
      }
    } catch (error) {
      // If any processing fails, use the original error text
      displayError = errorText;
    }
    
    return (
      <div key={toolCallId} className="p-4 border border-red-300 rounded-lg bg-red-50">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 mb-1">Tool Execution Error</h3>
            <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono bg-red-100 p-2 rounded">
              {displayError}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // Handle step-start and step-finish events (AI SDK v5)
  if (type === 'step-start' || type === 'step-finish') {
    // These are internal events, don't render anything
    return null;
  }

  // Default return for unhandled part types
  console.warn('[MessageRenderer] Unhandled part type:', type, part);
  return null;
};
