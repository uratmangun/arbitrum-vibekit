import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

type ArtifactManagerDouble = {
  createStreamingArtifact: MockedFn<(...args: unknown[]) => { kind: string; lastChunk: boolean }>;
  createToolCallArtifact: MockedFn<(...args: unknown[]) => { kind: string }>;
  createToolResultArtifact: MockedFn<(...args: unknown[]) => { kind: string }>;
};

type StreamEventHandlerDouble = {
  handleStreamEvent: MockedFn<(...args: unknown[]) => void>;
};

type ToolCallCollectorDouble = {
  addToolCall: MockedFn<(...args: unknown[]) => void>;
  getToolCalls: MockedFn<(...args: unknown[]) => Array<{ name: string; arguments?: unknown }>>;
  clear: MockedFn<(...args: unknown[]) => void>;
};

type SetupOverrides = {
  artifactManager?: ArtifactManagerDouble;
  streamEventHandler?: StreamEventHandlerDouble;
  toolCallCollector?: ToolCallCollectorDouble;
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

type StreamProcessorModule = typeof import('./StreamProcessor.js');

type StreamProcessorInstance = InstanceType<StreamProcessorModule['StreamProcessor']>;

type ArtifactEvent = {
  kind: string;
  lastChunk?: boolean;
};

type StatusMessagePart = {
  kind: string;
  text: string;
};

type StatusUpdateEvent = {
  kind: 'status-update';
  taskId?: string;
  contextId?: string;
  status: {
    state: string;
    timestamp?: string;
    message?: {
      kind: string;
      role?: string;
      parts: StatusMessagePart[];
      referenceTaskIds?: string[];
      metadata?: Record<string, unknown>;
    };
  };
  final?: boolean;
};

vi.mock('../../../utils/logger.js', loggerMockFactory);
vi.mock('./ArtifactManager.js', () => ({
  ArtifactManager: vi.fn(),
}));
vi.mock('./StreamEventHandler.js', () => ({
  StreamEventHandler: vi.fn(),
}));
vi.mock('./ToolCallCollector.js', () => ({
  ToolCallCollector: vi.fn(),
}));

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

async function setupProcessor(overrides: SetupOverrides = {}): Promise<{
  processor: StreamProcessorInstance;
  artifactManager: ArtifactManagerDouble;
  streamEventHandler: StreamEventHandlerDouble;
  toolCallCollector: ToolCallCollectorDouble;
}> {
  const [{ ArtifactManager }, { StreamEventHandler }, { ToolCallCollector }] = await Promise.all([
    import('./ArtifactManager.js'),
    import('./StreamEventHandler.js'),
    import('./ToolCallCollector.js'),
  ]);

  const artifactManagerDouble: ArtifactManagerDouble = overrides.artifactManager ?? {
    createStreamingArtifact: vi.fn(() => ({ kind: 'artifact-update', lastChunk: false })),
    createToolCallArtifact: vi.fn(() => ({ kind: 'artifact-update' })),
    createToolResultArtifact: vi.fn(() => ({ kind: 'artifact-update' })),
  };

  const streamEventHandlerDouble: StreamEventHandlerDouble = overrides.streamEventHandler ?? {
    handleStreamEvent: vi.fn(),
  };

  const toolCallCollectorDouble: ToolCallCollectorDouble = overrides.toolCallCollector ?? {
    addToolCall: vi.fn(),
    getToolCalls: vi.fn(() => []),
    clear: vi.fn(),
  };

  const artifactManagerCtor = vi.mocked(ArtifactManager);
  artifactManagerCtor.mockReset();
  artifactManagerCtor.mockImplementation(() => artifactManagerDouble as never);

  const streamEventHandlerCtor = vi.mocked(StreamEventHandler);
  streamEventHandlerCtor.mockReset();
  streamEventHandlerCtor.mockImplementation(() => streamEventHandlerDouble as never);

  const toolCallCollectorCtor = vi.mocked(ToolCallCollector);
  toolCallCollectorCtor.mockReset();
  toolCallCollectorCtor.mockImplementation(() => toolCallCollectorDouble as never);

  const module = await import('./StreamProcessor.js');
  const processor = new module.StreamProcessor();

  return {
    processor,
    artifactManager: artifactManagerDouble,
    streamEventHandler: streamEventHandlerDouble,
    toolCallCollector: toolCallCollectorDouble,
  };
}

describe('StreamProcessor (unit)', () => {
  let eventBus: EventBusDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('processes text-delta events through the stream', async () => {
    const { processor } = await setupProcessor();

    async function* mockStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Hello' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: ' world' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(mockStream(), {
      taskId: 'task-123',
      contextId: 'ctx-1',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    expect(eventBus.publish).toHaveBeenCalled();
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('handles empty streams gracefully', async () => {
    const { processor } = await setupProcessor();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    await processor.processStream(emptyStream(), {
      taskId: 'task-empty',
      contextId: 'ctx-empty',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.status.state).toBe('completed');
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('publishes completion status after successful stream processing', async () => {
    const { processor } = await setupProcessor();

    async function* successStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Success' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(successStream(), {
      taskId: 'task-complete',
      contextId: 'ctx-complete',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.taskId).toBe('task-complete');
    expect(resolvedStatusEvent.contextId).toBe('ctx-complete');
    expect(resolvedStatusEvent.status.state).toBe('completed');
    expect(resolvedStatusEvent.status.timestamp).toEqual(expect.any(String));
    expect(resolvedStatusEvent.final).toBe(true);
  });

  it('handles stream errors and publishes failure status', async () => {
    const { processor } = await setupProcessor();

    async function* errorStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
      throw new Error('Stream processing failed');
    }

    await processor.processStream(errorStream(), {
      taskId: 'task-error',
      contextId: 'ctx-error',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.taskId).toBe('task-error');
    expect(resolvedStatusEvent.contextId).toBe('ctx-error');
    expect(resolvedStatusEvent.status.state).toBe('failed');
    const firstStatusPart = resolvedStatusEvent.status.message?.parts?.[0];
    expect(firstStatusPart?.kind).toBe('text');
    expect(firstStatusPart?.text).toContain('Stream processing failed');
    expect(resolvedStatusEvent.final).toBe(true);
    expect(eventBus.finished).toHaveBeenCalledOnce();
  });

  it('handles non-Error exceptions gracefully', async () => {
    const { processor } = await setupProcessor();

    async function* nonErrorStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
      throw 'String error' as unknown as Error;
    }

    await processor.processStream(nonErrorStream(), {
      taskId: 'task-string-error',
      contextId: 'ctx-string-error',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const statusEvent = eventBus.publish.mock.calls
      .map(([event]) => event as StatusUpdateEvent)
      .find((event) => event.kind === 'status-update');

    expect(statusEvent).toBeDefined();
    const resolvedStatusEvent = statusEvent as StatusUpdateEvent;
    expect(resolvedStatusEvent.status.state).toBe('failed');
    const firstStatusPart = resolvedStatusEvent.status.message?.parts?.[0];
    expect(firstStatusPart?.kind).toBe('text');
    expect(firstStatusPart?.text).toContain('String error');
  });

  describe('workflow dispatch handling', () => {
    it('dispatches workflows and emits referenceTaskIds message', async () => {
      // Given: A stream with workflow tool calls
      const fakeCollector: ToolCallCollectorDouble = {
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => [
          { name: 'dispatch_workflow_trading', arguments: { action: 'buy' } },
        ]),
        clear: vi.fn(),
      };

      const { processor } = await setupProcessor({ toolCallCollector: fakeCollector });
      const onWorkflowDispatch = vi.fn().mockResolvedValue({
        taskId: 'task-workflow-child',
        metadata: {
          workflowName: 'Token Trading',
          description: 'Execute token trades on DEXs',
          pluginId: 'trading',
        },
      });

      async function* workflowStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'tool-call', toolName: 'dispatch_workflow_trading' } as TextStreamPart<
          Record<string, Tool>
        >;
      }

      // When: The stream is processed
      await processor.processStream(workflowStream(), {
        taskId: 'task-parent',
        contextId: 'ctx-workflow',
        eventBus: eventBus as unknown as ExecutionEventBus,
        onWorkflowDispatch,
      });

      // Then: Workflow should be dispatched
      expect(onWorkflowDispatch).toHaveBeenCalledWith(
        'dispatch_workflow_trading',
        { action: 'buy' },
        'ctx-workflow',
        eventBus,
      );

      // And: Status update with referenceTaskIds should be emitted
      const statusUpdates = eventBus.publish.mock.calls
        .map(([event]) => event as StatusUpdateEvent)
        .filter((event) => event.kind === 'status-update');

      const referenceUpdate = statusUpdates.find(
        (update) => update.status.message?.referenceTaskIds,
      );

      expect(referenceUpdate).toBeDefined();
      expect(referenceUpdate?.taskId).toBe('task-parent');
      expect(referenceUpdate?.contextId).toBe('ctx-workflow');
      expect(referenceUpdate?.status.state).toBe('working');
      expect(referenceUpdate?.status.message?.referenceTaskIds).toEqual(['task-workflow-child']);
      expect(referenceUpdate?.status.message?.role).toBe('agent');

      const messagePart = referenceUpdate?.status.message?.parts?.[0];
      expect(messagePart?.kind).toBe('text');
      expect(messagePart?.text).toBe(
        'Dispatching workflow: Token Trading (Execute token trades on DEXs)',
      );

      const messageMetadata = referenceUpdate?.status.message?.metadata as {
        referencedWorkflow?: { workflowName: string; description: string; pluginId: string };
      };
      expect(messageMetadata?.referencedWorkflow).toEqual({
        workflowName: 'Token Trading',
        description: 'Execute token trades on DEXs',
        pluginId: 'trading',
      });
      expect(referenceUpdate?.final).toBe(false);
    });

    it('dispatches multiple workflows and emits multiple referenceTaskIds messages', async () => {
      // Given: A stream with multiple workflow tool calls
      const fakeCollector: ToolCallCollectorDouble = {
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => [
          { name: 'dispatch_workflow_trading', arguments: { action: 'buy' } },
          { name: 'dispatch_workflow_lending', arguments: { amount: '1000' } },
        ]),
        clear: vi.fn(),
      };

      const { processor } = await setupProcessor({ toolCallCollector: fakeCollector });
      const onWorkflowDispatch = vi
        .fn()
        .mockResolvedValueOnce({
          taskId: 'task-workflow-trading',
          metadata: {
            workflowName: 'Token Trading',
            description: 'Execute token trades',
            pluginId: 'trading',
          },
        })
        .mockResolvedValueOnce({
          taskId: 'task-workflow-lending',
          metadata: {
            workflowName: 'Lending Protocol',
            description: 'Manage lending positions',
            pluginId: 'lending',
          },
        });

      async function* workflowStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'tool-call', toolName: 'dispatch_workflow_trading' } as TextStreamPart<
          Record<string, Tool>
        >;
      }

      // When: The stream is processed
      await processor.processStream(workflowStream(), {
        taskId: 'task-parent',
        contextId: 'ctx-workflow',
        eventBus: eventBus as unknown as ExecutionEventBus,
        onWorkflowDispatch,
      });

      // Then: Both workflows should be dispatched
      expect(onWorkflowDispatch).toHaveBeenCalledTimes(2);
      expect(onWorkflowDispatch).toHaveBeenCalledWith(
        'dispatch_workflow_trading',
        { action: 'buy' },
        'ctx-workflow',
        eventBus,
      );
      expect(onWorkflowDispatch).toHaveBeenCalledWith(
        'dispatch_workflow_lending',
        { amount: '1000' },
        'ctx-workflow',
        eventBus,
      );

      // And: Two status updates with referenceTaskIds should be emitted
      const statusUpdates = eventBus.publish.mock.calls
        .map(([event]) => event as StatusUpdateEvent)
        .filter(
          (event) => event.kind === 'status-update' && event.status.message?.referenceTaskIds,
        );

      expect(statusUpdates).toHaveLength(2);
      expect(statusUpdates[0]?.status.message?.referenceTaskIds).toEqual(['task-workflow-trading']);
      expect(statusUpdates[1]?.status.message?.referenceTaskIds).toEqual(['task-workflow-lending']);
    });

    it('does not dispatch non-workflow tool calls', async () => {
      const fakeCollector: ToolCallCollectorDouble = {
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => [
          { name: 'get_price', arguments: { token: 'ETH' } },
          { name: 'calculate_slippage', arguments: { amount: '100' } },
        ]),
        clear: vi.fn(),
      };

      const { processor } = await setupProcessor({ toolCallCollector: fakeCollector });
      const onWorkflowDispatch = vi.fn();

      async function* toolStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'tool-call', toolName: 'get_price' } as TextStreamPart<Record<string, Tool>>;
      }

      await processor.processStream(toolStream(), {
        taskId: 'task-tools',
        contextId: 'ctx-tools',
        eventBus: eventBus as unknown as ExecutionEventBus,
        onWorkflowDispatch,
      });

      expect(onWorkflowDispatch).not.toHaveBeenCalled();
    });

    it('handles workflow dispatch without callback gracefully', async () => {
      const fakeCollector: ToolCallCollectorDouble = {
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => [{ name: 'dispatch_workflow_test', arguments: {} }]),
        clear: vi.fn(),
      };

      const { processor } = await setupProcessor({ toolCallCollector: fakeCollector });

      async function* workflowStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'tool-call', toolName: 'dispatch_workflow_test' } as TextStreamPart<
          Record<string, Tool>
        >;
      }

      await processor.processStream(workflowStream(), {
        taskId: 'task-no-callback',
        contextId: 'ctx-no-callback',
        eventBus: eventBus as unknown as ExecutionEventBus,
      });

      expect(eventBus.finished).toHaveBeenCalledOnce();
    });
  });

  it('calls finished() exactly once for each scenario', async () => {
    const scenarios: Array<() => AsyncIterable<TextStreamPart<Record<string, Tool>>>> = [
      async function* success(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'test' } as TextStreamPart<Record<string, Tool>>;
      },
      async function* error(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'Starting...' } as TextStreamPart<Record<string, Tool>>;
        throw new Error('test error');
      },
      async function* empty(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
        await Promise.resolve();
        for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
          yield event;
        }
      },
    ];

    for (const createStream of scenarios) {
      const localEventBus = createEventBus();
      const { processor } = await setupProcessor();

      await processor.processStream(createStream(), {
        taskId: 'task-test',
        contextId: 'ctx-test',
        eventBus: localEventBus as unknown as ExecutionEventBus,
      });

      expect(localEventBus.finished).toHaveBeenCalledOnce();
    }
  });
});

