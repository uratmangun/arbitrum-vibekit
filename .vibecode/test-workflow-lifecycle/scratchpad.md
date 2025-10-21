# Workflow Dispatch Response via First Yield

Branch: test/workflow-lifecycle | Created: 2025-10-20 | Updated: 2025-10-20

## Current Focus (2025-10-22T00:00Z)

Working on: Duplicate `referenceTaskIds` when dispatching the same workflow multiple times
Approach: Map the workflow dispatch lifecycle and inspect how task metadata accumulates across dispatches

## Evidence Collected

- `typescript/lib/agent-node/src/a2a/handlers/streaming/StreamProcessor.ts:35-45` constructs one `ToolCallCollector` for the lifetime of the processor
- `typescript/lib/agent-node/src/a2a/handlers/streaming/StreamProcessor.ts:184-243` iterates the collector without clearing it, so earlier workflow tool calls are replayed
- `typescript/lib/agent-node/src/a2a/handlers/streaming/StreamProcessor.ts:83-86` logs confirm the collector still holds prior tool calls (see `collectedToolCalls` count)
- `typescript/lib/agent-node/src/a2a/handlers/streaming/ToolCallCollector.ts:49-52` exposes `clear()`, but no caller invokes it
- Workflow tool calls are only executed after the AI stream finishes (`StreamProcessor.handleToolCalls`), so the Vercel AI SDK never receives a tool-result to continue looping within the same turn
- Removing `ToolCallCollector` and storing tool-call metadata directly in per-stream state will eliminate stale state concerns and simplify realtime execution
- Workflow handler already waits for first yield (`workflowHandler.ts:760-808`), so we can supply tool results synchronously without extra async plumbing
- Tool artifacts are created in `StreamEventHandler.handleToolCall`/`handleToolResult`; we just need to feed them the immediate workflow result so parts render correctly
- The A2A protocol currently surfaces `referenceTaskIds` exclusively via status-update messages; artifact payloads lack a dedicated field, so parent announcements must remain status updates
- Initial refactor regression: `ToolHandler.createToolsBundle()` returned an `onToolCall` closure, but `AIHandler.handleStreamingAIProcessing` was still passing only `tools` to `ai.streamMessage`, so workflow tool calls never executed inline and the stream stalled waiting for a result (resolved by wiring `onToolCall` through on 2025-10-22T04:15Z).

## Assumptions

- Re-dispatch reuses existing task metadata rather than creating a fresh container per run

## Requirements

- Workflow tools must execute inline with the SDK loop to match standard tool-call semantics

## Attempts Log

2025-10-22T00:00Z Attempt 1: Reviewed streaming dispatch path; found persistent `ToolCallCollector` state causing duplicate workflow dispatch metadata → Identified root cause
2025-10-22T00:15Z Attempt 2: Plan fix to reset collector per stream and add regression coverage → Pending implementation
2025-10-22T01:10Z Attempt 3: Evaluated full tool-call lifecycle; determined workflow tool calls need inline execution with first-yield response returned as tool-result → Pending design doc
2025-10-22T02:30Z Attempt 4: Decision to drop `ToolCallCollector` and replace with lightweight per-stream stack for tool-call tracking → Implementation planning
2025-10-22T03:45Z Attempt 5: Reviewed refactor implementation; found missing `onToolCall` wiring (AIHandler does not pass workflow dispatcher to Vercel SDK) → Fix required
2025-10-22T04:15Z Attempt 6: Wired `onToolCall` through AIHandler → ToolHandler, ensured createToolsBundle always returns dispatcher, and cleaned up tool-call tracking after results → Pending validation
2025-10-22T04:30Z Attempt 7: Removed unused `executeToolCall` helper from ToolHandler to avoid double-dispatch confusion → Completed

## Discovered Patterns

- `StreamProcessor` instances are long-lived within `AIHandler`, so any collector state must be reset per stream
- `handleToolCalls` expects the collector to represent just the current stream; stale entries break workflow reference semantics
- Vercel AI SDK relies on immediate tool results; deferring workflow execution changes the model loop semantics and forces out-of-band status updates
- Consolidating tool-call storage inside stream state aligns with SDK expectations and avoids orphaned entries

## Implementation Plan (Steps 1-4, finalized 2025-10-21)

### Step 1: Inline Workflow Execution in ToolHandler

**File: `ToolHandler.ts`**
- Inject `WorkflowHandler` into constructor
- Update `executeToolCall()` signature to accept `contextId` and `eventBus`:
  ```typescript
  async executeToolCall(
    toolName: string,
    args: unknown,
    contextId: string,
    eventBus: ExecutionEventBus
  ): Promise<unknown>
  ```
- Detect `dispatch_workflow_*` tool names
- When detected, call `workflowHandler.dispatchWorkflow(toolName, args, contextId, eventBus)` and return `result` field (the Part[] array the SDK expects)
- For non-workflow tools, keep existing behavior

- Update `createToolsBundle()` signature to accept `contextId` and `eventBus`:
  ```typescript
  createToolsBundle(contextId: string, eventBus: ExecutionEventBus)
  ```
- The `onToolCall` closure captures these values and passes them to `executeToolCall`:
  ```typescript
  onToolCall: (name, args) => this.executeToolCall(name, args, contextId, eventBus)
  ```

**File: `AIHandler.ts`**
- Pass `workflowHandler` to ToolHandler constructor (line 30)
- Update `createToolsBundle()` call to pass `contextId` and `eventBus` (line 68):
  ```typescript
  const bundle = this.toolHandler.createToolsBundle(contextId, eventBus);
  ```
