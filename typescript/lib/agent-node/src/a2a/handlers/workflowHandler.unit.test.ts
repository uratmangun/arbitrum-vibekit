/**
 * Unit tests for WorkflowHandler
 */

import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecordingEventBus } from '../../../tests/utils/mocks/event-bus.mock.js';
import type { WorkflowRuntime } from '../../workflows/runtime.js';

type MockedFn<T extends (...args: unknown[]) => unknown> = ReturnType<typeof vi.fn<T>>;

type EventBusDouble = {
  publish: MockedFn<(event: unknown) => void>;
  finished: MockedFn<() => void>;
  on: MockedFn<() => EventBusDouble>;
  off: MockedFn<() => EventBusDouble>;
  once: MockedFn<() => EventBusDouble>;
  removeAllListeners: MockedFn<() => EventBusDouble>;
};

type LoggerDouble = {
  debug: MockedFn<() => void>;
  info: MockedFn<() => void>;
  error: MockedFn<() => void>;
};

type LoggerModuleDouble = {
  Logger: {
    getInstance: MockedFn<(...args: unknown[]) => LoggerDouble>;
  };
};

function loggerMockFactory(): LoggerModuleDouble {
  return {
    Logger: {
      getInstance: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      })),
    },
  };
}

vi.mock('../../utils/logger.js', loggerMockFactory);

const createEventBus = (): EventBusDouble => {
  const eventBus: EventBusDouble = {
    publish: vi.fn(),
    finished: vi.fn(),
    on: vi.fn<() => EventBusDouble>(() => eventBus),
    off: vi.fn<() => EventBusDouble>(() => eventBus),
    once: vi.fn<() => EventBusDouble>(() => eventBus),
    removeAllListeners: vi.fn<() => EventBusDouble>(() => eventBus),
  };
  return eventBus;
};

describe('WorkflowHandler.dispatchWorkflow (unit)', () => {
  let eventBus: EventBusDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('returns task ID and metadata when workflow is successfully dispatched', async () => {
    // Given: A workflow runtime with a registered plugin
    const mockExecution = {
      id: 'task-wf-123',
      pluginId: 'token_swap',
      state: 'working',
      metadata: { source: 'test' },
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'token_swap',
      name: 'Token Swap',
      description: 'Execute token swaps on DEXs',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime);

    // When: A workflow is dispatched
    const result = await handler.dispatchWorkflow(
      'dispatch_workflow_token_swap',
      { fromToken: 'ETH', toToken: 'USDC' },
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return task ID and metadata
    expect(result).toEqual({
      taskId: 'task-wf-123',
      metadata: {
        workflowName: 'Token Swap',
        description: 'Execute token swaps on DEXs',
        pluginId: 'token_swap',
      },
    });

    // And: Should have called getPlugin with correct plugin ID
    expect(mockRuntime.getPlugin).toHaveBeenCalledWith('token_swap');

    // And: Should have dispatched the workflow
    expect(mockRuntime.dispatch).toHaveBeenCalledWith('token_swap', {
      fromToken: 'ETH',
      toToken: 'USDC',
      contextId: 'ctx-test',
    });
  });

  it('uses default description when plugin has no description', async () => {
    // Given: A plugin without a description field
    const mockExecution = {
      id: 'task-wf-456',
      pluginId: 'simple_plugin',
      state: 'working',
      metadata: {},
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'simple_plugin',
      name: 'Simple Plugin',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime);

    // When: Workflow is dispatched
    const result = await handler.dispatchWorkflow(
      'dispatch_workflow_simple_plugin',
      {},
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should use default description format
    expect(result.metadata.description).toBe('Dispatch Simple Plugin workflow');
  });

  it('throws error when workflow runtime is not available', async () => {
    // Given: A handler without workflow runtime
    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(undefined);

    // When/Then: Dispatching should throw
    await expect(
      handler.dispatchWorkflow(
        'dispatch_workflow_test',
        {},
        'ctx-test',
        eventBus as unknown as ExecutionEventBus,
      ),
    ).rejects.toThrow('Workflow runtime not available');
  });

  it('throws error when plugin is not found', async () => {
    // Given: A runtime that returns undefined for getPlugin
    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(undefined),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime);

    // When/Then: Dispatching should throw
    await expect(
      handler.dispatchWorkflow(
        'dispatch_workflow_nonexistent',
        {},
        'ctx-test',
        eventBus as unknown as ExecutionEventBus,
      ),
    ).rejects.toThrow('Plugin nonexistent not found');
  });

  it('publishes task and status events to event bus', async () => {
    // Given: A recording event bus to capture events
    const recordingBus = new RecordingEventBus();

    // Given: A workflow runtime with a registered plugin
    const mockExecution = {
      id: 'task-wf-789',
      pluginId: 'lending',
      state: 'working',
      metadata: { protocol: 'aave' },
      waitForCompletion: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
      getArtifacts: vi.fn().mockReturnValue([]),
      getError: vi.fn().mockReturnValue(undefined),
      getPauseInfo: vi.fn().mockReturnValue(undefined),
      resume: vi.fn(),
    };

    const mockPlugin = {
      id: 'lending',
      name: 'Lending Protocol',
      description: 'Manage lending positions',
      version: '1.0.0',
      execute: vi.fn(),
    };

    const mockRuntime: Partial<WorkflowRuntime> = {
      getPlugin: vi.fn().mockReturnValue(mockPlugin),
      dispatch: vi.fn().mockReturnValue(mockExecution),
      cancelExecution: vi.fn(),
    };

    const { WorkflowHandler } = await import('./workflowHandler.js');
    const handler = new WorkflowHandler(mockRuntime as WorkflowRuntime);

    // When: A workflow is dispatched
    await handler.dispatchWorkflow(
      'dispatch_workflow_lending',
      { amount: 1000 },
      'ctx-lending',
      recordingBus as unknown as ExecutionEventBus,
    );

    // Then: Should publish task event with submitted state
    const taskEvents = recordingBus.findEventsByKind('task');
    expect(taskEvents.length).toBeGreaterThan(0);

    const taskEvent = taskEvents.find((event) => 'id' in event && event.id === 'task-wf-789');
    expect(taskEvent).toBeDefined();
    if (taskEvent && 'status' in taskEvent) {
      expect(taskEvent.status.state).toBe('submitted');
    }

    // And: Should publish working status update
    const statusUpdates = recordingBus.findEventsByKind('status-update');
    const workingUpdate = statusUpdates.find(
      (event) =>
        'taskId' in event &&
        event.taskId === 'task-wf-789' &&
        'status' in event &&
        event.status.state === 'working',
    );

    expect(workingUpdate).toBeDefined();
  });
});
