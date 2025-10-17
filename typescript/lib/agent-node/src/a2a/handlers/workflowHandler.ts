/**
 * Workflow handling for A2A Agent Executor
 */

import type {
  Artifact,
  Message,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatus,
  TaskStatusUpdateEvent,
  TextPart,
  Part,
} from '@a2a-js/sdk';
import { type ExecutionEventBus } from '@a2a-js/sdk/server';
import { v7 as uuidv7 } from 'uuid';

import { Logger } from '../../utils/logger.js';
import type { WorkflowRuntime } from '../../workflows/runtime.js';
import type { ActiveTask, TaskState, WorkflowEvent } from '../types.js';

/**
 * Type guards
 */
function hasEventEmitter(
  obj: unknown,
): obj is { on: (event: string, handler: (...args: unknown[]) => void) => void } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'on' in obj &&
    typeof (obj as { on: unknown }).on === 'function'
  );
}

/**
 * Handles workflow-related operations for the agent executor
 */
export class WorkflowHandler {
  private activeTasks = new Map<string, ActiveTask>();
  private pendingCancels = new Set<string>();
  private logger: Logger;

  constructor(private workflowRuntime?: WorkflowRuntime) {
    this.logger = Logger.getInstance('WorkflowHandler');
  }

  /**
   * Resumes a paused workflow
   */
  async resumeWorkflow(
    taskId: string,
    contextId: string,
    messageContent: string,
    messageData: unknown,
    taskState: TaskState,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    // Get the execution object - this has the event listeners set up in dispatchWorkflow()
    const execution = this.workflowRuntime?.getExecution(taskId);

    if (!execution) {
      // No execution available - can't resume
      const errorMessage: Message = {
        kind: 'message',
        messageId: uuidv7(),
        contextId,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Cannot resume task ${taskId}. Workflow execution not available.`,
          } as TextPart,
        ],
      };

      eventBus.publish(errorMessage);
      eventBus.finished();
      return;
    }

    try {
      // Resume the workflow with the input
      const input = messageData ?? messageContent;

      // Use execution.resume() instead of calling generator.next() directly
      // This ensures event listeners (set up in dispatchWorkflow) are triggered
      const resumeResult = await execution.resume(input);

      let responseMetadata: Record<string, unknown> | undefined;
      if (resumeResult && typeof resumeResult === 'object' && 'metadata' in resumeResult) {
        const metadataCandidate = (resumeResult as { metadata?: unknown }).metadata;
        if (metadataCandidate && typeof metadataCandidate === 'object') {
          responseMetadata = metadataCandidate as Record<string, unknown>;
        }
      }

      // Handle resume result
      if (!resumeResult.valid) {
        // Validation failed - publish error and keep task paused
        const errors = Array.isArray(resumeResult.errors) ? resumeResult.errors : [];
        const messageText = errors.length
          ? errors
              .map((err: unknown) => (typeof err === 'string' ? err : JSON.stringify(err)))
              .join('\n')
          : 'Input validation failed.';

        const statusUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: taskState.state,
            message: {
              kind: 'message',
              messageId: uuidv7(),
              contextId,
              role: 'agent',
              parts: [{ kind: 'text', text: messageText } as TextPart],
            },
          },
          final: false,
        };
        eventBus.publish(statusUpdate);
        eventBus.finished();
        return;
      }

      // Validation succeeded - publish working status with metadata
      const metadata = responseMetadata ?? execution.metadata;
      if (metadata) {
        const task: Task = {
          kind: 'task',
          id: taskId,
          contextId,
          status: {
            state: 'working',
          },
          metadata,
        };
        eventBus.publish(task);
      }

      const statusUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
        },
        final: false,
      };
      eventBus.publish(statusUpdate);

      // Event listeners (set up in dispatchWorkflow) will handle:
      // - Artifacts emitted after resume
      // - Status updates
      // - Pause events
      // - Completion/error events
    } catch (error: unknown) {
      // Error resuming workflow
      const errorMessage: Message = {
        kind: 'message',
        messageId: uuidv7(),
        contextId,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Failed to resume workflow: ${error instanceof Error ? error.message : String(error)}`,
          } as TextPart,
        ],
      };

