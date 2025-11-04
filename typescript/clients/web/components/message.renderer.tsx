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
import { ToolApproval } from './tool-approval';
// {
//   "artifacts": [
//   {
//     "name": "swap-preview",
//     "parts": [
//       {
//         "data": {
//           "txPlan": [
//             { "to": "0x...", "data": "0x...", "value": "0", "chainId": "42161" },
//             { "to": "0x...", "data": "0x...", "value": "0", "chainId": "42161" }
//           ],
//           "txPreview": {
//             "fromTokenAmount": "10.0",
//             "fromTokenSymbol": "USDC",
//             "fromTokenAddress": "0xA0b869...",
//             "fromChain": "arbitrum",
//             "toTokenAmount": "0.003",
//             "toTokenSymbol": "ETH",
//             "toTokenAddress": "0x0000...",
//             "toChain": "arbitrum"
//           }
//         }
//       }
//     ]
//   }
// ]
// }
interface MessageRendererProps {
  message: UIMessage;
  part: UIMessage['parts'][number];
  isLoading: boolean;
  mode: 'view' | 'edit';
  setMode: Dispatch<React.SetStateAction<'view' | 'edit'>>;
  isReadonly: boolean;
  setMessages: UseChatHelpers<any>['setMessages'];
  reload: UseChatHelpers<any>['reload'];
  onToolApprove?: (approvalId: string, toolCallId: string) => void;
  onToolDeny?: (approvalId: string, toolCallId: string) => void;
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
                                  onToolApprove,
                                  onToolDeny,
                                }: MessageRendererProps) => {
  const { role } = message;
  const { type } = part;
  console.log(part);

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

  // AI SDK v6 approval flow: render approval request cards
  if (type === 'tool-approval-request') {
    const approval = part as unknown as {
      approvalId: string;
      toolCall: { toolName: string; toolCallId: string; input: Record<string, unknown> };
    };
    const { approvalId, toolCall } = approval;
    console.log('[MessageRenderer] Tool approval request:', approval);
    if (!onToolApprove || !onToolDeny) return null;
    return (
      <ToolApproval
        toolName={toolCall.toolName}
        toolCallId={toolCall.toolCallId}
        approvalId={approvalId}
        input={toolCall.input || {}}
        onApprove={onToolApprove}
        onDeny={onToolDeny}
      />
    );
  }

  if (type === 'tool-call' || type === 'dynamic-tool') {
    const toolCall = part as unknown as {
      toolName: string;
      toolCallId: string;
      input: unknown;
      state?: string;
      output?: unknown;
    };
    const { toolName, toolCallId, input: args } = toolCall;

    console.log('tool-call', JSON.stringify(toolCall));

    // Prefer showing output.result (AI SDK v6 dynamic-tool with state: output-available)
    const pickJsonObject = () => {
      const out = (toolCall as any)?.output;
      let candidate: any = null;
      if (out !== undefined) {
        // If output exists, prefer its result, else the output itself
        const res = (out as any)?.result ?? out;
        if (typeof res === 'string') {
          try { candidate = JSON.parse(res); } catch { candidate = null; }
        } else if (res && typeof res === 'object') {
          candidate = res;
        }
      }
      // Fallback to args if no usable output
      if (!candidate) {
        if (typeof args === 'string') {
          try { candidate = JSON.parse(args as any); } catch { candidate = null; }
        } else if (args && typeof args === 'object') {
          candidate = args;
        }
      }
      return candidate ?? {};
    };
    const jsonForViewer = pickJsonObject();

    // Extract txPreview and txPlan from output.result.content[0].text for MCP tools
    const extractTransactionData = () => {
      const out = (toolCall as any)?.output;
      if (!out) return { txPreview: null, txPlan: null };

      try {
        // Check if output has result.content[0].text structure
        const contentText = out?.result?.content?.[0]?.text;
        if (typeof contentText === 'string') {
          const parsed = JSON.parse(contentText);
          const txPreview = parsed?.artifacts?.[0]?.parts?.[0]?.data?.txPreview || null;
          const txPlan = parsed?.artifacts?.[0]?.parts?.[0]?.data?.txPlan || null;
          return { txPreview, txPlan };
        }
      } catch (error) {
        console.error('Error parsing transaction data from tool output:', error);
      }

      return { txPreview: null, txPlan: null };
    };
    const { txPreview: toolCallTxPreview, txPlan: toolCallTxPlan } = extractTransactionData();
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
            <div className="animate-spin rounded-full size-6 border-b-2 border-blue-600" />
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
          <TemplateComponent txPreview={toolCallTxPreview} txPlan={toolCallTxPlan} jsonObject={jsonForViewer} />
        )}
      </div>
    );
  }

  if (type === 'tool-result') {
    // Support both AI SDK v6 ('output') and legacy/test shape ('result')
    const toolResult = part as unknown as { output?: unknown; result?: unknown; toolCallId: string; toolName: string };
    const { toolCallId, toolName } = toolResult;
    const result = typeof toolResult.output !== 'undefined' ? toolResult.output : (toolResult as any).result;

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
        // Possible shapes:
        // - { result: { content: [{ text: string }] } }
        // - { output: { result: { content: [{ text: string }] } } }
        // - { output: stringifiedJSON }
        // - { result: stringifiedJSON }
        const unwrap = (val: any) => (val && typeof val === 'object' && 'result' in val ? (val as any).result : val);
        const unwrapped = unwrap(result as any);
        const fromContent = unwrapped?.content?.[0]?.text as string | undefined;
        const raw = typeof result === 'string' ? (result as string) : typeof unwrapped === 'string' ? (unwrapped as string) : fromContent;
        if (raw) {
          const chartData = JSON.parse(raw);
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

    // Generic MCP/context7 result parsing with robust fallbacks
    const safeParseJSON = (input: unknown): any => {
      if (typeof input === 'string') {
        try {
          return JSON.parse(input);
        } catch (_e) {
          return null;
        }
      }
      return null;
    };

    // Normalize common shapes:
    // - object with nested { result: ... }
    // - plain object output
    // - stringified JSON
    const normalizeResult = (val: unknown): any => {
      if (val == null) return null;
      if (typeof val === 'object') {
        const obj = val as any;
        if ('result' in obj && obj.result != null) {
          return obj.result;
        }
        return obj;
      }
      if (typeof val === 'string') {
        const parsed = safeParseJSON(val);
        if (parsed && typeof parsed === 'object' && 'result' in parsed) {
          return (parsed as any).result ?? parsed;
        }
        return parsed;
      }
      return null;
    };

    const normalized = normalizeResult(result);

    // Try to derive a usable object for downstream components
    let toolInvocationResult: any = null;

    if (normalized && typeof normalized === 'object') {
      toolInvocationResult = normalized;
    } else {
      // Attempt to parse from content array if present in legacy MCP wrapper
      const contentString = (result as any)?.result?.content?.[0]?.text
        ?? (result as any)?.result?.content?.[0]?.resource?.text
        ?? undefined;
      if (contentString) {
        toolInvocationResult = safeParseJSON(contentString);
      }
      if (!toolInvocationResult) {
        // Final fallback: parse the raw value if it is a string
        toolInvocationResult = safeParseJSON(result as any);
      }
    }
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
            jsonObject={
              (toolInvocationResult && typeof toolInvocationResult === 'object') ? toolInvocationResult
                : (normalized && typeof normalized === 'object') ? normalized
                  : (result && typeof result === 'object') ? (result as any)
                    : {}
            }
          />
        )}
      </div>
    );
  }

  // Default return for unhandled part types
  return null;
};
