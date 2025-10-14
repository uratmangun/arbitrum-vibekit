/**
 * Integration tests for parallel workflow dispatch with referenceTaskIds
 *
 * Tests the end-to-end behavior when an AI stream invokes workflow tools,
 * verifying that:
 * - Parent task announces child task via referenceTaskIds
 * - Both tasks run independently with their own lifecycles
 * - Events are properly isolated by taskId
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createAgentExecutor } from '../src/a2a/agentExecutor.js';
import type { AIService } from '../src/ai/service.js';
import type { SessionManager } from '../src/a2a/sessions/manager.js';
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../src/workflows/types.js';
import { WorkflowRuntime } from '../src/workflows/runtime.js';
import { RecordingEventBus } from './utils/mocks/event-bus.mock.js';
import { StubAIService } from './utils/mocks/ai-service.mock.js';
import { MockSessionManager } from './utils/mocks/session-manager.mock.js';
import { createSimpleRequestContext } from './utils/factories/index.js';

/**
 * Create a test workflow plugin that yields progress updates
 */
function createTestWorkflowPlugin(
  id: string,
  options: {
    shouldFail?: boolean;
    progressUpdates?: number;
    delay?: number;
  } = {},
): WorkflowPlugin {
  const { shouldFail = false, progressUpdates = 2, delay = 0 } = options;

  return {
    id,
    name: `Test Workflow ${id}`,
    description: `A test workflow for ${id}`,
    version: '1.0.0',
    async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
      // Yield initial status
      yield {
        type: 'status',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            messageId: 'wf-msg-1',
            contextId: context.contextId,
            role: 'agent',
            parts: [{ kind: 'text', text: `Starting workflow ${id}` }],
          },
        },
      };

      // Yield progress updates
      for (let i = 0; i < progressUpdates; i++) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        yield {
          type: 'artifact',
          artifact: {
            name: `progress-${i}.json`,
            mimeType: 'application/json',
            data: { step: i + 1, total: progressUpdates },
          },
        };
      }

      // Fail if requested
      if (shouldFail) {
        yield {
          type: 'error',
          error: new Error(`Workflow ${id} failed intentionally`),
        };
        return;
      }

      // Return final result
      return {
        success: true,
        workflowId: id,
        result: 'Workflow completed successfully',
      };
    },
  };
}