describe('StreamProcessor artifact flushing', () => {
  const createRealProcessor = async (): Promise<StreamProcessorInstance> => {
    vi.resetModules();
    vi.doMock('../../../utils/logger.js', loggerMockFactory);
    vi.doUnmock('./StreamEventHandler.js');
    vi.doUnmock('./ArtifactManager.js');
    vi.doMock('./ToolCallCollector.js', () => ({
      ToolCallCollector: vi.fn(() => ({
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => []),
        clear: vi.fn(),
      })),
    }));

    const module = await import('./StreamProcessor.js');
    return new module.StreamProcessor();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes buffered artifacts when stream ends without explicit end events', async () => {
    const processor = await createRealProcessor();
    const eventBus = createEventBus();

    async function* stream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Hello' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: ' world' } as TextStreamPart<Record<string, Tool>>;
    }

    await processor.processStream(stream(), {
      taskId: 'task-flush',
      contextId: 'ctx-flush',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const artifactEvents = eventBus.publish.mock.calls
      .map(([event]) => event as ArtifactEvent)
      .filter((event) => event.kind === 'artifact-update');

    expect(artifactEvents).not.toHaveLength(0);
    expect(artifactEvents[artifactEvents.length - 1]).toEqual(
      expect.objectContaining({ lastChunk: true }),
    );
  });

  it('does not publish artifact updates when no buffered artifacts exist', async () => {
    const processor = await createRealProcessor();
    const eventBus = createEventBus();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    await processor.processStream(emptyStream(), {
      taskId: 'task-no-buffer',
      contextId: 'ctx-no-buffer',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    const artifactEvents = eventBus.publish.mock.calls
      .map(([event]) => event as ArtifactEvent)
      .filter((event) => event.kind === 'artifact-update');

    expect(artifactEvents).toHaveLength(0);
  });
});

describe('StreamProcessor reasoning block ordering', () => {
  let eventBus: EventBusDouble;

  const createRealProcessor = async (): Promise<StreamProcessorInstance> => {
    vi.resetModules();
    vi.doMock('../../../utils/logger.js', loggerMockFactory);
    vi.doUnmock('./StreamEventHandler.js');
    vi.doUnmock('./ArtifactManager.js');
    vi.doMock('./ToolCallCollector.js', () => ({
      ToolCallCollector: vi.fn(() => ({
        addToolCall: vi.fn(),
        getToolCalls: vi.fn(() => []),
        clear: vi.fn(),
      })),
    }));

    const module = await import('./StreamProcessor.js');
    return new module.StreamProcessor();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();
  });

  it('builds AssistantModelMessage with reasoning before text content', async () => {
    // Given: A stream with both reasoning and text content
    const processor = await createRealProcessor();

    async function* streamWithReasoning(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield {
        type: 'reasoning-delta',
        id: 'reasoning-1',
        text: 'Let me think about this...',
      } as TextStreamPart<Record<string, Tool>>;
      yield {
        type: 'reasoning-delta',
        id: 'reasoning-2',
        text: ' Step by step.',
      } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'reasoning-end' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-delta', text: 'Here is my response' } as TextStreamPart<
        Record<string, Tool>
      >;
      yield { type: 'text-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(streamWithReasoning(), {
      taskId: 'task-reasoning',
      contextId: 'ctx-reasoning',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: AssistantModelMessage should have reasoning first, then text
    expect(assistantMessage).not.toBeNull();
    expect(assistantMessage?.role).toBe('assistant');
    expect(Array.isArray(assistantMessage?.content)).toBe(true);

    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(2);

    // Reasoning block must come first (required by Anthropic)
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Let me think about this... Step by step.',
    });

    // Text content comes second
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Here is my response',
    });
  });

  it('returns null when stream has no content', async () => {
    // Given: An empty stream
    const processor = await createRealProcessor();

    async function* emptyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      for (const event of [] as TextStreamPart<Record<string, Tool>>[]) {
        yield event;
      }
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(emptyStream(), {
      taskId: 'task-empty',
      contextId: 'ctx-empty',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should return null (no message to store)
    expect(assistantMessage).toBeNull();
  });

  it('builds message with only text when no reasoning present', async () => {
    // Given: A stream with only text (no reasoning)
    const processor = await createRealProcessor();

    async function* textOnlyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Simple response' } as TextStreamPart<Record<string, Tool>>;
      yield { type: 'text-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(textOnlyStream(), {
      taskId: 'task-text-only',
      contextId: 'ctx-text-only',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should have only one content block
    expect(assistantMessage).not.toBeNull();
    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Simple response',
    });
  });

  it('builds message with only reasoning when no text present', async () => {
    // Given: A stream with only reasoning (no text)
    const processor = await createRealProcessor();

    async function* reasoningOnlyStream(): AsyncIterable<TextStreamPart<Record<string, Tool>>> {
      await Promise.resolve();
      yield { type: 'reasoning-delta', id: 'reasoning-3', text: 'Just thinking' } as TextStreamPart<
        Record<string, Tool>
      >;
      yield { type: 'reasoning-end' } as TextStreamPart<Record<string, Tool>>;
    }

    // When: The stream is processed
    const assistantMessage = await processor.processStream(reasoningOnlyStream(), {
      taskId: 'task-reasoning-only',
      contextId: 'ctx-reasoning-only',
      eventBus: eventBus as unknown as ExecutionEventBus,
    });

    // Then: Should have only one content block
    expect(assistantMessage).not.toBeNull();
    const content = assistantMessage?.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Just thinking',
    });
  });
});
