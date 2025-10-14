import type { AIContext, AIOptions, AIService } from '../../../src/ai/service.js';

/**
 * Stub implementation of AIService for testing
 */
export class StubAIService implements Partial<AIService> {
  public readonly availableTools = new Map<string, unknown>();
  public readonly processCalls: Array<{ context: AIContext; options?: AIOptions }> = [];
  public processHandler?: (context: AIContext, options?: AIOptions) => AsyncIterable<unknown>;

  streamMessage(context: AIContext, options?: AIOptions): AsyncIterable<unknown> {
    this.processCalls.push({ context, options });
    if (this.processHandler) {
      return this.processHandler(context, options);
    }
    // Return empty async iterable
    return (async function* () {})();
  }

  /**
   * Set a handler for streamMessage calls
   */
  setProcessHandler(
    handler: (context: AIContext, options?: AIOptions) => AsyncIterable<unknown>,
  ): void {
    this.processHandler = handler;
  }

  /**
   * Helper to set a simple generator handler
   */
  setSimpleResponse(events: unknown[]): void {
    this.processHandler = async function* () {
      await Promise.resolve();
      for (const event of events) {
        yield event;
      }
    };
  }

  /**
   * Add a tool to available tools
   */
  addTool(name: string, definition: unknown): void {
    this.availableTools.set(name, definition);
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this.processCalls.length = 0;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.clearCalls();
    this.availableTools.clear();
    this.processHandler = undefined;
  }
}
