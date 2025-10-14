import { v7 as uuidv7 } from 'uuid';
import type { TaskState } from '@a2a-js/sdk';

import { ensureTransition } from './tasks/stateMachine.js';
import { canonicalizeName } from '../config/validators/tool-validator.js';

import type {
  WorkflowPlugin,
  WorkflowContext,
  WorkflowExecution,
  WorkflowTool,
  ToolMetadata,
  PauseInfo,
  ResumeResult,
  ToolExecutionResult,
  WorkflowState,
} from './types.js';

const isWorkflowState = (value: unknown): value is WorkflowState =>
  typeof value === 'object' && value !== null && 'type' in value;

export class WorkflowRuntime {
  private plugins: Map<string, WorkflowPlugin> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private tools: Map<string, WorkflowTool> = new Map();
  private taskStates: Map<
    string,
    {
      state: string;
      workflowGenerator?: AsyncGenerator;
      pauseInfo?: PauseInfo;
      final?: boolean;
      error?: unknown;
      validationErrors?: unknown[];
    }
  > = new Map();
  private workflowGenerators: Map<string, AsyncGenerator<unknown, unknown, unknown>> = new Map();
  private executionArtifacts: Map<string, unknown[]> = new Map();
  private executionListeners: Map<string, Map<string, Set<(...args: unknown[]) => void>>> =
    new Map();
  private isShuttingDown: boolean = false;
  private concurrentResumeTracking: Map<string, { count: number; primaryIndex: number }> =
    new Map();

  /**
   * Register a workflow plugin
   */
  register(plugin: WorkflowPlugin): boolean {
    // Canonicalize plugin ID (convert hyphens to underscores)
    const canonicalId = canonicalizeName(plugin.id);

    // Check for duplicate IDs
    if (this.plugins.has(canonicalId)) {
      throw new Error(`Plugin with ID ${canonicalId} is already registered`);
    }

    // Validate plugin schema
    if (!this.validatePlugin(plugin)) {
      throw new Error(`Plugin validation failed for ${canonicalId}`);
    }

    // Create canonical version of plugin with canonicalized ID
    const canonicalPlugin: WorkflowPlugin = {
      ...plugin,
      id: canonicalId,
    };

    // Store plugin with canonical ID
    this.plugins.set(canonicalId, canonicalPlugin);

    // Create tool wrapper
    const toolName = `dispatch_workflow_${canonicalId}`;
    const tool: WorkflowTool = {
      execute: async (params: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const contextParams = params as {
          contextId: string;
          taskId?: string;
          parameters?: Record<string, unknown>;
        };
        const execution = this.dispatch(canonicalId, contextParams);
        await execution.waitForCompletion();

        if (execution.error) {
          return {
            success: false,
            error: execution.error,
          };
        }

        return {
          success: true,
          data: execution.result,
        };
      },
    };

    this.tools.set(toolName, tool);

    return true;
  }

  /**
   * Get a registered plugin
   */
  getPlugin(pluginId: string): WorkflowPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all registered plugins
   */
  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Replace an existing plugin implementation
   */
  replace(plugin: WorkflowPlugin): void {
    if (this.plugins.has(plugin.id)) {
      this.unregister(plugin.id);
    }
    this.register(plugin);
  }

  /**
   * Unregister a workflow plugin
   */
  unregister(pluginId: string): void {
    if (!this.plugins.has(pluginId)) {
      return;
    }
    this.plugins.delete(pluginId);
    this.tools.delete(`dispatch_workflow_${pluginId}`);
  }

