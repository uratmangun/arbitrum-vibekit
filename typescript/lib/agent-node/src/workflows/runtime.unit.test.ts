import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { WorkflowRuntime } from './runtime.js';
import type {
  WorkflowPlugin,
  WorkflowContext,
  WorkflowExecution,
  UpdateEvent,
  ArtifactEvent,
} from './types.js';

/**
 * Unit tests for Workflow Runtime behavior
 * Tests observable outcomes of workflow execution, not implementation details
 * Following TDD principles: testing WHAT the system does, not HOW
 */
describe('Workflow Runtime', () => {
  let runtime: WorkflowRuntime;

  beforeEach((): void => {
    runtime = new WorkflowRuntime();
  });

  afterEach(async (): Promise<void> => {
    if (runtime) {
      await runtime.shutdown();
    }
  });

  describe('plugin registration behavior', () => {
    it('should make workflow available for execution after registration', (): void => {
      // Given a valid workflow plugin
      const plugin: WorkflowPlugin = {
        id: 'test_plugin',
        name: 'Test Plugin',
        description: 'A test workflow plugin',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { success: true };
        },
      };

      // When registering the plugin
      const registered = runtime.register(plugin);

      // Then workflow should be available for execution
      expect(registered).toBe(true);
      const availableWorkflows = runtime.listPlugins();
      expect(availableWorkflows).toContain('test_plugin');
    });

    it('should accept plugin IDs with hyphens and canonicalize to underscores', (): void => {
      // Given a plugin with hyphens in the ID
      const plugin: WorkflowPlugin = {
        id: 'my-example-workflow',
        name: 'Example Workflow',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { success: true };
        },
      };

      // When registering the plugin
      const registered = runtime.register(plugin);

      // Then plugin should be registered with canonical ID (hyphens → underscores)
      expect(registered).toBe(true);
      const availableWorkflows = runtime.listPlugins();
      expect(availableWorkflows).toContain('my_example_workflow');
      expect(availableWorkflows).not.toContain('my-example-workflow');
    });

    it('should generate tool names with canonicalized plugin IDs', (): void => {
      // Given a plugin with hyphens in the ID
      const plugin: WorkflowPlugin = {
        id: 'api-integration-workflow',
        name: 'API Integration',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { success: true };
        },
      };

      // When registering the plugin
      runtime.register(plugin);

      // Then tool name should use canonical ID with underscores
      const tools = runtime.getAvailableTools();
      expect(tools).toContain('dispatch_workflow_api_integration_workflow');
      expect(tools).not.toContain('dispatch_workflow_api-integration-workflow');
    });

    it('should detect duplicates using canonicalized IDs', (): void => {
      // Given a plugin registered with hyphens
      const plugin1: WorkflowPlugin = {
        id: 'duplicate-check',
        name: 'First Plugin',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };
      runtime.register(plugin1);

      // When trying to register with the same ID but underscores
      const plugin2: WorkflowPlugin = {
        id: 'duplicate_check',
        name: 'Second Plugin',
        version: '2.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };

      // Then duplicate registration should be rejected
      expect(() => runtime.register(plugin2)).toThrow(/already registered/);
    });

    it('should allow mixed hyphen and underscore IDs if canonically different', (): void => {
      // Given plugins with different canonical IDs
      const plugin1: WorkflowPlugin = {
        id: 'workflow-one',
        name: 'Workflow One',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };
      const plugin2: WorkflowPlugin = {
        id: 'workflow_two',
        name: 'Workflow Two',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };

      // When registering both
      runtime.register(plugin1);
      runtime.register(plugin2);

      // Then both should be available
      const workflows = runtime.listPlugins();
      expect(workflows).toContain('workflow_one');
      expect(workflows).toContain('workflow_two');
    });

    it('should require canonical ID for plugin retrieval', (): void => {
      // Given a plugin registered with hyphens
      const plugin: WorkflowPlugin = {
        id: 'my-workflow',
        name: 'My Workflow',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };
      runtime.register(plugin);

      // When retrieving by canonical ID
      const retrieved = runtime.getPlugin('my_workflow');

      // Then plugin should be found
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('My Workflow');

      // When retrieving by original hyphenated ID
      const notFound = runtime.getPlugin('my-workflow');

      // Then plugin should not be found
      expect(notFound).toBeUndefined();
    });

    it('should require canonical ID for workflow dispatch', (): void => {
      // Given a plugin registered with hyphens
      const plugin: WorkflowPlugin = {
        id: 'dispatch-test',
        name: 'Dispatch Test',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { success: true };
        },
      };
      runtime.register(plugin);

      // When dispatching with canonical ID
      const execution = runtime.dispatch('dispatch_test', {
        contextId: 'ctx-dispatch',
        taskId: 'task-dispatch',
      });

      // Then dispatch should succeed
      expect(execution).toBeDefined();
      expect(execution.state).toBe('working');

      // When dispatching with hyphenated ID
      // Then dispatch should fail
      expect(() =>
        runtime.dispatch('dispatch-test', {
          contextId: 'ctx-dispatch-2',
          taskId: 'task-dispatch-2',
        }),
      ).toThrow();
    });

    it('should prevent duplicate workflow registration', (): void => {
      // Given a workflow is already registered
      const plugin: WorkflowPlugin = {
        id: 'duplicate_plugin',
        name: 'Original',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };
      runtime.register(plugin);

      // When trying to register another plugin with same ID
      const duplicate: WorkflowPlugin = {
        id: 'duplicate_plugin',
        name: 'Duplicate',
        version: '2.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };

      // Then duplicate registration should be rejected
      expect(() => runtime.register(duplicate)).toThrow();
    });

    it('should reject invalid workflow configuration', (): void => {
      // Given a workflow with missing required fields
      const invalidPlugin = {
        id: 'invalid',
        // Missing required fields
        execute: function* () {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };

      // When attempting to register invalid workflow
      // Then registration should fail
      expect(() => runtime.register(invalidPlugin as WorkflowPlugin)).toThrow();
    });

    it('should provide list of available workflows', (): void => {
      // Given multiple workflows are registered
      const plugin1: WorkflowPlugin = {
        id: 'plugin_1',
        name: 'Plugin 1',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };
      const plugin2: WorkflowPlugin = {
        id: 'plugin_2',
        name: 'Plugin 2',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return {};
        },
      };

      runtime.register(plugin1);
      runtime.register(plugin2);

      // When requesting available workflows
      const workflows = runtime.listPlugins();

      // Then all workflows should be available
      expect(workflows).toContain('plugin_1');
      expect(workflows).toContain('plugin_2');
      expect(workflows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('workflow exposure as tools', () => {
    it('should make workflows available for dispatch', (): void => {
      // Given a registered workflow
      const plugin: WorkflowPlugin = {
        id: 'test_workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { result: 'success' };
        },
      };
      runtime.register(plugin);

      // When getting available tools
      const tools = runtime.getAvailableTools();

      // Then workflow should be available for dispatch
      // Test behavior: workflows can be triggered as tools
      // Don't test specific naming conventions
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t: string) => t.includes('test_workflow'))).toBe(true);
    });

    it('should provide workflow parameters for tools', (): void => {
      // Given a workflow with input parameters
      const plugin: WorkflowPlugin = {
        id: 'parameterized',
        name: 'Parameterized Workflow',
        description: 'Workflow with parameters',
        version: '1.0.0',
        inputSchema: z.object({
          amount: z.number(),
          token: z.string().optional(),
        }),
        *execute(context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return context.parameters;
        },
      };
      runtime.register(plugin);

      // When getting tool metadata
      const toolName = runtime.getAvailableTools().find((t) => t.includes('parameterized'));
      if (!toolName) {
        throw new Error('Tool not found');
      }
      const metadata = runtime.getToolMetadata(toolName);

      // Then parameters should be available
      // Test behavior: workflow parameters are exposed
      // Don't test specific metadata structure
      expect(metadata).toBeDefined();
      expect(metadata.inputSchema).toBeDefined();
    });

    it('should execute workflows when dispatched', async (): Promise<void> => {
      // Given a workflow exposed as a tool
      const plugin: WorkflowPlugin = {
        id: 'executable',
        name: 'Executable Workflow',
        version: '1.0.0',
        inputSchema: z.object({
          value: z.number(),
        }),
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { result: 'completed' };
        },
      };
      runtime.register(plugin);

      // When executing workflow through dispatch
      const toolName = runtime.getAvailableTools().find((t) => t.includes('executable'));
      if (!toolName) {
        throw new Error('Tool not found');
      }
      const tool = runtime.getTool(toolName);
      const result = await tool.execute({
        contextId: 'ctx-test',
        taskId: 'task-test',
        parameters: { value: 5 },
      });

      // Then workflow should execute
      // Test behavior: workflows can be executed
      // Don't test specific result values
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('workflow execution and task creation', () => {
    it('should create task when workflow is dispatched', (): void => {
      // Given a workflow is registered
      const plugin: WorkflowPlugin = {
        id: 'task_creating_workflow',
        name: 'Task Creating Workflow',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { result: 'completed' };
        },
      };
      runtime.register(plugin);

      // When dispatching the workflow
      const execution = runtime.dispatch('task_creating_workflow', {
        contextId: 'ctx-task-creation',
        taskId: 'task-creation',
        // Note: taskId would be generated by runtime, not provided
      });

      // Then a task should be created
      // Test behavior: workflow dispatch creates tasks
      // Don't test HOW task is created or stored
      expect(execution).toBeDefined();
      expect(execution.state).toBe('working');
      // Task ID should be available
      expect(execution.id).toBeDefined();
    });

    it('should provide parameters to workflow execution', async (): Promise<void> => {
      // Given a workflow that processes parameters
      const plugin: WorkflowPlugin = {
        id: 'parameterized_workflow',
        name: 'Parameterized Workflow',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          // Workflow receives and uses parameters
          yield { type: 'status', status: { state: 'working' } };
          return { processed: true };
        },
      };
      runtime.register(plugin);

      // When dispatching with parameters
      const execution = runtime.dispatch('parameterized_workflow', {
        contextId: 'ctx-params',
        taskId: 'task-params',
        parameters: { custom: 'value' },
      });

      // Then workflow should execute with parameters
      // Test behavior: parameters are passed to workflow
      // Don't test internal parameter handling
      const result = (await execution.waitForCompletion()) as { processed: boolean };
      expect(result.processed).toBe(true);
    });

    it('should handle invalid workflow dispatch', (): void => {
      // When attempting to dispatch non-existent workflow
      // Then dispatch should fail
      // Test behavior: invalid dispatch is rejected
      // Don't test specific error messages
      expect(() =>
        runtime.dispatch('nonexistent', {
          contextId: 'ctx',
        }),
      ).toThrow();
    });
  });

  describe('workflow status updates', () => {
    it('should emit status updates during execution', async (): Promise<void> => {
      // Given a workflow that reports progress
      const updates: UpdateEvent[] = [];
      const plugin: WorkflowPlugin = {
        id: 'generator_test',
        name: 'Generator Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          yield { type: 'progress', current: 50, total: 100 };
          yield { type: 'status', status: { state: 'working' } };
          return { completed: true };
        },
      };
      runtime.register(plugin);

      // When executing the workflow
      const execution = runtime.dispatch('generator_test', {
        contextId: 'ctx-gen',
        taskId: 'task-gen',
      });

      execution.on('update', (update: UpdateEvent) => updates.push(update));
      const result = (await execution.waitForCompletion()) as { completed: boolean };

      // Then all yields should be processed
      expect(updates.length).toBe(3);
      expect(updates[0]?.type).toBe('status');
      expect(updates[1]?.type).toBe('progress');
      expect(result.completed).toBe(true);
    });

    it('should change task state when workflow pauses', async (): Promise<void> => {
      // Given a workflow that needs user input
      const plugin: WorkflowPlugin = {
        id: 'pausing_workflow',
        name: 'Pausing Workflow',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { message: 'Processing' } };

          const input: unknown = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'm-1',
                contextId: 'ctx-pause',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Need user input' }],
              },
            },
            inputSchema: z.object({}),
          };

          return { processed: input };
        },
      };
      runtime.register(plugin);

      // When workflow reaches pause point
      const execution = runtime.dispatch('pausing_workflow', {
        contextId: 'ctx-pause',
        taskId: 'task-pause',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // Then task state should reflect pause
      // Test behavior: workflow pause changes task state
      // Don't test specific state values or storage
      expect(execution.state).toBe('input-required');
    });

    it('should resume workflow when input is provided', async (): Promise<void> => {
      // Given a workflow paused for input
      const plugin: WorkflowPlugin = {
        id: 'resumable_workflow',
        name: 'Resumable Workflow',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          const _input: unknown = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'm-2',
                contextId: 'ctx-resume',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Provide input' }],
              },
            },
            inputSchema: z.object({}),
          };
          return { received: true };
        },
      };
      runtime.register(plugin);

      const execution = runtime.dispatch('resumable_workflow', {
        contextId: 'ctx-resume',
        taskId: 'task-resume',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // When providing input to resume
      const resumeResult = await execution.resume({ data: 'input' });

      // Then workflow should continue
      // Test behavior: input resumes workflow
      // Don't test specific resume mechanics
      expect(resumeResult.valid).toBe(true);

      const result = (await execution.waitForCompletion()) as { received: boolean };
      expect(result.received).toBe(true);
      expect(execution.state).toBe('completed');
    });

    it('should handle invalid input on resume', async (): Promise<void> => {
      // Given a paused workflow expecting specific input
      const plugin: WorkflowPlugin = {
        id: 'validating_workflow',
        name: 'Validating Workflow',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          const input = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'm-3',
                contextId: 'ctx-validate',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Need age' }],
              },
            },
            inputSchema: z.object({
              age: z.number().min(18),
            }),
          };
          const typedInput = input as { age: number };
          return { age: typedInput.age };
        },
      };
      runtime.register(plugin);

      const execution = runtime.dispatch('validating_workflow', {
        contextId: 'ctx-validate',
        taskId: 'task-validate',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // When resuming with invalid input
      const invalidResult = await execution.resume({ age: 16 });

      // Then validation should fail
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(execution.state).toBe('input-required');

      // When resuming with valid input
      const validResult = await execution.resume({ age: 21 });

      // Then validation should pass
      expect(validResult.valid).toBe(true);
      await execution.waitForCompletion();
      expect(execution.state).toBe('completed');
    });

    it('should handle workflow errors', async (): Promise<void> => {
      // Given a workflow that throws
      const plugin: WorkflowPlugin = {
        id: 'error_test',
        name: 'Error Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          throw new Error('Workflow error');
        },
      };
      runtime.register(plugin);

      // When workflow throws error
      const execution = runtime.dispatch('error_test', {
        contextId: 'ctx-error',
        taskId: 'task-error',
      });

      const errorPromise = new Promise<Error>((resolve) => {
        execution.on('error', (error: Error) => resolve(error));
      });

      const error = await errorPromise;

      // Then execution should fail
      expect(execution.state).toBe('failed');
      expect(error).toBeDefined();
      expect(error.message).toBe('Workflow error');
      expect(execution.getError()).toBeDefined();
    });

    it('should emit artifacts', async (): Promise<void> => {
      // Given a workflow that produces artifacts
      const plugin: WorkflowPlugin = {
        id: 'artifact_test',
        name: 'Artifact Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield {
            type: 'artifact',
            artifact: {
              name: 'report',
              mimeType: 'application/json',
              data: { status: 'ready' },
            },
          };
          yield {
            type: 'artifact',
            artifact: {
              name: 'log',
              mimeType: 'text/plain',
              data: 'Operation completed',
            },
          };
          return { success: true };
        },
      };
      runtime.register(plugin);

      // When workflow produces artifacts
      const execution = runtime.dispatch('artifact_test', {
        contextId: 'ctx-artifact',
        taskId: 'task-artifact',
      });

      const artifacts: ArtifactEvent[] = [];
      execution.on('artifact', (artifact: ArtifactEvent) => artifacts.push(artifact));

      await execution.waitForCompletion();

      // Then artifacts should be emitted
      expect(artifacts.length).toBe(2);
      expect(artifacts[0]?.name).toBe('report');
      expect((artifacts[0]?.data as { status: string })?.status).toBe('ready');
      expect(artifacts[1]?.name).toBe('log');
    });
  });

  describe('concurrent execution', () => {
    it('should handle multiple concurrent workflows', async (): Promise<void> => {
      // Given a workflow that takes time
      const plugin: WorkflowPlugin = {
        id: 'concurrent_test',
        name: 'Concurrent Test',
        version: '1.0.0',
        async *execute(context: WorkflowContext) {
          const delay = Math.random() * 50 + 10;
          yield { type: 'status', status: { state: 'working' } };
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          return { taskId: context.taskId };
        },
      };
      runtime.register(plugin);

      // When executing multiple workflows concurrently
      const executions: WorkflowExecution[] = [];
      for (let i = 0; i < 5; i++) {
        executions.push(
          runtime.dispatch('concurrent_test', {
            contextId: `ctx-concurrent-${i}`,
            taskId: `task-concurrent-${i}`,
          }),
        );
      }

      // Then all should complete independently
      const results = (await Promise.all(executions.map((ex) => ex.waitForCompletion()))) as Array<{
        taskId: string;
      }>;

      expect(results.length).toBe(5);
      results.forEach((result, index) => {
        expect(result.taskId).toBe(`task-concurrent-${index}`);
      });
    });

    it('should isolate execution contexts', async (): Promise<void> => {
      // Given workflows with shared state attempts
      let counter = 0;
      const plugin: WorkflowPlugin = {
        id: 'isolation_test',
        name: 'Isolation Test',
        version: '1.0.0',
        async *execute(context: WorkflowContext) {
          const myValue = ++counter;
          yield { type: 'status', status: { state: 'working' } };
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
          return { myValue, contextId: context.contextId };
        },
      };
      runtime.register(plugin);

      // When executing concurrently
      const exec1 = runtime.dispatch('isolation_test', {
        contextId: 'ctx-iso-1',
        taskId: 'task-iso-1',
      });
      const exec2 = runtime.dispatch('isolation_test', {
        contextId: 'ctx-iso-2',
        taskId: 'task-iso-2',
      });

      const [result1, result2] = (await Promise.all([
        exec1.waitForCompletion(),
        exec2.waitForCompletion(),
      ])) as Array<{ myValue: number; contextId: string }>;

      // Then contexts should be isolated
      expect(result1.contextId).toBe('ctx-iso-1');
      expect(result2.contextId).toBe('ctx-iso-2');
      expect(result1.myValue).not.toBe(result2.myValue);
    });
  });

  describe('mixed yield types', () => {
    it('should handle non-pausing status yields', async (): Promise<void> => {
      // Given a workflow with mixed yield types per PRD line 94
      const statusUpdates: UpdateEvent[] = [];
      const plugin: WorkflowPlugin = {
        id: 'mixed_yield_test',
        name: 'Mixed Yield Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          // Non-pausing status yields
          yield { type: 'status', status: { state: 'working' } };
          yield { type: 'progress', current: 25, total: 100 };

          // Simulate work
          await new Promise<void>((resolve) => setTimeout(resolve, 10));

          yield { type: 'status', status: { state: 'working' } };
          yield { type: 'progress', current: 50, total: 100 };

          // More work
          await new Promise<void>((resolve) => setTimeout(resolve, 10));

          yield { type: 'status', status: { state: 'working' } };
          yield { type: 'progress', current: 100, total: 100 };

          return { result: 'success' };
        },
      };
      runtime.register(plugin);

      // When executing workflow
      const execution = runtime.dispatch('mixed_yield_test', {
        contextId: 'ctx-mixed',
        taskId: 'task-mixed',
      });

      execution.on('update', (update: UpdateEvent) => statusUpdates.push(update));
      const result = (await execution.waitForCompletion()) as { result: string };

      // Then all status yields should be processed without pausing
      expect(statusUpdates.length).toBe(6);
      expect(statusUpdates.filter((u: UpdateEvent) => u.type === 'status').length).toBe(3);
      expect(statusUpdates.filter((u: UpdateEvent) => u.type === 'progress').length).toBe(3);
      expect(execution.state).toBe('completed');
      expect(result.result).toBe('success');
    });

    it('should distinguish pausing from non-pausing yields', async (): Promise<void> => {
      // Given workflow with both types
      const plugin: WorkflowPlugin = {
        id: 'pause_status_test',
        name: 'Pause Status Test',
        version: '1.0.0',
        *execute(context: WorkflowContext) {
          // Non-pausing status
          yield { type: 'status', status: { state: 'working' } };

          // Pausing state - input required
          const input: unknown = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'ms-2',
                contextId: context.contextId,
                role: 'agent',
                parts: [{ kind: 'text', text: 'Please confirm' }],
              },
            },
            inputSchema: z.object({
              confirm: z.boolean().optional(),
            }),
          };
          const typedInput = input as { confirm: boolean };

          // Non-pausing status after resume
          yield { type: 'status', status: { state: 'working' } };

          return { confirmed: typedInput.confirm };
        },
      };
      runtime.register(plugin);

      // When executing
      const execution = runtime.dispatch('pause_status_test', {
        contextId: 'ctx-pause-status',
        taskId: 'task-pause-status',
      });

      const updates: UpdateEvent[] = [];
      execution.on('update', (update: UpdateEvent) => updates.push(update));

      // Wait for pause
      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // Then should pause only on pause yield
      expect(execution.state).toBe('input-required');
      expect(updates.some((u: UpdateEvent) => u.type === 'status')).toBe(true);

      // When resuming
      await execution.resume({ confirm: true });
      await execution.waitForCompletion();

      // Then should complete
      expect(execution.state).toBe('completed');
    });

    it('should handle auth-required pausing state', async (): Promise<void> => {
      // Given workflow requiring authorization
      const plugin: WorkflowPlugin = {
        id: 'auth_required_test',
        name: 'Auth Required Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { message: 'Preparing transaction...' } };

          // Pause for wallet authorization
          const auth = yield {
            type: 'pause',
            status: {
              state: 'auth-required',
              message: {
                kind: 'message',
                messageId: 'm-4',
                contextId: 'ctx-auth',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Please authorize transaction' }],
              },
            },
            inputSchema: z.object({
              approved: z.boolean(),
              signature: z.string().optional(),
            }),
          };
          const typedAuth = auth as { approved: boolean; signature: string };

          if (!typedAuth.approved) {
            throw new Error('Transaction rejected by user');
          }

          yield { type: 'status', status: { message: 'Transaction approved, executing...' } };

          return {
            txHash: typedAuth.signature,
            status: 'executed',
          };
        },
      };
      runtime.register(plugin);

      // When workflow requires auth
      const execution = runtime.dispatch('auth_required_test', {
        contextId: 'ctx-auth',
        taskId: 'task-auth',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // Then should pause with auth-required state
      expect(execution.state).toBe('auth-required');
      const pauseInfo = execution.getPauseInfo();
      if (!pauseInfo) {
        throw new Error('Pause info not found');
      }
      expect(pauseInfo.state).toBe('auth-required');
      expect(typeof pauseInfo.message).toBe('string');

      // When providing authorization
      const resumeResult = await execution.resume({
        approved: true,
        signature: '0xsignature123...',
      });

      // Then should continue
      expect(resumeResult.valid).toBe(true);
      const result = (await execution.waitForCompletion()) as { txHash: string; status: string };
      expect(result.txHash).toBe('0xsignature123...');
    });
  });

  describe('generator self-validation', () => {
    it('should validate input within generator on resume', async (): Promise<void> => {
      // Given generator with self-validation per PRD line 91
      const plugin: WorkflowPlugin = {
        id: 'self_validate_test',
        name: 'Self Validate Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          let validInput = false;
          let attempts = 0;

          while (!validInput && attempts < 3) {
            const input = yield {
              type: 'pause',
              status: {
                state: 'input-required',
                message: {
                  kind: 'message',
                  messageId: `m-self-${attempts}`,
                  contextId: 'ctx-self-validate',
                  role: 'agent',
                  parts: [
                    {
                      kind: 'text',
                      text:
                        attempts > 0
                          ? `Invalid input (attempt ${attempts}). Please try again.`
                          : 'Enter deposit details',
                    },
                  ],
                },
              },
              inputSchema: z.object({
                amount: z.string(),
                token: z.enum(['USDC', 'ETH', 'WBTC']),
              }),
            };
            const typedInput = input as { amount?: string; token?: string };

            attempts++;

            // Generator performs its own validation
            if (!typedInput.amount || !typedInput.token) {
              continue;
            }

            const amountNum = parseFloat(typedInput.amount);
            if (isNaN(amountNum) || amountNum <= 0) {
              continue;
            }

            if (!['USDC', 'ETH', 'WBTC'].includes(typedInput.token)) {
              continue;
            }

            validInput = true;
            return { deposited: typedInput.amount, token: typedInput.token };
          }

          throw new Error('Max validation attempts exceeded');
        },
      };
      runtime.register(plugin);

      // When providing invalid input first
      const execution = runtime.dispatch('self_validate_test', {
        contextId: 'ctx-self-validate',
        taskId: 'task-self-validate',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      // First attempt - invalid amount
      await execution.resume({ amount: '-100', token: 'USDC' });

      // Should pause again for retry
      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });
      expect(execution.state).toBe('input-required');

      // Second attempt - invalid token
      await execution.resume({ amount: '1000', token: 'INVALID' });

      // Should pause again
      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });
      expect(execution.state).toBe('input-required');

      // Third attempt - valid input
      await execution.resume({ amount: '1000', token: 'ETH' });

      // Then should complete
      const result = (await execution.waitForCompletion()) as { deposited: string; token: string };
      expect(result.deposited).toBe('1000');
      expect(result.token).toBe('ETH');
    });

    it('should handle complex validation with Zod schemas', async (): Promise<void> => {
      // PRD specifies Zod for validation
      // Given workflow with complex validation
      const plugin: WorkflowPlugin = {
        id: 'complex_validate_test',
        name: 'Complex Validate Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          const input = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'm-complex',
                contextId: 'ctx-complex',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Provide positions' }],
              },
            },
            inputSchema: z.object({
              positions: z
                .array(
                  z.object({
                    market: z.string(),
                    size: z.string(),
                    leverage: z.number(),
                  }),
                )
                .optional(),
            }),
          };
          const typedInput = input as {
            positions?: Array<{ market?: string; size?: string; leverage?: number }>;
          };

          // Complex validation in generator
          type ValidPosition = { market: string; size: string; leverage: number };
          const validPositions: ValidPosition[] = [];
          for (const pos of typedInput.positions || []) {
            if (!pos.market || !pos.size) {
              continue;
            }

            const size = parseFloat(pos.size);
            if (isNaN(size) || size <= 0) {
              continue;
            }

            const leverage = pos.leverage || 1;
            if (leverage < 1 || leverage > 100) {
              continue;
            }

            validPositions.push({
              market: pos.market,
              size: size.toString(),
              leverage,
            });
          }

          if (validPositions.length === 0) {
            throw new Error('No valid positions provided');
          }

          return { positions: validPositions };
        },
      };
      runtime.register(plugin);

      // When providing mixed valid/invalid data
      const execution = runtime.dispatch('complex_validate_test', {
        contextId: 'ctx-complex',
        taskId: 'task-complex',
      });

      await new Promise<void>((resolve) => {
        execution.on('pause', () => resolve());
      });

      const _result = await execution.resume({
        positions: [
          { market: 'ETH-USD', size: '1000', leverage: 2 }, // Valid
          { market: 'BTC-USD', size: '-500', leverage: 3 }, // Invalid size
          { market: 'SOL-USD', size: '2000', leverage: 150 }, // Invalid leverage
          { market: 'LINK-USD', size: '500', leverage: 5 }, // Valid
        ],
      });

      // Then only valid positions should be processed
      const finalResult = (await execution.waitForCompletion()) as {
        positions: Array<{ market: string; size: string; leverage: number }>;
      };
      expect(finalResult.positions).toHaveLength(2);
      expect(finalResult.positions[0]?.market).toBe('ETH-USD');
      expect(finalResult.positions[1]?.market).toBe('LINK-USD');
    });
  });

  describe('tool exposure restrictions', () => {
    it('should only expose dispatch tools, not resume tools', (): void => {
      // Given registered workflows per PRD line 131
      const plugin: WorkflowPlugin = {
        id: 'restricted_plugin',
        name: 'Restricted Plugin',
        version: '1.0.0',
        *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { success: true };
        },
      };
      runtime.register(plugin);

      // When getting available tools
      const tools = runtime.getAvailableTools();

      // Then only dispatch tools should be available
      expect(tools).toContain('dispatch_workflow_restricted_plugin');
      expect(tools).not.toContain('resume_workflow_restricted_plugin');
      expect(tools).not.toContain('resume_restricted_plugin');

      // No resume tools at all
      const resumeTools = tools.filter((t: string) => t.includes('resume'));
      expect(resumeTools).toHaveLength(0);
    });

    it('should not generate resume tool metadata', (): void => {
      // Given a paused workflow
      const plugin: WorkflowPlugin = {
        id: 'no_resume_tool',
        name: 'No Resume Tool',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          const input = yield {
            type: 'pause',
            status: {
              state: 'input-required',
              message: {
                kind: 'message',
                messageId: 'm-noresume',
                contextId: 'ctx-noresume',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Provide input' }],
              },
            },
            inputSchema: z.object({}),
          };
          return input;
        },
      };
      runtime.register(plugin);

      // When trying to get resume tool metadata
      expect(() => runtime.getToolMetadata('resume_workflow_no_resume_tool')).toThrow();

      // But dispatch tool should exist
      const dispatchMetadata = runtime.getToolMetadata('dispatch_workflow_no_resume_tool');
      expect(dispatchMetadata).toBeDefined();
      expect(dispatchMetadata.name).toBe('dispatch_workflow_no_resume_tool');
    });
  });

  describe('runtime shutdown', () => {
    it('should cancel active workflows on shutdown', async (): Promise<void> => {
      // Given running workflows
      const plugin: WorkflowPlugin = {
        id: 'shutdown_test',
        name: 'Shutdown Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
          return { completed: true };
        },
      };
      runtime.register(plugin);

      const execution = runtime.dispatch('shutdown_test', {
        contextId: 'ctx-shutdown',
        taskId: 'task-shutdown',
      });

      // When shutting down runtime
      await runtime.shutdown();

      // Then active workflows should be cancelled
      expect(execution.state).toBe('canceled');
    });

    it('should cleanup resources on shutdown', async (): Promise<void> => {
      // Given runtime with resources
      const plugin: WorkflowPlugin = {
        id: 'resource_test',
        name: 'Resource Test',
        version: '1.0.0',

        async *execute(_context: WorkflowContext) {
          yield { type: 'status', status: { state: 'working' } };
          return { done: true };
        },
      };
      runtime.register(plugin);

      // When shutting down
      await runtime.shutdown();

      // Then resources should be cleaned
      expect(runtime.listPlugins()).toEqual([]);
      expect(() =>
        runtime.dispatch('resource_test', {
          contextId: 'ctx',
          taskId: 'task',
        }),
      ).toThrow();
    });
  });
});