      eventBus.publish(errorMessage);
    }

    eventBus.finished();
  }

  /**
   * Dispatches a new workflow
   */
  async dispatchWorkflow(
    workflowName: string,
    params: unknown,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): Promise<{
    taskId: string;
    metadata: { workflowName: string; description: string; pluginId: string };
  }> {
    this.logger.debug('dispatchWorkflow called', { workflowName, params, contextId });
    if (!this.workflowRuntime) {
      this.logger.error('Workflow runtime not available');
      throw new Error('Workflow runtime not available');
    }

    try {
      // Extract plugin ID from workflow name
      const pluginId = workflowName.replace('dispatch_workflow_', '');
      this.logger.debug('Extracted plugin ID', { pluginId });

      // Get plugin metadata
      const plugin = this.workflowRuntime.getPlugin(pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      // Dispatch workflow - this creates a task via the runtime
      const workflowParams =
        typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
      this.logger.debug('Workflow params', { workflowParams });
      const execution = this.workflowRuntime.dispatch(pluginId, {
        ...workflowParams,
        contextId,
      });

      // Create task event for the new workflow
      const task: Task = {
        kind: 'task',
        id: execution.id,
        contextId,
        status: {
          state: 'submitted',
        },
        metadata: execution.metadata,
      };

      this.logger.debug('Created task', { task });
      eventBus.publish(task);

      // Create abort controller
      const abortController = new AbortController();

      let aborted = false;
      const completionPromise = Promise.resolve(execution.waitForCompletion());
      const abortPromise = new Promise<void>((resolve) => {
        const onAbort = (): void => {
          aborted = true;
          if (typeof this.workflowRuntime?.cancelExecution === 'function') {
            try {
              this.workflowRuntime.cancelExecution(execution.id);
            } catch {
              // Ignore cancellation errors
            }
          }
          resolve();
        };

        if (abortController.signal.aborted) {
          void onAbort();
        } else {
          abortController.signal.addEventListener(
            'abort',
            () => {
              void onAbort();
            },
            { once: true },
          );
        }
      });

      this.activeTasks.set(execution.id, { controller: abortController, contextId });

      if (this.pendingCancels.has(execution.id)) {
        this.pendingCancels.delete(execution.id);
        abortController.abort();
      }

      // Update to working state
      const workingUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: execution.id,
        contextId,
        status: {
          state: 'working',
        },
        final: false,
      };
      eventBus.publish(workingUpdate);

      // Subscribe to execution events for streaming
      if (hasEventEmitter(execution)) {
        execution.on('artifact', (artifact: unknown) => {
          // Publish as TaskArtifactUpdateEvent with taskId for proper A2A routing
          const artifactUpdate: TaskArtifactUpdateEvent = {
            kind: 'artifact-update',
            taskId: execution.id,
            contextId,
            artifact: artifact as Artifact,
            lastChunk: false,
          };
          eventBus.publish(artifactUpdate);
        });

        execution.on('update', (update: unknown) => {
          const workflowUpdate = update as WorkflowEvent;
          if (workflowUpdate?.type === 'status' && workflowUpdate?.status) {
            const statusUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId,
              status: workflowUpdate.status as TaskStatus,
              final: false,
            };
            eventBus.publish(statusUpdate);
          }
        });

        execution.on('pause', (pauseInfo: unknown) => {
          const workflowPauseInfo = pauseInfo as WorkflowEvent;
          const parts: Part[] = [];
          if (workflowPauseInfo?.message) {
            parts.push({ kind: 'text', text: workflowPauseInfo.message } as TextPart);
          }
          // Best effort: attach a serializable schema hint if present
          if (workflowPauseInfo?.inputSchema && typeof workflowPauseInfo.inputSchema === 'object') {
            parts.push({
              kind: 'data',
              data: { inputSchema: workflowPauseInfo.inputSchema },
              metadata: { mimeType: 'application/json' },
            });
          }

          const statusUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: execution.id,
            contextId,
            status: {
              state:
                (workflowPauseInfo?.state as TaskStatus['state']) ||
                ('input-required' as TaskStatus['state']),
              message: {
                kind: 'message',
                messageId: uuidv7(),
                contextId,
                role: 'agent',
                parts,
              },
            },
            final: false,
          };
          eventBus.publish(statusUpdate);
        });

        execution.on('error', (_err: unknown) => {
          const failedUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: execution.id,
            contextId,
            status: { state: 'failed' },
            final: true,
          };
          eventBus.publish(failedUpdate);
        });
      }

      const monitorExecution = async (): Promise<void> => {
        try {
          await Promise.race([completionPromise, abortPromise]);

          this.activeTasks.delete(execution.id);

          if (aborted) {
            const canceledUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId,
              status: {
                state: 'canceled',
              },
              final: true,
            };
            eventBus.publish(canceledUpdate);
            return;
          }

          await completionPromise;

          // Check final state
          if (execution.state === 'completed') {
            const completedUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId,
              status: {
                state: 'completed',
              },
              final: true,
            };
            eventBus.publish(completedUpdate);
          } else if (execution.state === 'failed') {
            const failedUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId,
              status: {
                state: 'failed',
              },
              final: true,
            };
            eventBus.publish(failedUpdate);
          } else if (execution.state === 'canceled') {
            const canceledUpdate: TaskStatusUpdateEvent = {
              kind: 'status-update',
              taskId: execution.id,
              contextId,
              status: {
                state: 'canceled',
              },
              final: true,
            };
            eventBus.publish(canceledUpdate);
          }
        } catch (error: unknown) {
          const errorMessage: Message = {
            kind: 'message',
            messageId: uuidv7(),
            contextId,
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Failed to dispatch workflow: ${error instanceof Error ? error.message : String(error)}`,
              } as TextPart,
            ],
          };
          eventBus.publish(errorMessage);
        } finally {
          eventBus.finished();
        }
      };

      this.logger.debug('Starting execution monitor');
      void monitorExecution();
      await Promise.resolve();

      // Return task ID and workflow metadata
      return {
        taskId: execution.id,
        metadata: {
          workflowName: plugin.name,
          description: plugin.description || `Dispatch ${plugin.name} workflow`,
          pluginId: plugin.id,
        },
      };
    } catch (error: unknown) {
      this.logger.error('Error in dispatchWorkflow', error);
      throw error;
    }
  }

  /**
   * Cancels a task
   */
  cancelTask(taskId: string): void {
    const active = this.activeTasks.get(taskId);
    if (active) {
      this.activeTasks.delete(taskId);
      active.controller.abort();

      if (typeof this.workflowRuntime?.cancelExecution === 'function') {
        try {
          this.workflowRuntime.cancelExecution(taskId);
        } catch {
          // Ignore cancellation errors
        }
      }
      return;
    }

    this.pendingCancels.add(taskId);

    if (typeof this.workflowRuntime?.cancelExecution === 'function') {
      try {
        this.workflowRuntime.cancelExecution(taskId);
      } catch {
        // Ignore cancellation errors
      }
    }
  }

  /**
   * Gets task state from the workflow runtime
   */
  getTaskState(taskId: string): TaskState | undefined {
    return this.workflowRuntime?.getTaskState?.(taskId) as TaskState | undefined;
  }
}