  /**
   * Get available tools
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool by name
   */
  getTool(toolName: string): WorkflowTool {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return tool;
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(toolName: string): ToolMetadata {
    const pluginId = toolName.replace('dispatch_workflow_', '');
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin for tool ${toolName} not found`);
    }

    return {
      name: toolName,
      description: plugin.description || `Dispatch ${plugin.name} workflow`,
      // Return the Zod schema directly
      inputSchema: plugin.inputSchema,
    };
  }

  /**
   * Dispatch a workflow execution
   */
  dispatch(
    pluginId: string,
    context:
      | WorkflowContext
      | { contextId: string; taskId?: string; parameters?: Record<string, unknown> },
  ): WorkflowExecution {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const executionId = context.taskId || this.generateExecutionId();
    const fullContext: WorkflowContext = {
      contextId: context.contextId,
      taskId: executionId,
      parameters: context.parameters,
      metadata: 'metadata' in context ? context.metadata : undefined,
    };

    // Simple per-execution event handling
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    this.executionListeners.set(executionId, listeners);
    const emit = (event: string, payload?: unknown): void => {
      const set = listeners.get(event);
      if (!set) {
        return;
      }
      for (const fn of set) {
        try {
          fn(payload);
        } catch {
          // Ignore event handler errors
        }
      }
    };

    // Create execution object
    const execution: WorkflowExecution = {
      id: executionId,
      pluginId,
      state: 'working',
      context: fullContext,
      startedAt: new Date(),
      waitForCompletion: async (): Promise<unknown> => {
        return new Promise<unknown>((resolve) => {
          const checkCompletion = (): void => {
            const exec = this.executions.get(executionId);
            if (
              exec &&
              (exec.state === 'completed' || exec.state === 'failed' || exec.state === 'canceled')
            ) {
              resolve(exec.result);
            } else {
              setTimeout(checkCompletion, 100);
            }
          };
          checkCompletion();
        });
      },
      on: (event: string, handler: (...args: unknown[]) => void): WorkflowExecution => {
        const set = listeners.get(event) || new Set<(...args: unknown[]) => void>();
        set.add(handler);
        listeners.set(event, set);
        return execution;
      },
      getArtifacts: (): unknown[] => {
        return this.executionArtifacts.get(executionId) || [];
      },
      getError: (): Error | undefined => {
        return this.executions.get(executionId)?.error;
      },
      getPauseInfo: (): PauseInfo | undefined => {
        const ts = this.taskStates.get(executionId) as { pauseInfo?: PauseInfo } | undefined;
        return ts?.pauseInfo;
      },
      resume: async (input: unknown): Promise<ResumeResult> => {
        return await this.resumeWorkflow(executionId, input);
      },
    };

    this.executions.set(executionId, execution);

    // Start execution asynchronously
    this.executePlugin(plugin, fullContext, execution, emit).catch((error) => {
      execution.state = 'failed';
      execution.error = error instanceof Error ? error : new Error(String(error));
      execution.completedAt = new Date();
      emit('error', error);
    });

    return execution;
  }

  /**
   * Execute a plugin
   */
  private async executePlugin(
    plugin: WorkflowPlugin,
    context: WorkflowContext,
    execution: WorkflowExecution,
    emit: (event: string, payload?: unknown) => void,
  ): Promise<void> {
    try {
      const generator = plugin.execute(context);
      let result: unknown;

      // Store generator for potential pause/resume
      this.workflowGenerators.set(execution.id, generator);

      // Initialize task state
      this.taskStates.set(execution.id, {
        state: 'working',
        workflowGenerator: generator,
      });

      // Iterate through generator yields
      while (!this.isShuttingDown) {
        const { value, done } = await generator.next();

        if (done) {
          result = value;
          break;
        }

        // Handle yielded values
        if (isWorkflowState(value)) {
          const yieldValue = value;
          switch (yieldValue.type) {
            case 'artifact': {
              const artifact = yieldValue.artifact;
              const arr = this.executionArtifacts.get(execution.id) || [];
              arr.push(artifact);
              this.executionArtifacts.set(execution.id, arr);
              emit('artifact', artifact);
              break;
            }
            case 'pause': {
              const { status, inputSchema, correlationId } = yieldValue;
              if (!status) {
                throw new Error('Pause yield must include status');
              }
              const to = status.state;
              if (!to) {
                throw new Error('Pause yield must have status.state');
              }
              ensureTransition(execution.id, 'working', to as TaskState);
              execution.state = to;

              const message = status.message as
                | { parts?: Array<{ kind?: string; text?: string }> }
                | undefined;
              const pauseMessage = (() => {
                if (message?.parts && Array.isArray(message.parts)) {
                  const textPart = message.parts.find((part) => part?.kind === 'text');
                  return typeof textPart?.text === 'string' ? textPart.text : undefined;
                }
                return undefined;
              })();

              const pauseInfo: PauseInfo = {
                state: to,
                message: pauseMessage,
                inputSchema,
                correlationId: typeof correlationId === 'string' ? correlationId : undefined,
              };

              this.taskStates.set(execution.id, {
                state: to,
                workflowGenerator: generator,
                pauseInfo,
              });
              emit('pause', pauseInfo);
              return; // Exit without completing
            }
            case 'status':
            case 'progress': {
              emit('update', yieldValue);
              break;
            }
            case 'error': {
              const error =
                yieldValue.error instanceof Error
                  ? yieldValue.error
                  : new Error(String(yieldValue.error));
              execution.error = error;
              ensureTransition(execution.id, 'working', 'failed');
              execution.state = 'failed';
              execution.completedAt = new Date();
              this.taskStates.set(execution.id, {
                state: 'failed',
                final: true,
                error,
              });
              emit('error', error);
              return;
            }
            default:
              break;
          }
        }
      }

      // Update execution with result
      execution.result = result;
      const currentState = execution.state as TaskState;
      const targetState: TaskState = this.isShuttingDown ? 'canceled' : 'completed';
      if (currentState !== targetState) {
        ensureTransition(execution.id, currentState, targetState);
      }
      execution.state = targetState;
      execution.completedAt = new Date();

      // Update task state
      this.taskStates.set(execution.id, {
        state: targetState,
        final: true,
      });

      // Clean up generator
      this.workflowGenerators.delete(execution.id);
      this.concurrentResumeTracking.delete(execution.id);
      emit('done');
    } catch (error) {
      execution.error = error as Error;
      ensureTransition(execution.id, 'working', 'failed');
      execution.state = 'failed';
      execution.completedAt = new Date();

      // Update task state
      this.taskStates.set(execution.id, {
        state: 'failed',
        final: true,
        error,
      });

      // Clean up generator
      this.workflowGenerators.delete(execution.id);
      this.concurrentResumeTracking.delete(execution.id);
      emit('error', error);
    }
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get a specific artifact for a task/execution
   */
  getArtifact(taskId: string, artifactId: string): unknown {
    const artifacts = this.executionArtifacts.get(taskId) || [];
    return artifacts.find((a: unknown) => {
      const artifact = a as { id?: string; name?: string };
      return artifact.id === artifactId || artifact.name === artifactId;
    });
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return false;
    }

    if (execution.state !== 'working') {
      return false;
    }

    ensureTransition(execution.id, 'working', 'canceled');
    execution.state = 'canceled';
    execution.completedAt = new Date();
    return true;
  }

  /**
   * Get task state by ID
   */
  getTaskState(taskId: string):
    | {
        state: string;
        workflowGenerator?: AsyncGenerator;
        pauseInfo?: PauseInfo;
        final?: boolean;
        error?: unknown;
        validationErrors?: unknown[];
      }
    | undefined {
    return this.taskStates.get(taskId);
  }

  isResumeInFlight(taskId: string): boolean {
    const tracking = this.concurrentResumeTracking.get(taskId);
    return !!tracking && tracking.count > 0;
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(taskId: string, input: unknown): Promise<ResumeResult> {
    const generator = this.workflowGenerators.get(taskId);
    if (!generator) {
      throw new Error(`No workflow generator found for task ${taskId}`);
    }

    const execution = this.executions.get(taskId);
    if (!execution) {
      throw new Error(`No execution found for task ${taskId}`);
    }

    // Track concurrent resume requests
    const tracking = this.concurrentResumeTracking.get(taskId) || { count: 0, primaryIndex: -1 };
    tracking.count++;
    const requestOrder = tracking.count;
    const isPrimary = tracking.primaryIndex === -1;
    if (isPrimary) {
      tracking.primaryIndex = requestOrder;
    }
    this.concurrentResumeTracking.set(taskId, tracking);

    // Add metadata to execution
    const updatedMetadata: Record<string, unknown> = {
      ...(execution.metadata ?? {}),
      concurrentRequest: tracking.count > 1,
      requestOrder,
      primaryResume: isPrimary,
    };
    execution.metadata = updatedMetadata;

    const listeners =
      this.executionListeners.get(taskId) || new Map<string, Set<(...args: unknown[]) => void>>();
    if (!this.executionListeners.has(taskId)) {
      this.executionListeners.set(taskId, listeners);
    }
    const emit = (event: string, payload?: unknown): void => {
      const set = listeners.get(event);
      if (!set) {
        return;
      }
      for (const fn of set) {
        try {
          fn(payload);
        } catch {
          // Ignore event handler errors
        }
      }
    };

    const schedulePauseEmit = (errors?: unknown[]): void => {
      const currentState = this.taskStates.get(taskId);
      const pauseInfo = currentState?.pauseInfo;
      if (!pauseInfo) {
        return;
      }

      if (errors && currentState) {
        this.taskStates.set(taskId, {
          ...currentState,
          validationErrors: errors,
        });
      }

      const payload = errors ? { ...pauseInfo, validationErrors: errors } : pauseInfo;

      setTimeout(() => emit('pause', payload), 0);
    };

    // Validate against pause inputSchema if present (zod preferred, fallback to JSON schema)
    const ts = this.taskStates.get(taskId);
    const pauseSchema = ts?.pauseInfo?.inputSchema;
    if (pauseSchema) {
      // Check if it's a Zod schema
      const zodSchema = pauseSchema as {
        safeParse?: (input: unknown) => { success: boolean; error?: { issues: unknown[] } };
      };
      if (zodSchema && typeof zodSchema.safeParse === 'function') {
        const parsed = zodSchema.safeParse(input);
        if (!parsed.success) {
          const errors = parsed.error?.issues || [];
          schedulePauseEmit(errors);
          return { valid: false, errors };
        }
      }
    }

    // Resume the generator with input
    try {
      ensureTransition(taskId, execution.state as TaskState, 'working');
      execution.state = 'working';
      this.taskStates.set(taskId, {
        state: 'working',
        workflowGenerator: generator,
      });

      this.continueExecution(generator, execution, taskId, input, emit).catch((error) => {
        execution.state = 'failed';
        execution.error = error instanceof Error ? error : new Error(String(error));
        execution.completedAt = new Date();
        emit('error', error);
      });

      await Promise.resolve(); // Ensure async compliance
      return { valid: true, metadata: updatedMetadata };
    } catch (error) {
      ensureTransition(taskId, execution.state as TaskState, 'failed');
      execution.state = 'failed';
      execution.error = error as Error;
      execution.completedAt = new Date();
      this.taskStates.set(taskId, {
        state: 'failed',
        final: true,
        error,
      });
      this.workflowGenerators.delete(taskId);
      throw error;
    }
  }

  /**
   * Continue execution after resuming
   */
  private async continueExecution(
    generator: AsyncGenerator<unknown, unknown, unknown>,
    execution: WorkflowExecution,
    executionId: string,
    resumeInput: unknown,
    emit: (event: string, payload?: unknown) => void,
  ): Promise<void> {
    try {
      // Process the resumed input first
      let result = await generator.next(resumeInput);

      // Use nextTick to ensure event handlers have time to register
      await new Promise((resolve) => process.nextTick(resolve));

      while (!result.done) {
        const value = result.value;

        // Handle yielded values
        if (isWorkflowState(value)) {
          const yieldValue = value;
          switch (yieldValue.type) {
            case 'artifact': {
              const artifact = yieldValue.artifact;
              const arr = this.executionArtifacts.get(executionId) || [];
              arr.push(artifact);
              this.executionArtifacts.set(executionId, arr);
              emit('artifact', artifact);
              break;
            }
            case 'pause': {
              const { status, inputSchema, correlationId } = yieldValue;
              if (!status) {
                throw new Error('Pause yield must include status');
              }
              const to = status.state;
              if (!to) {
                throw new Error('Pause yield must have status.state');
              }
              ensureTransition(executionId, 'working', to as TaskState);
              execution.state = to;

              const message = status.message as
                | { parts?: Array<{ kind?: string; text?: string }> }
                | undefined;
              const pauseMessage = (() => {
                if (message?.parts && Array.isArray(message.parts)) {
                  const textPart = message.parts.find((part) => part?.kind === 'text');
                  return typeof textPart?.text === 'string' ? textPart.text : undefined;
                }
                return undefined;
              })();

              const pauseInfo: PauseInfo = {
                state: to,
                message: pauseMessage,
                inputSchema,
                correlationId: typeof correlationId === 'string' ? correlationId : undefined,
              };
              this.taskStates.set(executionId, {
                state: to,
                workflowGenerator: generator,
                pauseInfo,
              });
              // Give time for pause handler to be registered
              await new Promise((resolve) => process.nextTick(resolve));
              emit('pause', pauseInfo);
              return; // Exit without completing
            }
            case 'status':
            case 'progress': {
              emit('update', yieldValue);
              break;
            }
            case 'error': {
              const error =
                yieldValue.error instanceof Error
                  ? yieldValue.error
                  : new Error(String(yieldValue.error));
              execution.error = error;
              ensureTransition(executionId, 'working', 'failed');
              execution.state = 'failed';
              execution.completedAt = new Date();
              this.taskStates.set(executionId, {
                state: 'failed',
                final: true,
                error,
              });
              emit('error', error);
              return;
            }
            default:
              break;
          }
        }

        result = await generator.next();
      }

      // Update execution with result
      execution.result = result.value;
      const currentState = execution.state as TaskState;
      const targetState: TaskState = this.isShuttingDown ? 'canceled' : 'completed';
      if (currentState !== targetState) {
        ensureTransition(executionId, currentState, targetState);
      }
      execution.state = targetState;
      execution.completedAt = new Date();

      // Update task state
      this.taskStates.set(executionId, {
        state: targetState,
        final: true,
      });

      // Clean up generator
      this.workflowGenerators.delete(executionId);
      this.concurrentResumeTracking.delete(executionId);
      emit('done');
    } catch (error) {
      execution.error = error as Error;
      ensureTransition(executionId, 'working', 'failed');
      execution.state = 'failed';
      execution.completedAt = new Date();

      // Update task state
      this.taskStates.set(executionId, {
        state: 'failed',
        final: true,
        error,
      });

      // Clean up generator
      this.workflowGenerators.delete(executionId);
      this.concurrentResumeTracking.delete(executionId);
      emit('error', error);
    }
  }

  /**
   * Shutdown the runtime
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel all running executions
    for (const execution of this.executions.values()) {
      if (!['completed', 'failed', 'canceled'].includes(execution.state)) {
        ensureTransition(execution.id, execution.state as TaskState, 'canceled');
        execution.state = 'canceled';
        execution.completedAt = new Date();
      }
    }

    // Update task states
    for (const [taskId, state] of this.taskStates.entries()) {
      if (!state.final) {
        this.taskStates.set(taskId, {
          ...state,
          state: 'canceled',
          final: true,
        });
      }
    }

    // Clear all data
    this.plugins.clear();
    this.executions.clear();
    this.tools.clear();
    this.taskStates.clear();
    this.workflowGenerators.clear();
    this.executionListeners.clear();
    this.executionArtifacts.clear();

    await Promise.resolve(); // Ensure async compliance
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: unknown): plugin is WorkflowPlugin {
    // Basic validation with type guards
    if (typeof plugin !== 'object' || plugin === null) {
      return false;
    }

    const p = plugin as Record<string, unknown>;

    if (!p['id'] || !p['name'] || !p['version'] || !p['execute']) {
      return false;
    }

    // Enforce stable plugin ID format for tool naming: lowercase, digits, underscores, hyphens
    // Hyphens will be canonicalized to underscores during registration
    if (typeof p['id'] !== 'string') {
      return false;
    }
    const trimmedId = p['id'].trim();
    const validIdPattern = /^[a-z][a-z0-9_-]*$/;
    if (trimmedId !== p['id']) {
      return false;
    }
    if (!validIdPattern.test(p['id'])) {
      return false;
    }

    if (typeof p['execute'] !== 'function') {
      return false;
    }

    // Validate parameters schema if present (accept Zod or JSON Schema)
    const inputSchema = p['inputSchema'];
    if (inputSchema) {
      const isZod =
        inputSchema &&
        typeof inputSchema === 'object' &&
        typeof (inputSchema as { safeParse?: unknown }).safeParse === 'function';
      if (!isZod) {
        return false; // Only Zod schemas are supported
      }
    }

    return true;
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `task-${uuidv7()}`;
  }
}
