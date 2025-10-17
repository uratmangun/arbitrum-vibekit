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
import { RecordingRealEventBus } from './utils/mocks/event-bus.mock.js';
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

  beforeEach(() => {
    workflowRuntime = new WorkflowRuntime();
    aiService = new StubAIService();
    sessionManager = new MockSessionManager();
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

    const parentTaskId = 'task-parent';
    const requestContext = createSimpleRequestContext('Execute a trade', parentTaskId, 'ctx-test');

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

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

    const parentTaskId = 'task-parent-2';
    const requestContext = createSimpleRequestContext(
      'Start lending operation',
      parentTaskId,
      'ctx-parallel',
    );

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

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

    const parentTaskId = 'task-parent-multi';
    const requestContext = createSimpleRequestContext(
      'Execute multiple workflows',
      parentTaskId,
      'ctx-multi',
    );

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

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

    const parentTaskId = 'task-parent-error';
    const requestContext = createSimpleRequestContext(
      'Execute failing workflow',
      parentTaskId,
      'ctx-error',
    );

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

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
            name: 'pre-pause.json',
            mimeType: 'application/json',
            data: { stage: 'before-pause' },
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
          inputSchema: {
            type: 'object',
            properties: {
              data: { type: 'string' },
            },
          },
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
    );

    const parentTaskId = 'task-parent-pause';
    const requestContext = createSimpleRequestContext('Start workflow', parentTaskId, 'ctx-pause');

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

    // When: Message is processed and workflow pauses
    await executor.execute(requestContext, eventBus);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Then: Parent task should complete
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const parentComplete = statusUpdates.find(
      (u) => 'taskId' in u && u.taskId === 'task-parent-pause' && u.status.state === 'completed',
    );
    expect(parentComplete).toBeDefined();

    // And: Child workflow should be paused
    const childPaused = statusUpdates.find(
      (u) =>
        'taskId' in u &&
        u.taskId !== 'task-parent-pause' &&
        'contextId' in u &&
        u.contextId === 'ctx-pause' &&
        u.status.state === 'input-required',
    );
    expect(childPaused).toBeDefined();

    // And: Artifact should be emitted before pause
    const artifacts = eventBus.findEventsByKind('artifact-update');
    const prePauseArtifact = artifacts.find((a) => 'artifact' in a && a.artifact.artifactId);
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
            name: 'pre-pause',
            mimeType: 'application/json',
            data: { stage: 1 },
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
          inputSchema: {
            type: 'object',
            properties: {},
          },
        };

        // Artifact after resume
        yield {
          type: 'artifact',
          artifact: {
            name: 'post-resume',
            mimeType: 'application/json',
            data: { stage: 2, input },
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
    );

    const parentTaskId = 'task-parent-artifacts';
    const requestContext = createSimpleRequestContext(
      'Test artifacts',
      parentTaskId,
      'ctx-artifacts',
    );

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

    // When: Execute and wait for pause
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const artifactsBefore = eventBus.findEventsByKind('artifact-update');
    const artifactsBeforeCount = artifactsBefore.length;
    expect(artifactsBeforeCount).toBeGreaterThanOrEqual(1);

    // When: Get workflow task ID from referenceTaskIds
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
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

      // Resume the workflow using the proper method
      // This will trigger event listeners that publish artifacts
      await workflowRuntime.resumeWorkflow(workflowTaskId, {});

      // Wait for artifacts to be emitted asynchronously
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Then: More artifacts should be emitted after resume
      const artifactsAfter = eventBus.findEventsByKind('artifact-update');
      const artifactsAfterCount = artifactsAfter.length;

      console.log('Artifacts before:', artifactsBeforeCount);
      console.log('Artifacts after:', artifactsAfterCount);
      console.log(
        'All events:',
        eventBus.published.map((e) => e.kind),
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
    );

    const parentTaskId = 'task-parent-isolation';
    const requestContext = createSimpleRequestContext(
      'Test isolation',
      parentTaskId,
      'ctx-isolation',
    );

    // Create real SDK event bus for this task
    const eventBus = new RecordingRealEventBus(parentTaskId);

    // When: Execute workflow dispatch
    await executor.execute(requestContext, eventBus);
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Then: Extract workflow task ID from referenceTaskIds
    const statusUpdates = eventBus.findEventsByKind('status-update');
    const refUpdate = statusUpdates.find(
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

    // Then: Validate event isolation by taskId
    const allArtifacts = eventBus.findEventsByKind('artifact-update');

    // Parent task may have its own artifacts (e.g., tool-call artifacts)
    // but should NOT receive workflow progress artifacts
    const parentArtifacts = allArtifacts.filter((a) => 'taskId' in a && a.taskId === parentTaskId);

    // Parent artifacts should be tool-call artifacts, not workflow progress artifacts
    const parentToolCallArtifacts = parentArtifacts.filter((a) =>
      a.artifact.artifactId?.startsWith('tool-call-'),
    );
    expect(parentToolCallArtifacts.length).toBeGreaterThan(0); // Parent should have tool-call artifact

    // All parent artifacts should be tool-call artifacts (no workflow progress artifacts)
    expect(parentArtifacts.length).toBe(parentToolCallArtifacts.length);

    // Workflow task stream: should contain workflow artifacts
    const workflowArtifacts = allArtifacts.filter(
      (a) => 'taskId' in a && a.taskId === workflowTaskId,
    );
    expect(workflowArtifacts.length).toBeGreaterThan(0); // Workflow should have artifacts

    // Validate structure of workflow artifacts
    workflowArtifacts.forEach((artifact) => {
      expect(artifact).toMatchObject({
        kind: 'artifact-update',
        taskId: workflowTaskId,
        contextId: 'ctx-isolation',
        artifact: expect.any(Object),
      });
    });

    // Validate that parent and workflow status updates are on different task streams
    const parentStatusUpdates = statusUpdates.filter(
      (u) => 'taskId' in u && u.taskId === parentTaskId,
    );
    const workflowStatusUpdates = statusUpdates.filter(
      (u) => 'taskId' in u && u.taskId === workflowTaskId,
    );

    expect(parentStatusUpdates.length).toBeGreaterThan(0);
    expect(workflowStatusUpdates.length).toBeGreaterThan(0);
  });
});
