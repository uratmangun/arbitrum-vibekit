import type { TaskArtifactUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart } from 'ai';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import type { ArtifactManager } from './ArtifactManager.js';
import { StreamEventHandler, type StreamProcessingState } from './StreamEventHandler.js';
import type { ToolCallCollector } from './ToolCallCollector.js';

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

describe('StreamEventHandler', () => {
  let handler: StreamEventHandler;
  let mockEventBus: {
    publish: Mock;
    finished: Mock;
  };
  let mockArtifactManager: {
    createStreamingArtifact: Mock;
    createToolCallArtifact: Mock;
    createToolResultArtifact: Mock;
  };
  let mockToolCallCollector: {
    addToolCall: Mock;
    getToolCalls: Mock;
  };
  let mockState: StreamProcessingState;

  beforeEach(() => {
    handler = new StreamEventHandler();

    mockEventBus = {
      publish: vi.fn(),
      finished: vi.fn(),
    };

    mockArtifactManager = {
      createStreamingArtifact: vi.fn().mockReturnValue({
        kind: 'artifact-update',
        artifactId: 'test-artifact',
        lastChunk: false,
      }),
      createToolCallArtifact: vi.fn().mockReturnValue({
        kind: 'artifact-update',
        artifact: { artifactId: 'tool-artifact' },
      }),
      createToolResultArtifact: vi.fn().mockReturnValue({
        kind: 'artifact-update',
        artifactId: 'result-artifact',
      }),
    };

    mockToolCallCollector = {
      addToolCall: vi.fn(),
      getToolCalls: vi.fn().mockReturnValue([]),
    };

    mockState = {
      textChunkIndex: 0,
      reasoningChunkIndex: 0,
      bufferedArtifact: null,
      bufferedReasoningArtifact: null,
      toolCallArtifacts: new Map(),
      deltaCounters: { 'tool-input-delta': 0 },
      accumulatedText: '',
      accumulatedReasoning: '',
    };
  });

  describe('text-delta event handling', () => {
    it('buffers text deltas and publishes previous chunk', () => {
      // Given a text-delta event and existing buffered artifact
      const existingArtifact: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId: 'task-123',
        contextId: 'ctx-1',
        artifact: {
          artifactId: 'previous',
          parts: [{ kind: 'text', text: 'previous content' }] as const,
        },
        lastChunk: false,
      };
      mockState.bufferedArtifact = existingArtifact;

      const textEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'text-delta',
        id: 'test-id',
        text: 'Hello world',
      };

      // When handling the text-delta event
      void handler.handleStreamEvent(
        textEvent,
        'task-123',
        'ctx-1',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then previous artifact should be published and new one buffered
      expect(mockEventBus.publish).toHaveBeenCalledWith(existingArtifact);
      expect(mockArtifactManager.createStreamingArtifact).toHaveBeenCalledWith(
        'task-123',
        'ctx-1',
        'text-response',
        'Hello world',
        0,
        false,
      );
      expect(mockState.textChunkIndex).toBe(1);
      expect(mockState.bufferedArtifact).toBeTruthy();
      expect(mockState.accumulatedText).toBe('Hello world');
    });

    it('handles empty text in text-delta event', () => {
      // Given a text-delta event with empty text
      const emptyTextEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'text-delta',
        id: 'test-id',
        text: '',
      };

      // When handling the event
      void handler.handleStreamEvent(
        emptyTextEvent,
        'task-123',
        'ctx-1',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then artifact should still be created
      expect(mockArtifactManager.createStreamingArtifact).toHaveBeenCalledWith(
        'task-123',
        'ctx-1',
        'text-response',
        '',
        0,
        false,
      );
    });

    it('handles text-delta without text property gracefully', () => {
      // Given a text-delta event without text property
      const noTextEvent = { type: 'text-delta', id: 'test-id' } as unknown as TextStreamPart<
        Record<string, Tool>
      >;

      // When handling the event
      void handler.handleStreamEvent(
        noTextEvent,
        'task-123',
        'ctx-1',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then no artifact should be created
      expect(mockArtifactManager.createStreamingArtifact).not.toHaveBeenCalled();
    });
  });

  describe('text-end event handling', () => {
    it('flushes buffered artifact and marks last chunk', () => {
      // Given a buffered artifact waiting to flush
      const bufferedArtifact: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId: 'task-789',
        contextId: 'ctx-text-end',
        artifact: {
          artifactId: 'text-response-task-789',
          parts: [{ kind: 'text', text: 'partial response' }] as const,
        },
        lastChunk: false,
      };
      mockState.bufferedArtifact = bufferedArtifact;

      const textEndEvent = { type: 'text-end' } as TextStreamPart<Record<string, Tool>>;

      // When flushing on text-end
      handler.handleStreamEvent(
        textEndEvent,
        'task-789',
        'ctx-text-end',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then buffered artifact should be published and cleared with lastChunk flag
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ lastChunk: true }),
      );
      expect(bufferedArtifact.lastChunk).toBe(true);
      expect(mockState.bufferedArtifact).toBeNull();
    });
  });

  describe('reasoning event handling', () => {
    it('buffers reasoning deltas and increments chunk index', () => {
      // Given a reasoning delta event
      const reasoningEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'reasoning-delta',
        id: 'reasoning-1',
        text: 'Thinking...',
      };

      // When handling the reasoning delta
      handler.handleStreamEvent(
        reasoningEvent,
        'task-reason',
        'ctx-reason',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then reasoning text should accumulate and buffered artifact updated
      expect(mockState.accumulatedReasoning).toBe('Thinking...');
      expect(mockState.reasoningChunkIndex).toBe(1);
      expect(mockState.bufferedReasoningArtifact).toBeTruthy();
    });

    it('flushes buffered reasoning artifact on reasoning-end', () => {
      // Given a buffered reasoning artifact awaiting completion
      const reasoningArtifact: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId: 'task-reason-end',
        contextId: 'ctx-reason-end',
        artifact: {
          artifactId: 'reasoning-task-reason-end',
          parts: [{ kind: 'text', text: 'intermediate thoughts' }] as const,
        },
        lastChunk: false,
      };
      mockState.bufferedReasoningArtifact = reasoningArtifact;

      const reasoningEndEvent = { type: 'reasoning-end' } as TextStreamPart<Record<string, Tool>>;

      // When handling reasoning-end
      handler.handleStreamEvent(
        reasoningEndEvent,
        'task-reason-end',
        'ctx-reason-end',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then buffered reasoning artifact is published and cleared
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ lastChunk: true }),
      );
      expect(reasoningArtifact.lastChunk).toBe(true);
      expect(mockState.bufferedReasoningArtifact).toBeNull();
    });
  });

  describe('tool-call event handling', () => {
    it('creates tool call artifact and adds to collector', () => {
      // Given a tool-call event
      const toolCallEvent = {
        type: 'tool-call' as const,
        toolCallId: 'call-1',
        toolName: 'calculate_price',
        input: { amount: 100, currency: 'USD' },
      };

      // When handling the tool-call event
      void handler.handleStreamEvent(
        toolCallEvent,
        'task-456',
        'ctx-2',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then artifact should be created and published
      expect(mockArtifactManager.createToolCallArtifact).toHaveBeenCalledWith(
        'task-456',
        'ctx-2',
        'calculate_price',
        {},
      );
      expect(mockEventBus.publish).toHaveBeenCalled();
      expect(mockToolCallCollector.addToolCall).toHaveBeenCalledWith({
        name: 'calculate_price',
        arguments: { amount: 100, currency: 'USD' },
      });
      expect(mockState.toolCallArtifacts.size).toBe(1);
    });

    it('handles tool-call without input property', () => {
      // Given a tool-call event without input
      const toolCallNoInput = {
        type: 'tool-call' as const,
        toolCallId: 'call-2',
        toolName: 'get_time',
      } as unknown as TextStreamPart<Record<string, Tool>>;

      // When handling the event
      void handler.handleStreamEvent(
        toolCallNoInput,
        'task-789',
        'ctx-3',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then tool call should be added with undefined arguments
      expect(mockToolCallCollector.addToolCall).toHaveBeenCalledWith({
        name: 'get_time',
        arguments: undefined,
      });
    });

    it('handles tool-call without toolName property gracefully', () => {
      // Given a tool-call event without toolName
      const noToolNameEvent = {
        type: 'tool-call' as const,
        toolCallId: 'call-3',
        input: {},
      } as unknown as TextStreamPart<Record<string, Tool>>;

      // When handling the event
      void handler.handleStreamEvent(
        noToolNameEvent,
        'task-123',
        'ctx-1',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then no processing should occur
      expect(mockArtifactManager.createToolCallArtifact).not.toHaveBeenCalled();
      expect(mockToolCallCollector.addToolCall).not.toHaveBeenCalled();
    });
  });

  describe('tool-result event handling', () => {
    it('updates last tool call with result and publishes artifact', () => {
      // Given a tool-result event and a previous tool call
      mockToolCallCollector.getToolCalls.mockReturnValue([
        { name: 'tool_a', arguments: {}, result: undefined },
        { name: 'tool_b', arguments: {}, result: undefined },
      ]);

      mockState.toolCallArtifacts.set(1, 'artifact-tool-b');

      const toolResultEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'tool-result',
        toolCallId: 'call-result-1',
        toolName: 'tool_b',
        input: {},
        output: { success: true, data: 'result data' },
      };

      // When handling the tool-result event
      void handler.handleStreamEvent(
        toolResultEvent,
        'task-result',
        'ctx-result',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then result artifact should be created and published
      expect(mockArtifactManager.createToolResultArtifact).toHaveBeenCalledWith(
        'task-result',
        'ctx-result',
        'artifact-tool-b',
        'tool_b',
        { success: true, data: 'result data' },
      );
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('handles null output in tool-result', () => {
      // Given a tool-result with null output
      mockToolCallCollector.getToolCalls.mockReturnValue([{ name: 'tool_null', arguments: {} }]);
      mockState.toolCallArtifacts.set(0, 'artifact-null');

      const nullResultEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'tool-result',
        toolCallId: 'call-null',
        toolName: 'tool_null',
        input: {},
        output: null,
      };

      // When handling the event
      void handler.handleStreamEvent(
        nullResultEvent,
        'task-null',
        'ctx-null',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then result artifact should be created with null output
      expect(mockArtifactManager.createToolResultArtifact).toHaveBeenCalledWith(
        'task-null',
        'ctx-null',
        'artifact-null',
        'tool_null',
        null,
      );
    });

    it('handles tool-result without corresponding tool call gracefully', () => {
      // Given no previous tool calls
      mockToolCallCollector.getToolCalls.mockReturnValue([]);

      const orphanResultEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'tool-result',
        toolCallId: 'call-orphan',
        toolName: 'unknown_tool',
        input: {},
        output: { data: 'orphan result' },
      };

      // When handling the event
      void handler.handleStreamEvent(
        orphanResultEvent,
        'task-orphan',
        'ctx-orphan',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then no result artifact should be created
      expect(mockArtifactManager.createToolResultArtifact).not.toHaveBeenCalled();
    });
  });

  describe('reasoning event handling', () => {
    it('handles reasoning-delta events with buffering', () => {
      // Given a reasoning-delta event
      const reasoningEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'reasoning-delta',
        id: 'reasoning-2',
        text: 'Thinking about the solution...',
      };

      // When handling the reasoning-delta event
      void handler.handleStreamEvent(
        reasoningEvent,
        'task-reason',
        'ctx-reason',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then reasoning artifact should be created and buffered
      expect(mockArtifactManager.createStreamingArtifact).toHaveBeenCalledWith(
        'task-reason',
        'ctx-reason',
        'reasoning',
        'Thinking about the solution...',
        0,
        false,
      );
      expect(mockState.reasoningChunkIndex).toBe(1);
      expect(mockState.bufferedReasoningArtifact).toBeTruthy();
    });

    it('handles reasoning-delta with text property', () => {
      // Given a reasoning-delta event with text property
      const reasoningTextEvent: TextStreamPart<Record<string, Tool>> = {
        type: 'reasoning-delta',
        id: 'reasoning-3',
        text: 'Using text property',
      };

      // When handling the event
      void handler.handleStreamEvent(
        reasoningTextEvent,
        'task-text',
        'ctx-text',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then artifact should be created with text content
      expect(mockArtifactManager.createStreamingArtifact).toHaveBeenCalledWith(
        'task-text',
        'ctx-text',
        'reasoning',
        'Using text property',
        0,
        false,
      );
    });

    it('handles reasoning-end event by flushing buffer', () => {
      // Given a buffered reasoning artifact
      const bufferedReasoning: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId: 'task-end',
        contextId: 'ctx-end',
        artifact: {
          artifactId: 'reasoning-buffered',
          parts: [{ kind: 'text', text: 'reasoning content' }] as const,
        },
        lastChunk: false,
      };
      mockState.bufferedReasoningArtifact = bufferedReasoning;

      const reasoningEndEvent = { type: 'reasoning-end' as const } as unknown as TextStreamPart<
        Record<string, Tool>
      >;

      // When handling reasoning-end event
      void handler.handleStreamEvent(
        reasoningEndEvent,
        'task-end',
        'ctx-end',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then buffered artifact should be published with lastChunk flag
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'artifact-update', lastChunk: true }),
      );
      expect(mockState.bufferedReasoningArtifact).toBeNull();
    });
  });

  describe('stream end events', () => {
    it('handles text-end event by flushing text buffer', () => {
      // Given a buffered text artifact
      const bufferedText: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId: 'task-text-end',
        contextId: 'ctx-text-end',
        artifact: {
          artifactId: 'text-buffered',
          parts: [{ kind: 'text', text: 'buffered text' }] as const,
        },
        lastChunk: false,
      };
      mockState.bufferedArtifact = bufferedText;

      const textEndEvent = { type: 'text-end' as const } as unknown as TextStreamPart<
        Record<string, Tool>
      >;

      // When handling text-end event
      void handler.handleStreamEvent(
        textEndEvent,
        'task-text-end',
        'ctx-text-end',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then buffered artifact should be published with lastChunk flag
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'artifact-update', lastChunk: true }),
      );
      expect(mockState.bufferedArtifact).toBeNull();
    });

    it('handles tool-input-end event by resetting counter', () => {
      // Given delta counters with tool-input-delta count
      mockState.deltaCounters['tool-input-delta'] = 5;

      const toolInputEndEvent = { type: 'tool-input-end' as const } as unknown as TextStreamPart<
        Record<string, Tool>
      >;

      // When handling tool-input-end event
      void handler.handleStreamEvent(
        toolInputEndEvent,
        'task-input-end',
        'ctx-input-end',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then delta counter should be reset
      expect(mockState.deltaCounters['tool-input-delta']).toBe(0);
    });
  });

  describe('other events', () => {
    it('counts delta events in deltaCounters', () => {
      // Given various delta events
      const deltaEvents = [
        { type: 'tool-input-delta' },
        { type: 'tool-input-delta' },
        { type: 'custom-delta' },
      ];

      // Initialize custom-delta counter
      mockState.deltaCounters['custom-delta'] = 0;

      // When handling delta events
      deltaEvents.forEach((event) => {
        void handler.handleStreamEvent(
          event as TextStreamPart<Record<string, Tool>>,
          'task-delta',
          'ctx-delta',
          mockEventBus as unknown as ExecutionEventBus,
          mockState,
          mockArtifactManager as unknown as ArtifactManager,
          mockToolCallCollector as unknown as ToolCallCollector,
        );
      });

      // Then counters should be incremented
      expect(mockState.deltaCounters['tool-input-delta']).toBe(2);
      expect(mockState.deltaCounters['custom-delta']).toBe(1);
    });

    it('handles unknown event types gracefully', () => {
      // Given an unknown event type
      const unknownEvent = {
        type: 'unknown-event-type' as const,
        data: 'some data',
      } as unknown as TextStreamPart<Record<string, Tool>>;

      // When handling the unknown event
      void handler.handleStreamEvent(
        unknownEvent,
        'task-unknown',
        'ctx-unknown',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then it should not throw and not publish anything
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('handles reasoning-start event', () => {
      // Given a reasoning-start event
      const reasoningStartEvent = { type: 'reasoning-start' as const } as unknown as TextStreamPart<
        Record<string, Tool>
      >;

      // When handling the event (just logs debug)
      void handler.handleStreamEvent(
        reasoningStartEvent,
        'task-start',
        'ctx-start',
        mockEventBus as unknown as ExecutionEventBus,
        mockState,
        mockArtifactManager as unknown as ArtifactManager,
        mockToolCallCollector as unknown as ToolCallCollector,
      );

      // Then nothing should be published (only logging occurs)
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });
});
