/**
 * Collects and manages tool calls during stream processing
 */

export interface ToolCall {
  name: string;
  arguments: unknown;
  result?: unknown;
}

/**
 * Manages collection of tool calls during stream processing
 */
export class ToolCallCollector {
  private toolCalls: ToolCall[] = [];

  /**
   * Add a new tool call
   */
  addToolCall(toolCall: ToolCall): void {
    this.toolCalls.push(toolCall);
  }

  /**
   * Get all collected tool calls
   */
  getToolCalls(): ToolCall[] {
    return this.toolCalls;
  }

  /**
   * Update the last tool call with a result
   */
  updateLastToolCallResult(result: unknown): void {
    const lastCall = this.toolCalls[this.toolCalls.length - 1];
    if (lastCall) {
      lastCall.result = result;
    }
  }

  /**
   * Get the last tool call
   */
  getLastToolCall(): ToolCall | undefined {
    return this.toolCalls[this.toolCalls.length - 1];
  }

  /**
   * Clear all tool calls
   */
  clear(): void {
    this.toolCalls = [];
  }

  /**
   * Get the count of tool calls
   */
  getCount(): number {
    return this.toolCalls.length;
  }
}
