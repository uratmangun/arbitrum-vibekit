/**
 * Handles different types of stream events
 */

import type { TaskArtifactUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { TextStreamPart, Tool } from 'ai';
import { v7 as uuidv7 } from 'uuid';

import { Logger } from '../../../utils/logger.js';

import { ArtifactManager } from './ArtifactManager.js';
import type { ToolCallCollector } from './ToolCallCollector.js';

export interface StreamProcessingState {
  textChunkIndex: number;
  reasoningChunkIndex: number;
  bufferedArtifact: TaskArtifactUpdateEvent | null;
  bufferedReasoningArtifact: TaskArtifactUpdateEvent | null;
  toolCallArtifacts: Map<number, string>;
  deltaCounters: Record<string, number>;
  // Accumulated content for building ModelMessage
  accumulatedText: string;
  accumulatedReasoning: string;
}

/**
 * Routes and handles different stream event types
 */
export class StreamEventHandler {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance('StreamEventHandler');
  }

  /**
   * Handle a stream event based on its type
   */
  handleStreamEvent(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
    toolCallCollector: ToolCallCollector,
  ): void {
    switch (streamEvent.type) {
      case 'text-delta':
        this.handleTextDelta(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'tool-call':
        this.handleToolCall(
          streamEvent,
          taskId,
          contextId,
          eventBus,
          state,
          artifactManager,
          toolCallCollector,
        );
        break;

      case 'tool-result':
        this.handleToolResult(
          streamEvent,
          taskId,
          contextId,
          eventBus,
          state,
          artifactManager,
          toolCallCollector,
        );
        break;

      case 'reasoning-delta':
        this.handleReasoningDelta(streamEvent, taskId, contextId, eventBus, state, artifactManager);
        break;

      case 'reasoning-start':
        this.logger.debug('stream:reasoning-start');
        break;

      case 'reasoning-end':
        this.handleReasoningEnd(eventBus, state);
        break;

      case 'text-end':
        this.handleTextEnd(eventBus, state);
        break;

      case 'tool-input-end':
        this.handleToolInputEnd(state);
        break;

      default:
        this.handleOtherEvent(streamEvent, state);
        break;
    }
  }

  private handleTextDelta(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    if (!('text' in streamEvent)) {
      return;
    }

    this.logger.debug('stream:text-delta', {
      len: (streamEvent.text || '').length,
      textChunkIndex: state.textChunkIndex,
    });

    // Accumulate text for CoreMessage
    state.accumulatedText += streamEvent.text;

    // Ring-buffer approach: publish previous chunk and buffer new one
    if (state.bufferedArtifact) {
      eventBus.publish(state.bufferedArtifact);
    }

    state.bufferedArtifact = artifactManager.createStreamingArtifact(
      taskId,
      contextId,
      'text-response',
      streamEvent.text,
      state.textChunkIndex,
      false,
    );
    state.textChunkIndex++;
  }

  private handleToolCall(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
    toolCallCollector: ToolCallCollector,
  ): void {
    if (!('toolName' in streamEvent)) {
      return;
    }

    this.logger.debug('stream:tool-call', {
      name: streamEvent.toolName,
      hasInput: Object.prototype.hasOwnProperty.call(streamEvent, 'input'),
    });

    const artifactId = `tool-call-${streamEvent.toolName}-${uuidv7()}`;
    const toolCallIndex = toolCallCollector.getToolCalls().length;

    // Store the artifact ID for later update
    state.toolCallArtifacts.set(toolCallIndex, artifactId);

    // Create and publish initial artifact
    const artifact = artifactManager.createToolCallArtifact(
      taskId,
      contextId,
      streamEvent.toolName,
      {},
    );

    // Override the artifactId to match what we're tracking
    artifact.artifact.artifactId = artifactId;

    this.logger.debug('Publishing tool-call artifact', {
      artifactId,
      toolName: streamEvent.toolName,
      toolCallIndex,
    });

    eventBus.publish(artifact);

    // Add to collector
    toolCallCollector.addToolCall({
      name: streamEvent.toolName,
      arguments: 'input' in streamEvent ? streamEvent.input : undefined,
    });
  }

  private handleToolResult(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
    toolCallCollector: ToolCallCollector,
  ): void {
    const toolResultEvent = streamEvent as {
      type: 'tool-result';
      output?: unknown;
    };

    this.logger.debug('stream:tool-result', {
      hasOutput: 'output' in toolResultEvent,
      resultType: typeof toolResultEvent.output,
      isNull: toolResultEvent.output === null,
    });

    const toolCalls = toolCallCollector.getToolCalls();
    const toolCallIndex = toolCalls.length - 1;
    const lastToolCall = toolCalls[toolCallIndex];

    if (lastToolCall) {
      lastToolCall.result = toolResultEvent.output;

      const artifactId = state.toolCallArtifacts.get(toolCallIndex);
      if (artifactId) {
        const resultArtifact = artifactManager.createToolResultArtifact(
          taskId,
          contextId,
          artifactId,
          lastToolCall.name,
          toolResultEvent.output,
        );

        this.logger.debug('Publishing tool-result artifact', {
          artifactId,
          toolName: lastToolCall.name,
          toolCallIndex,
          resultType: typeof toolResultEvent.output,
          resultSize:
            toolResultEvent.output && typeof toolResultEvent.output === 'object'
              ? Object.keys(toolResultEvent.output as Record<string, unknown>).length + ' keys'
              : 'non-object',
        });

        eventBus.publish(resultArtifact);
      }
    }
  }

  private handleReasoningDelta(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    state: StreamProcessingState,
    artifactManager: ArtifactManager,
  ): void {
    const reasoningEvent = streamEvent as unknown as {
      type: 'reasoning-delta';
      delta?: string;
      text?: string;
    };
    const reasoningText = reasoningEvent.delta || reasoningEvent.text || '';

    this.logger.debug('stream:reasoning-delta', {
      len: reasoningText.length,
      reasoningChunkIndex: state.reasoningChunkIndex,
    });

    // Accumulate reasoning for CoreMessage
    state.accumulatedReasoning += reasoningText;

    // Ring-buffer approach for reasoning
    if (state.bufferedReasoningArtifact) {
      eventBus.publish(state.bufferedReasoningArtifact);
    }

    state.bufferedReasoningArtifact = artifactManager.createStreamingArtifact(
      taskId,
      contextId,
      'reasoning',
      reasoningText,
      state.reasoningChunkIndex,
      false,
    );
    state.reasoningChunkIndex++;
  }

  private handleReasoningEnd(eventBus: ExecutionEventBus, state: StreamProcessingState): void {
    this.logger.debug('stream:reasoning-end - flushing reasoning buffer with lastChunk');
    if (state.bufferedReasoningArtifact) {
      state.bufferedReasoningArtifact.lastChunk = true;
      eventBus.publish(state.bufferedReasoningArtifact);
      state.bufferedReasoningArtifact = null;
    }
  }

  private handleTextEnd(eventBus: ExecutionEventBus, state: StreamProcessingState): void {
    this.logger.debug('stream:text-end - flushing buffer with lastChunk');
    if (state.bufferedArtifact) {
      state.bufferedArtifact.lastChunk = true;
      eventBus.publish(state.bufferedArtifact);
      state.bufferedArtifact = null;
    }
  }

  private handleToolInputEnd(state: StreamProcessingState): void {
    this.logger.debug('stream:tool-input-end', {
      'tool-input-delta-count': state.deltaCounters['tool-input-delta'],
    });
    state.deltaCounters['tool-input-delta'] = 0;
  }

  private handleOtherEvent(
    streamEvent: TextStreamPart<Record<string, Tool>>,
    state: StreamProcessingState,
  ): void {
    const eventType = (streamEvent as { type?: string }).type;

    // Check if this is a delta event we only count
    if (eventType && Object.prototype.hasOwnProperty.call(state.deltaCounters, eventType)) {
      state.deltaCounters[eventType] = (state.deltaCounters[eventType] ?? 0) + 1;
    } else {
      this.logger.debug('stream:other', {
        type: eventType,
        streamEvent: streamEvent,
      });
    }
  }
}
