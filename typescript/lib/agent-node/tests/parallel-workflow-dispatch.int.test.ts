/**
 * Integration tests for parallel workflow dispatch with referenceTaskIds
 *
 * Tests the end-to-end behavior when an AI stream invokes workflow tools,
 * verifying that:
 * - Parent task announces child task via referenceTaskIds
 * - Both tasks run independently with their own lifecycles
 * - Events are properly isolated by taskId
 */

import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

import { createAgentExecutor } from '../src/a2a/agentExecutor.js';
import type { SessionManager } from '../src/a2a/sessions/manager.js';
import type { AIService } from '../src/ai/service.js';
import { WorkflowRuntime } from '../src/workflows/runtime.js';
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../src/workflows/types.js';

import { createSimpleRequestContext } from './utils/factories/index.js';
import { StubAIService } from './utils/mocks/ai-service.mock.js';
import { RecordingEventBusManager } from './utils/mocks/event-bus.mock.js';
import { MockSessionManager } from './utils/mocks/session-manager.mock.js';

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
            artifactId: `progress-${i}.json`,
            name: `progress-${i}.json`,
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { step: i + 1, total: progressUpdates },
                metadata: { mimeType: 'application/json' },
              },
            ],
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
  let eventBusManager: RecordingEventBusManager;
  let taskStore: InMemoryTaskStore;

  beforeEach(() => {
    workflowRuntime = new WorkflowRuntime();
    aiService = new StubAIService();
    sessionManager = new MockSessionManager();
    eventBusManager = new RecordingEventBusManager();
    taskStore = new InMemoryTaskStore();
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
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent';
    const requestContext = createSimpleRequestContext('Execute a trade', parentTaskId, 'ctx-test');

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Status update with referenceTaskIds should be emitted on parent bus
    const statusUpdates = parentBus!.findEventsByKind('status-update');
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
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-2';
    const requestContext = createSimpleRequestContext(
      'Start lending operation',
      parentTaskId,
      'ctx-parallel',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for both tasks to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Get reference to child task ID from referenceTaskIds
    const parentStatusUpdates = parentBus!.findEventsByKind('status-update');
    const referenceUpdate = parentStatusUpdates.find(
      (u) =>
        'status' in u &&
        u.status.message &&
        'referenceTaskIds' in u.status.message &&
        u.taskId === 'task-parent-2',
    );
    expect(referenceUpdate).toBeDefined();

    const childTaskId = referenceUpdate?.status?.message?.referenceTaskIds?.[0];
    expect(childTaskId).toBeDefined();

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(childTaskId);
    expect(childBus).toBeDefined();

    // Then: Parent task should be on parent bus
    const parentTasks = parentBus!.findEventsByKind('task');
    const parentTask = parentTasks.find((t) => 'id' in t && t.id === 'task-parent-2');
    expect(parentTask).toBeDefined();
    expect(parentTask?.contextId).toBe('ctx-parallel');

    // And: Child task should be on child bus
    const childTasks = childBus!.findEventsByKind('task');
    const childTask = childTasks.find((t) => 'id' in t && t.id === childTaskId);
    expect(childTask).toBeDefined();
    expect(childTask?.contextId).toBe('ctx-parallel');

    // And: Parent task should complete on parent bus
    const parentComplete = parentStatusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-2' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();

    // And: Child workflow task was created and started
    expect(childTask).toBeDefined();
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
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-multi';
    const requestContext = createSimpleRequestContext(
      'Execute multiple workflows',
      parentTaskId,
      'ctx-multi',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Two referenceTaskIds status updates should be emitted on parent bus
    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const referenceUpdates = statusUpdates.filter(
      (update) =>
        'status' in update &&
        update.status.message &&
        'referenceTaskIds' in update.status.message &&
        Array.isArray(update.status.message.referenceTaskIds),
    );

    expect(referenceUpdates.length).toBe(2);

    // Extract child task IDs
    const childTaskIds = referenceUpdates.flatMap((u) => u.status?.message?.referenceTaskIds || []);
    expect(childTaskIds.length).toBe(2);

    // Get child bus recordings
    const childBus1 = eventBusManager.getRecordingBus(childTaskIds[0]);
    const childBus2 = eventBusManager.getRecordingBus(childTaskIds[1]);
    expect(childBus1).toBeDefined();
    expect(childBus2).toBeDefined();

    // Parent task should be on parent bus
    const parentTasks = parentBus!.findEventsByKind('task');
    const parentTask = parentTasks.find((t) => 'id' in t && t.id === 'task-parent-multi');
    expect(parentTask).toBeDefined();

    // Each child task should be on its own bus
    const childTask1 = childBus1!
      .findEventsByKind('task')
      .find((t) => 'id' in t && t.id === childTaskIds[0]);
    const childTask2 = childBus2!
      .findEventsByKind('task')
      .find((t) => 'id' in t && t.id === childTaskIds[1]);
    expect(childTask1).toBeDefined();
    expect(childTask2).toBeDefined();

    // And: Parent task should complete
    const parentCompletion = statusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-multi' && u.status.state === 'completed',
    );
    expect(parentCompletion).toBeDefined();

    // And: Both child tasks should be created with correct context
    expect(childTask1?.contextId).toBe('ctx-multi');
    expect(childTask2?.contextId).toBe('ctx-multi');
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
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-error';
    const requestContext = createSimpleRequestContext(
      'Execute failing workflow',
      parentTaskId,
      'ctx-error',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed
    await executor.execute(requestContext, eventBus);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: ReferenceTaskIds announcement should still be emitted on parent bus
    const parentStatusUpdates = parentBus!.findEventsByKind('status-update');
    const referenceUpdate = parentStatusUpdates.find(
      (update) =>
        'status' in update && update.status.message && 'referenceTaskIds' in update.status.message,
    );
    expect(referenceUpdate).toBeDefined();

    // Get child task ID
    const childTaskId = referenceUpdate?.status?.message?.referenceTaskIds?.[0];
    expect(childTaskId).toBeDefined();

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(childTaskId);
    expect(childBus).toBeDefined();

    // And: Child task should enter "failed" state on child bus
    const childStatusUpdates = childBus!.findEventsByKind('status-update');
    const childFailure = childStatusUpdates.find(
      (u) =>
        'taskId' in u &&
        u.taskId === childTaskId &&
        u.contextId === 'ctx-error' &&
        u.status.state === 'failed',
    );
    expect(childFailure).toBeDefined();

    // And: Parent task should still complete successfully on parent bus
    const parentComplete = parentStatusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-error' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();
  });

  it('should handle workflow pause during parallel dispatch', async () => {
    // Given: Workflow that pauses for input
    const pausingPlugin: WorkflowPlugin = {
      id: 'pausing_workflow',
      name: 'Pausing Workflow',
      description: 'A workflow that pauses for input',
      version: '1.0.0',

      async *execute(context: WorkflowContext) {
        yield { type: 'status', status: { state: 'working' } };

        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'pre-pause.json',
            name: 'pre-pause.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { stage: 'before-pause' },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        // Pause for input
        const _input: unknown = yield {
          type: 'pause',
          status: {
            state: 'input-required',
            message: {
              kind: 'message',
              messageId: 'pause-msg',
              contextId: context.contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: 'Need user input' }],
            },
          },
          inputSchema: z.object({
            data: z.string(),
          }),
        };

        return { paused: true };
      },
    };
    workflowRuntime.register(pausingPlugin);

    // Given: AI that dispatches pausing workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_pausing_workflow',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Workflow started, waiting for input...',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-pause';
    const requestContext = createSimpleRequestContext('Start workflow', parentTaskId, 'ctx-pause');

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed and workflow pauses
    await executor.execute(requestContext, eventBus);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Parent task should complete on parent bus
    const parentStatusUpdates = parentBus!.findEventsByKind('status-update');
    const parentComplete = parentStatusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-pause' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();

    // Get child task ID from referenceTaskIds
    const referenceUpdate = parentStatusUpdates.find(
      (u) => 'status' in u && u.status.message && 'referenceTaskIds' in u.status.message,
    );
    const childTaskId = referenceUpdate?.status?.message?.referenceTaskIds?.[0];
    expect(childTaskId).toBeDefined();

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(childTaskId);
    expect(childBus).toBeDefined();

    // And: Child workflow should be paused on child bus
    const childStatusUpdates = childBus!.findEventsByKind('status-update');
    const childPaused = childStatusUpdates.find(
      (u) =>
        'taskId' in u &&
        u.taskId === childTaskId &&
        'contextId' in u &&
        u.contextId === 'ctx-pause' &&
        u.status.state === 'input-required',
    );
    expect(childPaused).toBeDefined();

    // And: Artifact should be emitted before pause on child bus
    const childArtifacts = childBus!.findEventsByKind('artifact-update');
    const prePauseArtifact = childArtifacts.find((a) => 'artifact' in a && a.artifact.artifactId);
    expect(prePauseArtifact).toBeDefined();
  });

  it('should emit artifacts after resuming paused workflow', async () => {
    // Given: Workflow that pauses and emits artifacts after resume
    const artifactResumePlugin: WorkflowPlugin = {
      id: 'artifact_resume_test',
      name: 'Artifact Resume Test',
      description: 'Tests artifact emission after resume',
      version: '1.0.0',

      async *execute(context: WorkflowContext) {
        // Artifact before pause
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'pre-pause',
            name: 'pre-pause',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { stage: 1 },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        // Pause
        const input: unknown = yield {
          type: 'pause',
          status: {
            state: 'input-required',
            message: {
              kind: 'message',
              messageId: 'resume-msg',
              contextId: context.contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: 'Provide data' }],
            },
          },
          inputSchema: z.object({}),
        };

        // Artifact after resume
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'post-resume',
            name: 'post-resume',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { stage: 2, input },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        return { success: true };
      },
    };
    workflowRuntime.register(artifactResumePlugin);

    // Given: AI dispatches workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_artifact_resume_test',
        args: {},
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-artifacts';
    const requestContext = createSimpleRequestContext(
      'Test artifacts',
      parentTaskId,
      'ctx-artifacts',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute and wait for pause
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Get workflow task ID from referenceTaskIds on parent bus
    const parentStatusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = parentStatusUpdates.find(
      (u) =>
        'status' in u &&
        u.status.message &&
        'referenceTaskIds' in u.status.message &&
        Array.isArray(u.status.message.referenceTaskIds) &&
        u.status.message.referenceTaskIds.length > 0,
    );

    expect(refUpdate).toBeDefined();

    if (
      refUpdate &&
      'status' in refUpdate &&
      refUpdate.status.message &&
      'referenceTaskIds' in refUpdate.status.message &&
      Array.isArray(refUpdate.status.message.referenceTaskIds)
    ) {
      const workflowTaskId = refUpdate.status.message.referenceTaskIds[0];

      // Get the child bus recording
      const childBus = eventBusManager.getRecordingBus(workflowTaskId);
      expect(childBus).toBeDefined();

      // Count artifacts before resume on child bus
      const artifactsBefore = childBus!.findEventsByKind('artifact-update');
      const artifactsBeforeCount = artifactsBefore.length;
      expect(artifactsBeforeCount).toBeGreaterThanOrEqual(1);

      // Resume the workflow using the proper method
      // This will trigger event listeners that publish artifacts
      await workflowRuntime.resumeWorkflow(workflowTaskId, {});

      // Wait for artifacts to be emitted asynchronously
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Then: More artifacts should be emitted after resume on child bus
      const artifactsAfter = childBus!.findEventsByKind('artifact-update');
      const artifactsAfterCount = artifactsAfter.length;

      console.log('Artifacts before:', artifactsBeforeCount);
      console.log('Artifacts after:', artifactsAfterCount);
      console.log(
        'Child bus events:',
        childBus!.published.map((e) => e.kind),
      );

      // Should have more artifacts than before (at least one more after resume)
      expect(artifactsAfterCount).toBeGreaterThan(artifactsBeforeCount);
    }
  });

  it('validates parent/child event isolation: workflow artifacts only appear on workflow task stream', async () => {
    // Given: Workflow plugin that emits multiple artifacts
    const isolationTestPlugin = createTestWorkflowPlugin('isolation_test', { progressUpdates: 3 });
    workflowRuntime.register(isolationTestPlugin);

    // Given: AI that dispatches workflow
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_isolation_test',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Workflow dispatched',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-isolation';
    const requestContext = createSimpleRequestContext(
      'Test isolation',
      parentTaskId,
      'ctx-isolation',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute workflow dispatch
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Extract workflow task ID from referenceTaskIds on parent bus
    const parentStatusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = parentStatusUpdates.find(
      (u) =>
        'status' in u &&
        u.status.message &&
        'referenceTaskIds' in u.status.message &&
        Array.isArray(u.status.message.referenceTaskIds) &&
        u.status.message.referenceTaskIds.length > 0,
    );

    expect(refUpdate).toBeDefined();
    if (
      !refUpdate ||
      !('status' in refUpdate) ||
      !refUpdate.status.message ||
      !('referenceTaskIds' in refUpdate.status.message) ||
      !Array.isArray(refUpdate.status.message.referenceTaskIds)
    ) {
      throw new Error('ReferenceTaskIds not found');
    }

    const workflowTaskId = refUpdate.status.message.referenceTaskIds[0] as string;
    expect(workflowTaskId).toBeDefined();

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(workflowTaskId);
    expect(childBus).toBeDefined();

    // Then: Validate event isolation between buses
    const parentArtifacts = parentBus!.findEventsByKind('artifact-update');
    const childArtifacts = childBus!.findEventsByKind('artifact-update');

    // Parent task may have its own artifacts (e.g., tool-call artifacts)
    // but should NOT receive workflow progress artifacts
    const parentToolCallArtifacts = parentArtifacts.filter((a) =>
      a.artifact.artifactId?.startsWith('tool-call-'),
    );
    expect(parentToolCallArtifacts.length).toBeGreaterThan(0); // Parent should have tool-call artifact

    // All parent artifacts should be tool-call artifacts (no workflow progress artifacts)
    expect(parentArtifacts.length).toBe(parentToolCallArtifacts.length);

    // Child bus should contain workflow artifacts (progress-X.json)
    expect(childArtifacts.length).toBeGreaterThan(0); // Workflow should have artifacts

    // Validate that workflow artifacts are NOT on parent bus
    const workflowProgressArtifactsOnParent = parentArtifacts.filter((a) =>
      a.artifact.artifactId?.startsWith('progress-'),
    );
    expect(workflowProgressArtifactsOnParent.length).toBe(0); // No workflow artifacts on parent

    // Validate structure of workflow artifacts on child bus
    childArtifacts.forEach((artifact) => {
      expect(artifact).toMatchObject({
        kind: 'artifact-update',
        taskId: workflowTaskId,
        contextId: 'ctx-isolation',
        artifact: expect.any(Object),
      });
    });

    // Validate that parent and workflow status updates are on different buses
    expect(parentStatusUpdates.length).toBeGreaterThan(0);

    const childStatusUpdates = childBus!.findEventsByKind('status-update');
    expect(childStatusUpdates.length).toBeGreaterThan(0);
  });

  it('should provide valid taskId in referenceTaskIds that can be retrieved via runtime', async () => {
    // Given: A workflow runtime with a test plugin
    const testPlugin = createTestWorkflowPlugin('retrievable-task', { progressUpdates: 2 });
    workflowRuntime.register(testPlugin);

    // Given: AI service that calls workflow tool
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_retrievable_task',
        args: { action: 'test' },
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-retrieve';
    const requestContext = createSimpleRequestContext(
      'Test task retrieval',
      parentTaskId,
      'ctx-retrieve',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Message is processed
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Extract workflow task ID from referenceTaskIds
    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
      (u) =>
        'status' in u &&
        u.status.message &&
        'referenceTaskIds' in u.status.message &&
        Array.isArray(u.status.message.referenceTaskIds),
    );

    expect(refUpdate).toBeDefined();
    if (!refUpdate || !('status' in refUpdate) || !refUpdate.status.message) {
      throw new Error('ReferenceTaskIds not found');
    }

    const workflowTaskId = (refUpdate.status.message as any).referenceTaskIds[0];
    expect(workflowTaskId).toBeDefined();

    // Then: Workflow task state should be retrievable
    const taskState = workflowRuntime.getTaskState(workflowTaskId);
    expect(taskState).toBeDefined();
    expect(['working', 'completed']).toContain(taskState?.state);

    // And: Session manager should have the task in its session
    const session = sessionManager.getSession('ctx-retrieve');
    expect(session).toBeDefined();
    if (session && session.state.tasks) {
      expect(session.state.tasks).toContain(workflowTaskId);
    }
  });

  it('should handle concurrent getTaskState calls during workflow execution', async () => {
    // Given: Workflow with delays to allow concurrent access
    const slowPlugin = createTestWorkflowPlugin('concurrent-state', {
      progressUpdates: 5,
      delay: 50, // 50ms between updates
    });
    workflowRuntime.register(slowPlugin);

    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_concurrent_state',
        args: {},
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-concurrent';
    const requestContext = createSimpleRequestContext(
      'Test concurrent',
      parentTaskId,
      'ctx-concurrent',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute and get workflow task ID
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
      (u) => 'status' in u && u.status.message && 'referenceTaskIds' in u.status.message,
    );

    const workflowTaskId =
      refUpdate && 'status' in refUpdate
        ? (refUpdate.status.message as any)?.referenceTaskIds?.[0]
        : undefined;
    expect(workflowTaskId).toBeDefined();

    // When: Make concurrent calls to getTaskState during execution
    const statePromises = Array.from({ length: 10 }, async (_, i) => {
      await new Promise((resolve) => setTimeout(resolve, i * 20)); // Stagger calls
      return workflowRuntime.getTaskState(workflowTaskId);
    });

    const states = await Promise.all(statePromises);

    // Then: All calls should return valid, consistent state
    states.forEach((state) => {
      expect(state).toBeDefined();
      expect(['working', 'completed']).toContain(state?.state);
    });
  });

  it('should handle race condition when workflow pauses immediately before subscription', async () => {
    // Given: Workflow that pauses immediately
    const immediatelyPausingPlugin: WorkflowPlugin = {
      id: 'immediate_pause',
      name: 'Immediate Pause Workflow',
      description: 'Pauses immediately for race condition testing',
      version: '1.0.0',
      async *execute(context: WorkflowContext) {
        // Pause immediately without any prior status or artifacts
        const input: unknown = yield {
          type: 'pause',
          status: {
            state: 'input-required',
            message: {
              kind: 'message',
              messageId: 'immediate-pause',
              contextId: context.contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: 'Paused immediately' }],
            },
          },
          inputSchema: z.object({
            value: z.string(),
          }),
        };

        // After resume
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'after-resume.json',
            name: 'after-resume.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { resumed: true, input },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        return { success: true };
      },
    };
    workflowRuntime.register(immediatelyPausingPlugin);

    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_immediate_pause',
        args: {},
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-race';
    const requestContext = createSimpleRequestContext('Test race', parentTaskId, 'ctx-race');

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute and immediately check state
    await executor.execute(requestContext, eventBus);

    // Small delay to ensure workflow starts but simulate race condition
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Get workflow task ID
    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
      (u) => 'status' in u && u.status.message && 'referenceTaskIds' in u.status.message,
    );
    const workflowTaskId =
      refUpdate && 'status' in refUpdate
        ? (refUpdate.status.message as any)?.referenceTaskIds?.[0]
        : undefined;
    expect(workflowTaskId).toBeDefined();

    // Then: getTaskState should return paused state (handles race condition)
    const taskState = workflowRuntime.getTaskState(workflowTaskId);
    expect(taskState).toBeDefined();
    expect(taskState?.state).toBe('input-required');
    expect(taskState?.pauseInfo).toBeDefined();
    // Verify pauseInfo has inputSchema (it's a Zod schema)
    expect(taskState?.pauseInfo?.inputSchema).toBeDefined();

    // When: Resume the workflow
    await workflowRuntime.resumeWorkflow(workflowTaskId, { value: 'test-input' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: Task should complete
    const finalState = workflowRuntime.getTaskState(workflowTaskId);
    expect(finalState?.state).toBe('completed');
  });

  it('should handle multiple pause/resume cycles with artifact streaming', async () => {
    // Given: Workflow with multiple pause points
    const multiPausePlugin: WorkflowPlugin = {
      id: 'multi_pause_artifact',
      name: 'Multi-Pause Artifact Workflow',
      description: 'Tests multiple pause/resume cycles',
      version: '1.0.0',
      async *execute(context: WorkflowContext) {
        // First artifact batch
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'phase-1-start.json',
            name: 'phase-1-start.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { phase: 1, status: 'starting' },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        // First pause
        const input1: unknown = yield {
          type: 'pause',
          status: {
            state: 'input-required',
            message: {
              kind: 'message',
              messageId: 'pause-1',
              contextId: context.contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: 'First pause - provide configuration' }],
            },
          },
          inputSchema: z.object({
            config: z.string(),
          }),
        };

        // Artifacts after first resume
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'phase-1-complete.json',
            name: 'phase-1-complete.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { phase: 1, status: 'complete', config: input1 },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'phase-2-start.json',
            name: 'phase-2-start.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { phase: 2, status: 'starting' },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        // Second pause
        const input2: unknown = yield {
          type: 'pause',
          status: {
            state: 'input-required',
            message: {
              kind: 'message',
              messageId: 'pause-2',
              contextId: context.contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: 'Second pause - provide data' }],
            },
          },
          inputSchema: z.object({
            data: z.any(),
          }),
        };

        // Final artifacts after second resume
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'phase-2-complete.json',
            name: 'phase-2-complete.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: { phase: 2, status: 'complete', data: input2 },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };
        yield {
          type: 'artifact',
          artifact: {
            artifactId: 'final-result.json',
            name: 'final-result.json',
            mimeType: 'application/json',
            parts: [
              {
                kind: 'data',
                data: {
                  success: true,
                  phases: [input1, input2],
                },
                metadata: { mimeType: 'application/json' },
              },
            ],
          },
        };

        return { completed: true, totalPhases: 2 };
      },
    };
    workflowRuntime.register(multiPausePlugin);

    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_multi_pause_artifact',
        args: {},
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-multi-pause';
    const requestContext = createSimpleRequestContext(
      'Test multi-pause',
      parentTaskId,
      'ctx-multi-pause',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute workflow
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Get workflow task ID
    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
      (u) => 'status' in u && u.status.message && 'referenceTaskIds' in u.status.message,
    );
    const workflowTaskId =
      refUpdate && 'status' in refUpdate
        ? (refUpdate.status.message as any)?.referenceTaskIds?.[0]
        : undefined;
    expect(workflowTaskId).toBeDefined();

    // Then: First pause state
    let state = workflowRuntime.getTaskState(workflowTaskId);
    expect(state?.state).toBe('input-required');

    // When: First resume
    await workflowRuntime.resumeWorkflow(workflowTaskId, { config: 'test-config' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: Second pause state
    state = workflowRuntime.getTaskState(workflowTaskId);
    expect(state?.state).toBe('input-required');

    // When: Second resume
    await workflowRuntime.resumeWorkflow(workflowTaskId, { data: { value: 'test-data' } });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: Completed state
    state = workflowRuntime.getTaskState(workflowTaskId);
    expect(state?.state).toBe('completed');

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(workflowTaskId);
    expect(childBus).toBeDefined();

    // Verify artifacts were emitted via child event bus
    const workflowArtifacts = childBus!.findEventsByKind('artifact-update');

    // Verify all 5 artifacts were emitted
    expect(workflowArtifacts.length).toBe(5);

    // Verify artifact names
    const artifactNames = workflowArtifacts
      .map((a) => ('artifact' in a ? a.artifact.name : undefined))
      .filter(Boolean);
    expect(artifactNames).toContain('phase-1-start.json');
    expect(artifactNames).toContain('phase-1-complete.json');
    expect(artifactNames).toContain('phase-2-start.json');
    expect(artifactNames).toContain('phase-2-complete.json');
    expect(artifactNames).toContain('final-result.json');
  });

  it('should continue workflow events after parent task completes', async () => {
    // Given: Long-running workflow
    const longRunningPlugin = createTestWorkflowPlugin('long-runner', {
      progressUpdates: 10,
      delay: 100, // 100ms between updates = 1 second total
    });
    workflowRuntime.register(longRunningPlugin);

    // Given: AI that completes quickly
    aiService.setSimpleResponse([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'dispatch_workflow_long_runner',
        args: {},
      },
      {
        type: 'text-delta',
        textDelta: 'Workflow started.',
      },
    ]);

    const executor = createAgentExecutor(
      workflowRuntime,
      aiService as unknown as AIService,
      sessionManager as unknown as SessionManager,
      eventBusManager,
      taskStore,
    );

    const parentTaskId = 'task-parent-continues';
    const requestContext = createSimpleRequestContext(
      'Long workflow',
      parentTaskId,
      'ctx-continues',
    );

    // Create event bus for parent task via the manager
    const eventBus = eventBusManager.createOrGetByTaskId(parentTaskId);

    // When: Execute
    await executor.execute(requestContext, eventBus);

    // Wait for parent to complete (should be quick)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the parent bus recording
    const parentBus = eventBusManager.getRecordingBus(parentTaskId);
    expect(parentBus).toBeDefined();

    // Then: Parent should be completed
    const statusUpdates = parentBus!.findEventsByKind('status-update');
    const parentComplete = statusUpdates.find(
      (u) =>
        'taskId' in u &&
        'status' in u &&
        u.taskId === parentTaskId &&
        u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();

    // Get workflow task ID
    const refUpdate = statusUpdates.find(
      (u) => 'status' in u && u.status.message && 'referenceTaskIds' in u.status.message,
    );
    const workflowTaskId =
      refUpdate && 'status' in refUpdate
        ? (refUpdate.status.message as any)?.referenceTaskIds?.[0]
        : undefined;
    expect(workflowTaskId).toBeDefined();

    // Then: Workflow should still be running
    let state = workflowRuntime.getTaskState(workflowTaskId);
    expect(state?.state).toBe('working');

    // Get the child bus recording
    const childBus = eventBusManager.getRecordingBus(workflowTaskId);
    expect(childBus).toBeDefined();

    // Get initial artifact count from child event bus
    const initialArtifacts = childBus!.findEventsByKind('artifact-update');
    const artifactsAtParentComplete = initialArtifacts.length;

    // Wait more time for workflow to continue
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Then: Workflow should have made progress after parent completed
    state = workflowRuntime.getTaskState(workflowTaskId);

    // Check artifacts via child event bus
    const progressArtifacts = childBus!.findEventsByKind('artifact-update');
    const artifactsAfterDelay = progressArtifacts.length;
    expect(artifactsAfterDelay).toBeGreaterThan(artifactsAtParentComplete);

    // Wait for workflow to complete
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Then: Workflow should be completed independently
    state = workflowRuntime.getTaskState(workflowTaskId);
    expect(state?.state).toBe('completed');

    // Verify all artifacts via child event bus
    const finalArtifacts = childBus!.findEventsByKind('artifact-update');
    expect(finalArtifacts.length).toBe(10); // All artifacts
  });
});
