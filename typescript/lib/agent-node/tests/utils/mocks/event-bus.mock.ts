import { DefaultExecutionEventBusManager } from '@a2a-js/sdk/server';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { vi } from 'vitest';

type AgentExecutionEvent = Parameters<ExecutionEventBus['publish']>[0];

/**
 * Mock implementation of ExecutionEventBus for testing
 * Records all published events and tracks finished() calls
 */
export class RecordingEventBus implements ExecutionEventBus {
  public readonly published: AgentExecutionEvent[] = [];
  public finishedCount = 0;

  publish(event: AgentExecutionEvent): void {
    this.published.push(event);
  }

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }

  once(): this {
    return this;
  }

  removeAllListeners(): this {
    return this;
  }

  finished(): void {
    this.finishedCount += 1;
  }

  /**
   * Helper method to find events by kind
   */
  findEventsByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }>[] {
    return this.published.filter((event) => event.kind === kind) as Extract<
      AgentExecutionEvent,
      { kind: T['kind'] }
    >[];
  }

  /**
   * Helper to get the first event of a specific kind
   */
  findFirstEventByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }> | undefined {
    return this.findEventsByKind(kind)[0];
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.published.length = 0;
    this.finishedCount = 0;
  }
}

/**
 * Create a mock event bus with vi.fn() spies
 */
export function createMockEventBus(): ReturnType<typeof vi.fn> & ExecutionEventBus {
  return {
    publish: vi.fn(),
    finished: vi.fn(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn().mockReturnThis(),
  };
}

/**
 * Wrapper around real SDK event bus that also records events for assertions
 * Use this for integration tests that need to validate SDK behavior
 */
export class RecordingRealEventBus implements ExecutionEventBus {
  public readonly published: AgentExecutionEvent[] = [];
  private readonly realBus: ExecutionEventBus;

  constructor(taskId: string) {
    // Create real SDK event bus via manager (uses taskId as key)
    const manager = new DefaultExecutionEventBusManager();
    this.realBus = manager.createOrGetByTaskId(taskId);
  }

  publish(event: AgentExecutionEvent): void {
    // Record for assertions
    this.published.push(event);
    // Pass through to real SDK bus for actual routing
    this.realBus.publish(event);
  }

  on(...args: Parameters<ExecutionEventBus['on']>): this {
    this.realBus.on(...args);
    return this;
  }

  off(...args: Parameters<ExecutionEventBus['off']>): this {
    this.realBus.off(...args);
    return this;
  }

  once(...args: Parameters<ExecutionEventBus['once']>): this {
    this.realBus.once(...args);
    return this;
  }

  removeAllListeners(): this {
    this.realBus.removeAllListeners();
    return this;
  }

  finished(): void {
    this.realBus.finished();
  }

  /**
   * Helper method to find events by kind
   */
  findEventsByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }>[] {
    return this.published.filter((event) => event.kind === kind) as Extract<
      AgentExecutionEvent,
      { kind: T['kind'] }
    >[];
  }

  /**
   * Helper to get the first event of a specific kind
   */
  findFirstEventByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }> | undefined {
    return this.findEventsByKind(kind)[0];
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.published.length = 0;
  }
}
