# Tool Call Rendering Fix

## Problem
The Messages component couldn't process and display tool call results from the MCP server. When the AI used tools like `ember-aave-getChains`, the results weren't being rendered in the UI.

## Root Causes

### Issue 1: AI SDK v5 Format Change
AI SDK v5 changed how tool calls are represented. Instead of using `type: 'tool-call'` and `type: 'tool-result'`, it now uses the tool name as the type (e.g., `type: 'tool-ember-aave-getChains'`).

### Issue 2: Data Structure
MCP Server returns data in this structure:
```json
{
  "status": "completed",
  "result": {
    "content": [],
    "structuredContent": { "chains": [...] }
  }
}
```

The `MessageRenderer` was only checking `result.result.content[0].text`, which was empty.

## Solutions Applied

### 1. Updated Tool Call Detection (Line 107)
```typescript
// Now detects both old and new formats
if (type === 'tool-call' || (typeof type === 'string' && type.startsWith('tool-') && 'input' in part && !('output' in part)))
```

### 2. Updated Tool Result Detection (Line 180)
```typescript
// Now detects both old and new formats
if (type === 'tool-result' || (typeof type === 'string' && type.startsWith('tool-') && 'output' in part))
```

### 3. Added State Checking (Line 187)
Only renders when `state === 'output-available'` to avoid rendering intermediate states.

### 4. Improved Data Extraction (Lines 227-256)
Falls back through multiple paths:
1. `result.content[0].text` (parsed JSON)
2. `result.structuredContent` (direct object)
3. Top-level `structuredContent` (fallback)
4. Raw `resultData` (ultimate fallback passed to TemplateComponent)

### 5. Added Fallback to TemplateComponent (Line 321)
```typescript
<TemplateComponent
  txPreview={txPreview}
  txPlan={txPlan}
  jsonObject={toolInvocationResult || resultData}
/>
```

This ensures data is always displayed even if parsing fails.

## Changes Made

### `/components/message.renderer.tsx`
- Fixed AI SDK v5 compatibility for tool type detection
- Added state-based rendering logic
- Improved data extraction with multiple fallback paths
- Added comprehensive logging
- Added handling for `step-start` and `step-finish` events
- **Added tool error handling** for `tool-output-error` events with formatted error display

### `/components/messages.tsx`
- Added debug logging to track messages

## How It Works Now

1. **Tool Call Phase**: AI decides to use a tool
   - Part type: `'tool-ember-aave-getChains'` with `state: 'input-available'`
   - Displays loading indicator

2. **Tool Result Phase**: MCP server returns results
   - Part type: `'tool-ember-aave-getChains'` with `state: 'output-available'` and `output` property
   - Extracts data from `structuredContent`
   - Passes to `TemplateComponent` → `JsonViewer`

3. **Tool Error Phase**: If tool execution fails
   - Part type: `'tool-output-error'` with `errorText` property
   - Parses and formats validation errors for better readability
   - Displays error in a red-bordered card with icon

## Testing
1. Clear `.next` cache: `rm -rf .next`
2. Restart dev server
3. Ask: "Show me Arbitrum chains"
4. Check console logs for data flow
5. Verify JSON viewer displays the chains data

## Additional Fix: PostgreSQL UUID Error

### Problem
When saving assistant messages, a PostgreSQL error occurred:
```
invalid input syntax for type uuid: ""
```

### Root Cause
The AI SDK v5 sometimes doesn't generate IDs for assistant messages during streaming, resulting in empty string IDs being passed to the database.

### Solution
Updated `/app/(chat)/api/chat/route.ts` to generate a UUID if the message ID is missing or invalid:

```typescript
// Generate a valid UUID if the message ID is missing or invalid
const messageId = lastAssistantMessage.id && lastAssistantMessage.id.trim() !== '' 
  ? lastAssistantMessage.id 
  : generateUUID();
```

## Related Files
- `/components/message.renderer.tsx` - Main tool rendering fix
- `/components/messages.tsx` - Debug logging
- `/app/(chat)/api/chat/route.ts` - UUID generation fix
- `/lib/ai/tools/tool-agents.ts` - Tool wrapper
- `/components/TemplateComponent.tsx` - Renders UI
- `/components/JsonViewer.tsx` - Displays JSON data