- When invoking `ai.streamMessage`, supply both the tool map and `bundle.onToolCall` so the Vercel SDK loops execute workflow dispatches:
  ```typescript
  const stream = this.ai.streamMessage(
    { message: messageContent, contextId, history },
    { tools: toolsForSDK, onToolCall: bundle?.onToolCall }
  );
  ```

**File: `ToolHandler.unit.test.ts` (if exists) or create tests**
- Update all test instantiations to provide WorkflowHandler dependency
- Update test calls to executeToolCall/createToolsBundle with contextId/eventBus parameters

### Step 2: Adjust WorkflowHandler Return Contract

**File: `workflowHandler.ts`**
- Current return: `{ taskId, metadata, additionalParts? }`
- Update return type to provide tool result for SDK plus parent announcement data:
  ```typescript
  {
    result: Part[];               // Tool result for SDK (becomes tool-result.output)
    taskId: string;               // Child task ID for parent status update
    metadata: { workflowName, description, pluginId };
  }
  ```
- The `result` field (Part[] array) is what ToolHandler returns to the SDK
- `additionalParts` from first-yield becomes `result`
- The `taskId` and `metadata` are stored in state for parent status update

### Step 3: Remove ToolCallCollector

**Files to modify:**

1. **Delete:** `ToolCallCollector.ts`

2. **`StreamEventHandler.ts`:**
   - Remove ToolCallCollector import and parameter
   - Add to `StreamProcessingState`:
     ```typescript
    toolCalls: Array<{ name: string; artifactId: string }>;
     ```
   - Update `handleToolCall()` to push entry to state
   - Update `handleToolResult()` to lookup by index, check if workflow tool, and publish parent status if present

3. **`StreamProcessor.ts`:**
   - Remove ToolCallCollector import and field
   - Remove collector instantiation from constructor (line 45)
   - Initialize `toolCalls: []` in `processStream()` state (line 64)
   - Remove `handleToolCalls()` method entirely (lines 169-244)
   - Remove call to `this.handleToolCalls()` (line 92)
   - Remove `onWorkflowDispatch` parameter from `StreamProcessorOptions` and `processStream()` - no longer needed

4. **`StreamProcessor.unit.test.ts`:**
   - Remove all ToolCallCollector mocking
   - Update workflow dispatch tests to verify inline behavior via ToolHandler

5. **`StreamEventHandler.unit.test.ts`:**
   - Remove all ToolCallCollector mocking
   - Update test setup to remove collector parameter from handleStreamEvent calls

### Step 4: Centralized Parent Status Updates

**File: `StreamEventHandler.ts` or `StreamProcessor.ts`**
- When a tool-result for a workflow is detected (name starts with `dispatch_workflow_`), publish parent status update
- Workflow metadata comes from the tool-result payload returned by `ToolHandler.executeToolCall`
- Preserve exact format from current `StreamProcessor.handleToolCalls()` (lines 215-241):
  - `referenceTaskIds: [childTaskId]`
  - Text part + workflow dispatch-response parts
  - `metadata.referencedWorkflow`

**Implementation approach:**
- In `handleToolResult()`, after detecting workflow tool:
  - Parse workflow metadata and parts from `toolResultEvent.output`
  - Construct and publish status update with referenceTaskIds
  - Remove the processed tool call from per-stream tracking to prevent duplicate announcements

### Files Changed Summary

**Modified:**
1. `ToolHandler.ts` - **MAJOR**: Accept contextId/eventBus, detect workflow tools, call dispatchWorkflow inline, return Part[] to SDK
2. `ToolHandler.unit.test.ts` - Update constructor/method calls with new parameters
3. `AIHandler.ts` - Pass workflowHandler to ToolHandler, pass contextId/eventBus to createToolsBundle
4. `workflowHandler.ts` - **MAJOR**: Change return type to `{ result: Part[], taskId, metadata }`
5. `StreamProcessor.ts` - Remove collector, remove handleToolCalls(), remove onWorkflowDispatch param
6. `StreamEventHandler.ts` - Remove collector, track tool calls per stream (name + artifactId), publish parent status in handleToolResult, clean up processed entries
7. `StreamProcessor.unit.test.ts` - Remove collector mocking, update workflow tests
8. `StreamEventHandler.unit.test.ts` - Remove collector mocking

**Deleted:**
9. `ToolCallCollector.ts` - DELETE

### Step 5: Tests & Regression Coverage

(Deferred - not part of current implementation scope)

## Test Coverage Targets

- **Unit (`src/a2a/handlers/streaming/StreamProcessor.unit.test.ts`)**: Drive two sequential workflow dispatches via `processStream` and assert that each inline status update contains only the new child task id in `referenceTaskIds` while corresponding tool-result artifacts deliver the workflow parts to the LLM.
- **Integration (`tests/integration/workflow-child-stream.int.test.ts`)**: Simulate two sequential workflow dispatches in the same parent conversation and ensure each parent sequence receives a single status update per dispatch (no accumulation) and that the stream continues after each workflow result.
- **Unit (`src/a2a/handlers/toolHandler.unit.test.ts`)**: Ensure `executeToolCall` routes workflow tools through `workflowHandler.dispatchWorkflow` and returns first-yield parts so the SDK loop can continue.
- **Integration (`tests/integration/workflow-child-stream.int.test.ts`)**: Verify the assistant stream continues after a workflow dispatch by receiving workflow tool-result artifacts and that the parent status updates still surface the child task id (no extra status-update injected).
- **Unit (`src/a2a/handlers/streaming/StreamEventHandler.unit.test.ts`)**: Confirm new per-stream tool-call tracking pushes/pops metadata correctly without the collector abstraction.
- **Unit (`src/a2a/handlers/workflowHandler.unit.test.ts`)**: Assert the new return contract (`parts` + metadata) is honored and that dispatch-response parts are returned even when empty.

## Blockers/Questions

- None yet
