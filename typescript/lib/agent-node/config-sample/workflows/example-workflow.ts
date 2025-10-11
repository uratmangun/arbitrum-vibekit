import type { WorkflowPlugin, WorkflowContext, WorkflowYield } from '../../src/workflows/types.js';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'example-workflow',
  name: 'Example Workflow',
  description: 'A sample workflow demonstrating the workflow plugin system',
  version: '1.0.0',

  inputSchema: z.object({
    message: z.string().optional(),
    count: z.number().int().positive().optional().default(1),
  }),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowYield, void, unknown> {
    const { message = 'Hello from example workflow!', count = 1 } = context.parameters ?? {};

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: 'Processing workflow...',
      },
    };

    // Simulate some work
    for (let i = 0; i < (count as number); i++) {
      yield {
        type: 'progress',
        current: i + 1,
        total: count as number,
      };

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Produce an artifact
    yield {
      type: 'artifact',
      artifact: {
        name: 'example-result.json',
        mimeType: 'application/json',
        data: JSON.stringify({
          message,
          count,
          timestamp: new Date().toISOString(),
        }),
      },
    };

    yield {
      type: 'status',
      status: {
        state: 'completed',
        message: 'Workflow completed successfully',
      },
    };
  },
};

export default plugin;
