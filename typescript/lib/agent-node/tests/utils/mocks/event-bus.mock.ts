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