describe('Parallel Workflow Dispatch Integration', () => {
  let workflowRuntime: WorkflowRuntime;
  let aiService: StubAIService;
  let sessionManager: MockSessionManager;
  let eventBus: RecordingEventBus;

  beforeEach(() => {
    workflowRuntime = new WorkflowRuntime();
    aiService = new StubAIService();
    sessionManager = new MockSessionManager();
    eventBus = new RecordingEventBus();
  });

  it('emits referenceTaskIds when AI invokes workflow tool during streaming', async () => {
    // Given: A workflow runtime with a test plugin
    const testPlugin = createTestWorkflowPlugin('trading', { progressUpdates: 1 });
    workflowRuntime.register(testPlugin);

    // Given: AI service that calls workflow tool
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_trading',
        args: { action: 'buy' },
      },
      {
        type: 'text-delta',
        textDelta: 'Initiating trade...',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
    );

    const requestContext = createSimpleRequestContext('Execute a trade', 'task-parent', 'ctx-test');

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Then: Status update with referenceTaskIds should be emitted
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const referenceUpdate = statusUpdates.find(
      (update) =>
        'status' in update &&
        update.status.message &&
        'referenceTaskIds' in update.status.message &&
        Array.isArray(update.status.message.referenceTaskIds),
    );

    expect(referenceUpdate).toBeDefined();
    if (!referenceUpdate || !('status' in referenceUpdate)) {
      throw new Error('ReferenceTaskIds update not found');
    }

    // And: Update should be on parent task
    expect(referenceUpdate.taskId).toBe('task-parent');
    expect(referenceUpdate.contextId).toBe('ctx-test');

    // And: Message should contain workflow info
    const message = referenceUpdate.status.message;
    expect(message).toBeDefined();
    if (!message || !('parts' in message)) {
      throw new Error('Message not found in status update');
    }

    const textPart = message.parts.find((p) => 'text' in p && p.kind === 'text');
    expect(textPart).toBeDefined();
    if (!textPart || !('text' in textPart)) {
      throw new Error('Text part not found');
    }
    expect(textPart.text).toContain('Dispatching workflow: Test Workflow trading');
    expect(textPart.text).toContain('A test workflow for trading');

    // And: Metadata should contain workflow plugin info
    if (!('metadata' in message)) {
      throw new Error('Metadata not found');
    }
    const metadata = message.metadata as {
      referencedWorkflow?: {
        workflowName: string;
        description: string;
        pluginId: string;
      };
    };
    expect(metadata.referencedWorkflow).toEqual({
      workflowName: 'Test Workflow trading',
      description: 'A test workflow for trading',
      pluginId: 'trading',
    });
  });

  it('runs parent task (AI) and child task (workflow) in parallel', async () => {
    // Given: Workflow plugin with multiple progress updates
    const testPlugin = createTestWorkflowPlugin('lending', { progressUpdates: 3 });
    workflowRuntime.register(testPlugin);

    // Given: AI that continues streaming after workflow dispatch
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_lending',
        args: { amount: 1000 },
      },
      {
        type: 'text-delta',
        textDelta: 'Processing your request...',
      },
      {
        type: 'text-delta',
        textDelta: ' Done!',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
    );

    const requestContext = createSimpleRequestContext(
      'Start lending operation',
      'task-parent-2',
      'ctx-parallel',
    );

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for both tasks to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Then: Both parent and child task events should be present
    const tasks = eventBus.findEventsByKind('task');
    expect(tasks.length).toBeGreaterThanOrEqual(2); // Parent task + workflow task

    const parentTask = tasks.find((t) => 'id' in t && t.id === 'task-parent-2');
    const childTask = tasks.find(
      (t) =>
        'id' in t && t.id !== 'task-parent-2' && 'contextId' in t && t.contextId === 'ctx-parallel',
    );

    expect(parentTask).toBeDefined();
    expect(childTask).toBeDefined();

    // And: Both tasks should have correct context
    expect(parentTask?.contextId).toBe('ctx-parallel');
    expect(childTask?.contextId).toBe('ctx-parallel');

    // And: Parent task should complete
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const parentComplete = statusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-2' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();

    // And: Child workflow runs in background - verify task was created and started
    expect(childTask).toBeDefined();

    // And: Verify referenceTaskIds announcement was made
    const referenceUpdate = statusUpdates.find(
      (u) =>
        'status' in u &&
        u.status.message &&
        'referenceTaskIds' in u.status.message &&
        u.taskId === 'task-parent-2',
    );
    expect(referenceUpdate).toBeDefined();
  });

  it('dispatches multiple workflows from single AI stream', async () => {
    // Given: Two workflow plugins
    const tradingPlugin = createTestWorkflowPlugin('trading_multi', { progressUpdates: 1 });
    const lendingPlugin = createTestWorkflowPlugin('lending_multi', { progressUpdates: 1 });
    workflowRuntime.register(tradingPlugin);
    workflowRuntime.register(lendingPlugin);

    // Given: AI that calls both workflow tools
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_trading_multi',
        args: { action: 'buy' },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'dispatch_workflow_lending_multi',
        args: { amount: 1000 },
      },
      {
        type: 'text-delta',
        textDelta: 'Both operations initiated',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
    );

    const requestContext = createSimpleRequestContext(
      'Execute multiple workflows',
      'task-parent-multi',
      'ctx-multi',
    );

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: Two referenceTaskIds status updates should be emitted
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const referenceUpdates = statusUpdates.filter(
      (update) =>
        'status' in update &&
        update.status.message &&
        'referenceTaskIds' in update.status.message &&
        Array.isArray(update.status.message.referenceTaskIds),
    );

    expect(referenceUpdates.length).toBe(2);

    // And: Three tasks total (1 parent + 2 children)
    const tasks = eventBus.findEventsByKind('task');
    expect(tasks.length).toBe(3);

    const parentTask = tasks.find((t) => 'id' in t && t.id === 'task-parent-multi');
    const childTasks = tasks.filter(
      (t) => 'id' in t && t.id !== 'task-parent-multi' && t.contextId === 'ctx-multi',
    );

    expect(parentTask).toBeDefined();
    expect(childTasks.length).toBe(2);

    // And: Parent task should complete
    const parentCompletion = statusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-multi' && u.status.state === 'completed',
    );
    expect(parentCompletion).toBeDefined();

    // And: Both child tasks should be created with correct context
    expect(childTasks[0]?.contextId).toBe('ctx-multi');
    expect(childTasks[1]?.contextId).toBe('ctx-multi');
  });

  it('handles workflow errors without affecting parent task', async () => {
    // Given: Workflow plugin that fails
    const failingPlugin = createTestWorkflowPlugin('failing_workflow', {
      shouldFail: true,
      progressUpdates: 1,
    });
    workflowRuntime.register(failingPlugin);

    // Given: AI continues streaming after workflow dispatch
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_failing_workflow',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Continuing with other tasks...',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
    );

    const requestContext = createSimpleRequestContext(
      'Execute failing workflow',
      'task-parent-error',
      'ctx-error',
    );

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: ReferenceTaskIds announcement should still be emitted
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const referenceUpdate = statusUpdates.find(
      (update) =>
        'status' in update && update.status.message && 'referenceTaskIds' in update.status.message,
    );
    expect(referenceUpdate).toBeDefined();

    // And: Child task should enter "failed" state
    const childFailure = statusUpdates.find(
      (u) =>
        'taskId' in u &&
        u.taskId !== 'task-parent-error' &&
        u.contextId === 'ctx-error' &&
        u.status.state === 'failed',
    );
    expect(childFailure).toBeDefined();

    // And: Parent task should still complete successfully
    const parentComplete = statusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-error' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();
  });
});
