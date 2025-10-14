/**
 * Message handling for A2A Agent Executor
 */

import type { Message, Part } from '@a2a-js/sdk';
import { A2AError, type ExecutionEventBus } from '@a2a-js/sdk/server';

import { AIHandler } from './aiHandler.js';
import { WorkflowHandler } from './workflowHandler.js';

/**
 * Handles message routing and processing for the agent executor
 */
export class MessageHandler {
  constructor(
    private workflowHandler: WorkflowHandler,
    private aiHandler: AIHandler,
  ) {}

  /**
   * Handles an incoming message (which may or may not create a task)
   */
  async handleMessage(
    taskId: string,
    contextId: string,
    messageContent: string,
    messageData: unknown,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    // Get task state from workflow runtime (only exists for workflow tasks)
    const taskState = this.workflowHandler.getTaskState(taskId);

    // If task exists in workflow runtime, handle workflow resumption
    if (taskState) {
      // Check if task is in terminal state
      if (
        taskState.state === 'completed' ||
        taskState.state === 'failed' ||
        taskState.state === 'canceled'
      ) {
        eventBus.finished();
        throw A2AError.invalidRequest(
          `Task ${taskId} is in a terminal state (${taskState.state}) and cannot be modified.`,
          {
            taskId,
            state: taskState.state,
          },
        );
      }

      const isPausedState =
        taskState.state === 'input-required' || taskState.state === 'auth-required';
      const hasResumePayload = messageData !== undefined || messageContent.trim().length === 0;
      const canAttemptResume = isPausedState || (taskState.state === 'working' && hasResumePayload);

      if (canAttemptResume) {
        try {
          await this.workflowHandler.resumeWorkflow(
            taskId,
            contextId,
            messageContent,
            messageData,
            taskState,
            eventBus,
          );
          return;
        } catch (error) {
          if (isPausedState) {
            throw error;
          }
        }
      }
    }

    // For new tasks or tasks not in workflow runtime - use streaming AI processing
    // DefaultRequestHandler handles conversion between streaming/non-streaming as needed
    this.aiHandler.handleStreamingAIProcessing(
      messageContent,
      contextId,
      taskId,
      eventBus,
      messageData,
    );
  }

  /**
   * Extracts message content and data from a user message
   */
  extractMessageParts(userMessage: Message): { content: string; data: unknown } {
    let messageContent = '';
    let messageData: unknown = undefined;

    if ('parts' in userMessage && Array.isArray(userMessage.parts)) {
      const textPart = userMessage.parts.find((p: Part) => p.kind === 'text');
      const dataPart = userMessage.parts.find((p: Part) => p.kind === 'data');
      messageContent = textPart && 'text' in textPart ? textPart.text : '';
      messageData = dataPart && 'data' in dataPart ? dataPart.data : undefined;
    } else {
      // Fallback for legacy message format
      messageContent = 'content' in userMessage ? String(userMessage.content) : '';
    }

    return { content: messageContent, data: messageData };
  }
}
