# Tool Approval Implementation Guide

## Overview
This document describes the implementation of tool approval functionality in the Arbitrum VibeKit project. The feature allows users to approve or deny AI tool executions before they run, providing better control and security.

## Architecture

### Flow Diagram
```
User Request → AI Model → Tool Call Requested → Approval UI Shown → User Approves/Denies → Tool Executes/Cancelled → Response
```

### Components Modified

#### 1. **Server-Side: `lib/ai/tools/tool-agents.ts`**
- **Change**: Added `needsApproval: true` to all MCP tools
- **Purpose**: Marks tools as requiring user approval before execution
- **Location**: Line 114

```typescript
const aiTool = tool({
  description: mcptool.description,
  parameters: convertToZodSchema(mcptool.inputSchema),
  needsApproval: true, // ← Added this
  execute: async (args: Record<string, unknown>) => {
    // ... tool execution logic
  },
});
```

#### 2. **Server-Side: `app/(chat)/api/chat/route.ts`**
- **Change**: Enhanced system prompt with approval handling instructions
- **Purpose**: Instructs the AI not to retry denied tools
- **Location**: Lines 175-178

```typescript
const systemPromptWithApproval = `${systemPromptText}

IMPORTANT: When a tool execution is not approved by the user, do not retry it. Simply acknowledge that the tool execution was denied and continue the conversation without that information.`;
```

#### 3. **Client-Side: `components/tool-approval.tsx`** (NEW FILE)
- **Purpose**: UI component for displaying approval requests
- **Features**:
  - Shows tool name and parameters
  - Approve button (green)
  - Deny button (red)
  - Status feedback after action
  - Accessible and responsive design

#### 4. **Client-Side: `components/chat.tsx`**
- **Changes**:
  - Added `addToolApprovalResponse` from `useChat` hook (line 108)
  - Created `handleToolApproval` function (lines 155-161)
  - Created `handleToolDenial` function (lines 164-171)
  - Passed handlers to `Messages` component (lines 227-228)

#### 5. **Client-Side: `components/messages.tsx`**
- **Changes**:
  - Added approval handler props to interface (lines 19-20)
  - Passed handlers down to `PreviewMessage` (lines 61-62)

#### 6. **Client-Side: `components/message.tsx`**
- **Changes**:
  - Added approval handler props (lines 34-35)
  - Passed handlers to `MessageRenderer` (lines 104-105)

#### 7. **Client-Side: `components/message.renderer.tsx`**
- **Changes**:
  - Imported `ToolApproval` component (line 23)
  - Added approval handler props (lines 33-34)
  - Added handler for `tool-approval-request` type (lines 61-86)

## How It Works

### 1. Tool Execution Request
When the AI wants to execute a tool marked with `needsApproval: true`, instead of executing immediately:
- The stream emits a `tool-approval-request` event
- This event contains:
  - `approvalId`: Unique ID for this approval request
  - `toolCall`: Object with `toolName`, `toolCallId`, and `input` parameters

### 2. UI Display
The `MessageRenderer` detects the `tool-approval-request` type and renders the `ToolApproval` component:
- Displays a yellow alert box with warning icon
- Shows the tool name in a monospace font
- Displays formatted JSON of input parameters
- Shows Approve (green) and Deny (red) buttons

### 3. User Action
When the user clicks a button:
- **Approve**: Calls `onToolApprove(approvalId, toolCallId)`
  - Sends approval response with `approved: true`
  - Tool executes on the server
  - UI shows "Approved - Executing tool..." message
  
- **Deny**: Calls `onToolDeny(approvalId, toolCallId)`
  - Sends approval response with `approved: false` and reason
  - Tool execution is cancelled
  - UI shows "Denied - Tool execution cancelled" message
  - AI receives denial and continues without that tool

### 4. Response Handling
The `addToolApprovalResponse` function from `useChat`:
- Sends the approval decision back to the server via the stream
- The server processes the response
- If approved, the tool executes and results are returned
- If denied, the AI acknowledges and continues

## Testing

### Manual Testing Steps
1. Start a chat session
2. Ask the AI to perform an action that requires a tool (e.g., "Check the weather" or "Execute a swap")
3. Verify that an approval UI appears with:
   - Tool name
   - Input parameters
   - Approve/Deny buttons
4. Click **Approve**:
   - Verify the tool executes
   - Verify the result is displayed
5. Click **Deny**:
   - Verify the tool doesn't execute
   - Verify the AI acknowledges the denial

### Edge Cases to Test
- Multiple tool calls in sequence
- Rapid approve/deny clicks
- Network interruption during approval
- Tool execution errors after approval

## Security Considerations

1. **All MCP tools require approval** - This prevents unauthorized actions
2. **User has full visibility** - Parameters are shown before execution
3. **Explicit consent required** - No tool runs without user action
4. **Denial is respected** - AI is instructed not to retry denied tools

## Future Enhancements

Potential improvements:
1. **Selective approval**: Allow marking specific tools as auto-approve
2. **Approval history**: Log all approvals/denials for audit
3. **Risk levels**: Color-code tools by risk (green/yellow/red)
4. **Batch approval**: Approve multiple tools at once
5. **Remember preferences**: Auto-approve trusted tools based on user history
6. **Timeout handling**: Auto-deny after X seconds of no response

## Troubleshooting

### Approval UI doesn't appear
- Check browser console for `[MessageRenderer] Tool approval request:` logs
- Verify `needsApproval: true` is set in tool definition
- Check that handlers are passed through all components

### Tool executes without approval
- Verify `needsApproval: true` is present in tool definition
- Check AI SDK version (requires v5.0+)
- Review server logs for approval flow

### Approval doesn't work
- Check `addToolApprovalResponse` is available from `useChat`
- Verify approval handlers are called (check console logs)
- Check network tab for approval response being sent

## Dependencies

- **AI SDK**: v5.0.78 or higher
- **React**: For component rendering
- **Lucide React**: For icons (CheckCircle2, XCircle, AlertCircle)
- **Tailwind CSS**: For styling

## References

- [Vercel AI SDK Tool Approval Example](https://github.com/vercel/ai/blob/main/examples/ai-core/src/stream-text/openai-tool-approval.ts)
- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Tool Calling Guide](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)
