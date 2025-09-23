# Tool Approval Debugging Guide

## Current Situation

After investigating AI SDK v5.0.79, I found that **tool approval implementation has changed** from the examples in the repository (commit `ede5cae`).

## Key Findings

### 1. The Example Uses Old API
The example files you referenced:
- `weather-with-approval-view.tsx` - Uses `invocation.state === 'approval-requested'`
- `openai-tool-approval.ts` - Uses `generateText` with `result.content` checking for `tool-approval-request`

### 2. Current AI SDK v5.0.79 Types
Looking at the actual types in `node_modules/ai/dist/index.d.ts`:

**UIToolInvocation states:**
- `'input-streaming'`
- `'input-available'`
- `'output-available'`
- `'output-error'`

**NO `'approval-requested'` or `'approval-responded'` states exist!**

### 3. What This Means

The tool approval feature might:
1. **Not be fully implemented in useChat yet** - It works in `generateText`/`streamText` server-side but not in the React `useChat` hook
2. **Use a different mechanism** - Perhaps through message parts or a different API
3. **Be in development** - The examples might be from a future version

## Recommended Approach

Since the React `useChat` hook doesn't seem to support tool approval natively, we have two options:

### Option A: Server-Side Approval (Recommended)
Implement approval on the server using `streamText`:

```typescript
// In route.ts
const result = streamText({
  model,
  messages,
  tools: dynamicTools,
  // ... other options
});

// Check result.content for tool-approval-request
for await (const part of result.fullStream) {
  if (part.type === 'tool-approval-request') {
    // Handle approval server-side
    // This requires a different flow - not streaming to client immediately
  }
}
```

**Problem**: This breaks the streaming UX since we need to pause and wait for user input.

### Option B: Client-Side Pre-Approval
Show a confirmation dialog BEFORE sending the message:

```typescript
// In the UI, before calling sendMessage:
1. Parse user intent
2. Detect which tools might be called
3. Show approval UI
4. Only send message after approval
```

**Problem**: We can't know for sure which tools the AI will call until it actually decides.

### Option C: Custom Tool Result Flow
Use `addToolResult` to manually control tool execution:

```typescript
// 1. Tools don't execute automatically
// 2. When tool is called, show approval UI
// 3. If approved, manually call tool and use addToolResult
// 4. If denied, use addToolResult with error state
```

**Problem**: This requires significant refactoring and might not work with `needsApproval`.

## Next Steps

1. **Verify if `needsApproval` actually works** - Test if setting it to `true` does anything
2. **Check console logs** - See what events are emitted when a tool is called
3. **Contact Vercel** - This might be a documentation issue or incomplete feature
4. **Alternative**: Implement custom approval logic without relying on `needsApproval`

## Testing Plan

1. Set `needsApproval: true` on a tool
2. Trigger the tool
3. Log ALL message parts and their types
4. Check if any approval-related data appears
5. Check browser network tab for any approval-related requests

## Temporary Solution

For now, I recommend:
1. Remove `needsApproval: true` from tools
2. Implement a custom approval UI that shows BEFORE tool execution
3. Use the tool's `execute` function to check for approval before running

Would you like me to implement one of these approaches?
