/**
 * Core stream processing for AI responses
 */

import type { TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart, AssistantModelMessage } from 'ai';
import { v7 as uuidv7 } from 'uuid';

import { Logger } from '../../../utils/logger.js';

import { ArtifactManager } from './ArtifactManager.js';
import { StreamEventHandler } from './StreamEventHandler.js';
import { ToolCallCollector } from './ToolCallCollector.js';

export interface StreamProcessorOptions {
  taskId: string;
  contextId: string;
  eventBus: ExecutionEventBus;
  onWorkflowDispatch?: (
    toolName: string,
    args: unknown,
    contextId: string,
    eventBus: ExecutionEventBus,
  ) => Promise<{
    taskId: string;
    metadata: { workflowName: string; description: string; pluginId: string };
  }>;
}

/**
 * Handles the core stream processing logic
 */
export class StreamProcessor {
  private logger: Logger;
  private artifactManager: ArtifactManager;
  private eventHandler: StreamEventHandler;
  private toolCallCollector: ToolCallCollector;

  constructor() {
    this.logger = Logger.getInstance('StreamProcessor');
    this.artifactManager = new ArtifactManager();
    this.eventHandler = new StreamEventHandler();
    this.toolCallCollector = new ToolCallCollector();
  }

  /**
   * Process an AI stream and return the assistant message for history
   */
  async processStream(
    streamIter: AsyncIterable<TextStreamPart<Record<string, Tool>>>,
    options: StreamProcessorOptions,
  ): Promise<AssistantModelMessage | null> {
    const { taskId, contextId, eventBus, onWorkflowDispatch } = options;

    try {
      // Initialize processing state
      const state = {
        textChunkIndex: 0,
        reasoningChunkIndex: 0,
        bufferedArtifact: null as TaskArtifactUpdateEvent | null,
        bufferedReasoningArtifact: null as TaskArtifactUpdateEvent | null,
        toolCallArtifacts: new Map<number, string>(),
        deltaCounters: { 'tool-input-delta': 0 } as Record<string, number>,
        accumulatedText: '',
        accumulatedReasoning: '',
      };

      // Process the stream
      for await (const streamEvent of streamIter) {
        this.eventHandler.handleStreamEvent(
          streamEvent,
          taskId,
          contextId,
          eventBus,
          state,
          this.artifactManager,
          this.toolCallCollector,
        );
      }

      this.logger.info('AI stream ended', {
        textChunks: state.textChunkIndex,
        collectedToolCalls: this.toolCallCollector.getToolCalls().length,
      });

      // Flush any remaining buffered artifacts
      this.flushBufferedArtifacts(state, eventBus);

      // Handle collected tool calls
      await this.handleToolCalls(taskId, contextId, eventBus, onWorkflowDispatch);

      // Publish completion status
      this.publishCompletionStatus(taskId, contextId, eventBus);

      // Build assistant message for conversation history
      const assistantMessage = this.buildAssistantMessage(state);
      return assistantMessage;
    } catch (error) {
      this.handleStreamError(error, taskId, contextId, eventBus);
      return null;
    } finally {
      eventBus.finished();
    }
  }

  /**
   * Build AssistantModelMessage from stream state for conversation history
   */
  private buildAssistantMessage(state: {
    accumulatedText: string;
    accumulatedReasoning: string;
  }): AssistantModelMessage | null {
    const { accumulatedText, accumulatedReasoning } = state;

    // Only create a message if there's content
    if (!accumulatedText && !accumulatedReasoning) {
      return null;
    }

    // Build content array with reasoning first (required by Anthropic), then text
    const content: Array<{ type: 'text'; text: string }> = [];

    // Add reasoning block if present (thinking blocks must come first for Anthropic)
    if (accumulatedReasoning) {
      content.push({
        type: 'text',
        text: accumulatedReasoning,
      });
    }

    // Add text content if present
    if (accumulatedText) {
      content.push({
        type: 'text',
        text: accumulatedText,
      });
    }

    return {
      role: 'assistant',
      content,
    };
  }

  private flushBufferedArtifacts(
    state: {
      bufferedArtifact: TaskArtifactUpdateEvent | null;
      bufferedReasoningArtifact: TaskArtifactUpdateEvent | null;
    },
    eventBus: ExecutionEventBus,
  ): void {
    if (state.bufferedArtifact) {
      this.logger.debug('Flushing remaining buffered text artifact (no text-end received)');
      state.bufferedArtifact.lastChunk = true;
      eventBus.publish(state.bufferedArtifact);
    }

    if (state.bufferedReasoningArtifact) {
      this.logger.debug(
        'Flushing remaining buffered reasoning artifact (no reasoning-end received)',
      );
      state.bufferedReasoningArtifact.lastChunk = true;
      eventBus.publish(state.bufferedReasoningArtifact);
    }
  }

  private async handleToolCalls(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    onWorkflowDispatch?: (
      toolName: string,
      args: unknown,
      contextId: string,
      eventBus: ExecutionEventBus,
    ) => Promise<{
      taskId: string;
      metadata: { workflowName: string; description: string; pluginId: string };
    }>,
  ): Promise<void> {
    const toolCalls = this.toolCallCollector.getToolCalls();
    if (toolCalls.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      if (toolCall.name.startsWith('dispatch_workflow_') && onWorkflowDispatch) {
        this.logger.info('Dispatching workflow from stream', { name: toolCall.name });
        const result = await onWorkflowDispatch(
          toolCall.name,
          toolCall.arguments,
          contextId,
          eventBus,
        );

        // Emit status update with referenceTaskIds
        const statusUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: 'working',
            message: {
              kind: 'message',
              messageId: uuidv7(),
              contextId,
              role: 'agent',
              referenceTaskIds: [result.taskId],
              parts: [
                {
                  kind: 'text',
                  text: `Dispatching workflow: ${result.metadata.workflowName} (${result.metadata.description})`,
                },
              ],
              metadata: {
                referencedWorkflow: result.metadata,
              },
            },
          },
          final: false,
        };
        eventBus.publish(statusUpdate);
      }
    }
  }

  private publishCompletionStatus(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): void {
    this.logger.debug('Publishing completed status-update');
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
      },
      final: true,
    });
  }

  private handleStreamError(
    error: unknown,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): void {
    this.logger.error('Streaming error', error);
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'failed',
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message',
          messageId: crypto.randomUUID(),
          contextId,
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: `Streaming error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        },
      },
      final: true,
    });
  }
}
