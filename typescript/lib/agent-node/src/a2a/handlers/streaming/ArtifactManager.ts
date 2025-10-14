/**
 * Manages artifact creation and buffering for stream processing
 */

import type { TaskArtifactUpdateEvent } from '@a2a-js/sdk';
import { v7 as uuidv7 } from 'uuid';

export type ArtifactType = 'text-response' | 'reasoning' | 'tool-call';

/**
 * Handles artifact creation and management for streaming responses
 */
export class ArtifactManager {
  /**
   * Creates a streaming artifact event
   */
  createStreamingArtifact(
    taskId: string,
    contextId: string,
    artifactType: 'text-response' | 'reasoning',
    content: string,
    chunkIndex: number,
    isLastChunk: boolean,
  ): TaskArtifactUpdateEvent {
    return {
      kind: 'artifact-update',
      taskId,
      contextId,
      artifact: {
        artifactId: `${artifactType}-${taskId}`,
        name: artifactType,
        description: artifactType === 'text-response' ? 'AI streaming response' : 'AI reasoning',
        parts: [
          {
            kind: 'text',
            text: content,
          },
        ],
      },
      append: chunkIndex > 0,
      lastChunk: isLastChunk,
    };
  }

  /**
   * Creates a tool call artifact
   */
  createToolCallArtifact(
    taskId: string,
    contextId: string,
    toolName: string,
    data: unknown = {},
    isResult = false,
  ): TaskArtifactUpdateEvent {
    const artifactId = isResult
      ? `tool-result-${toolName}-${uuidv7()}`
      : `tool-call-${toolName}-${uuidv7()}`;

    return {
      kind: 'artifact-update',
      taskId,
      contextId,
      artifact: {
        artifactId,
        name: isResult ? `tool-result-${toolName}` : `tool-call-${toolName}`,
        description: isResult ? `Result from ${toolName} tool` : `Tool call: ${toolName}`,
        parts: [
          {
            kind: 'data',
            data: data as Record<string, unknown>,
            metadata: {
              mimeType: 'application/json',
            } as Record<string, unknown>,
          },
        ],
      },
      append: false,
      lastChunk: isResult,
    };
  }

  /**
   * Creates a tool result artifact with updated data
   */
  createToolResultArtifact(
    taskId: string,
    contextId: string,
    artifactId: string,
    toolName: string,
    result: unknown,
  ): TaskArtifactUpdateEvent {
    return {
      kind: 'artifact-update',
      taskId,
      contextId,
      artifact: {
        artifactId,
        name: `tool-call-${toolName}`,
        description: `Result from ${toolName} tool`,
        parts: [
          {
            kind: 'data',
            data: result as Record<string, unknown>,
            metadata: {
              mimeType: 'application/json',
            } as Record<string, unknown>,
          },
        ],
      },
      append: false,
      lastChunk: true,
    };
  }
}
