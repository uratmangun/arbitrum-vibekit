# **Lesson 14: Asynchronous Operations and Workflows**

---

### 🔍 Overview

> 📝 **Note:** This lesson replaces the legacy "Long-Running Tasks and Loops" pattern with v2's async/await workflow approach and background job patterns.

In v2, long-running and asynchronous operations are handled through modern async/await patterns, workflow tools, and proper task orchestration rather than explicit loops and polling. The framework embraces JavaScript's native async capabilities for cleaner, more maintainable code.

---

### 🔄 Async/Await Patterns

#### **Basic Async Tool Implementation**

```typescript
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';

const processTransactionParams = z.object({
  txHash: z.string(),
  confirmations: z.number().default(1),
});

export const asyncTool: VibkitToolDefinition<typeof processTransactionParams> = {
  name: 'processTransaction',
  description: 'Process and wait for transaction confirmation',
  parameters: processTransactionParams,
  execute: async (args, context) => {
    // Wait for transaction
    const tx = await context.custom.provider.getTransaction(args.txHash);

    // Wait for confirmations
    const receipt = await tx.wait(args.confirmations);

    return {
      success: receipt.status === 1,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  },
};
```

---

### 🌊 Workflow Tool Patterns

#### **Multi-Step Workflow**

```typescript
const swapWorkflowParams = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amount: z.string(),
  slippage: z.number(),
});

export const swapWorkflowTool: VibkitToolDefinition<typeof swapWorkflowParams> = {
  name: 'executeSwapWorkflow',
  description: 'Complete swap workflow: quote → approve → execute',
  parameters: swapWorkflowParams,
  execute: async (args, context) => {
    try {
      // Step 1: Get quote
      const quote = await getQuote({
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amount: args.amount,
      });

      // Step 2: Check and approve if needed
      const allowance = await checkAllowance(args.tokenIn, context.userAddress, ROUTER_ADDRESS);

      if (allowance < BigInt(args.amount)) {
        const approveTx = await approveToken(args.tokenIn, ROUTER_ADDRESS, args.amount);
        await approveTx.wait();
      }

      // Step 3: Execute swap
      const swapTx = await executeSwap(quote, args.slippage);
      const receipt = await swapTx.wait();

      return {
        success: true,
        transactionHash: receipt.hash,
        amountOut: quote.amountOut,
      };
    } catch (error) {
      throw new Error(`Swap workflow failed: ${error.message}`);
    }
  },
};
```

---

### ⏱️ Background Operations

#### **Non-Blocking Tasks**

```typescript
const monitorParams = z.object({
  positionId: z.string(),
});

export const monitorTool: VibkitToolDefinition<typeof monitorParams> = {
  name: 'monitorPosition',
  description: 'Monitor position and return immediately',
  parameters: monitorParams,
  execute: async (args, context) => {
    // Start monitoring in background (don't await)
    startPositionMonitoring(args.positionId, context).catch(err => {
      console.error('Monitor error:', err);
    });

    return {
      monitoring: true,
      positionId: args.positionId,
      message: 'Position monitoring started',
    };
  },
};

async function startPositionMonitoring(positionId: string, context: Context) {
  while (true) {
    const position = await fetchPosition(positionId);

    if (position.healthFactor < 1.1) {
      // Trigger alert or action
      await sendAlert(positionId, position);
      break;
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
  }
}
```

---

### 🔁 Retry and Resilience Patterns

#### **Retry Logic**

```typescript
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

const fetchReliablyParams = z.object({ url: z.string() });

export const reliableTool: VibkitToolDefinition<typeof fetchReliablyParams> = {
  name: 'fetchDataReliably',
  description: 'Fetch data with retry logic',
  parameters: fetchReliablyParams,
  execute: async args => {
    const data = await withRetry(() => fetch(args.url).then(r => r.json()), 3, 2000);
    return data;
  },
};
```

#### **Timeout Handling**

```typescript
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );

  return Promise.race([operation, timeout]);
}

const fetchWithTimeoutParams = z.object({ resource: z.string() });

export const timedTool: VibkitToolDefinition<typeof fetchWithTimeoutParams> = {
  name: 'fetchWithTimeout',
  description: 'Fetch with 10 second timeout',
  parameters: fetchWithTimeoutParams,
  execute: async args => {
    return await withTimeout(
      fetchExpensiveResource(args.resource),
      10000,
      'Resource fetch timed out after 10s'
    );
  },
};
```

---

### 🎭 Parallel Operations

#### **Promise.all for Parallel Execution**

```typescript
const batchPricesParams = z.object({
  tokens: z.array(z.string()),
});

export const batchTool: VibkitToolDefinition<typeof batchPricesParams> = {
  name: 'fetchMultiplePrices',
  description: 'Fetch prices for multiple tokens in parallel',
  parameters: batchPricesParams,
  execute: async (args, context) => {
    // Execute all price fetches in parallel
    const pricePromises = args.tokens.map(token => context.priceOracle.getPrice(token));

    const prices = await Promise.all(pricePromises);

    return {
      prices: args.tokens.reduce(
        (acc, token, i) => {
          acc[token] = prices[i];
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  },
};
```

#### **Promise.allSettled for Error Handling**

```typescript
const fetchWithFallbacksParams = z.object({
  sources: z.array(z.string()),
});

export const batchWithFallback: VibkitToolDefinition<typeof fetchWithFallbacksParams> = {
  name: 'fetchWithFallbacks',
  description: 'Try multiple sources, use what succeeds',
  parameters: fetchWithFallbacksParams,
  execute: async args => {
    const results = await Promise.allSettled(args.sources.map(source => fetchFromSource(source)));

    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason.message);

    return {
      data: successful,
      errors: failed,
      successRate: successful.length / args.sources.length,
    };
  },
};
```

---

### 🔗 Related Resources

- [Lesson 13: Error Handling](./lesson-13.md)
- [Lesson 23: Workflow Tools and Design Patterns](./lesson-23.md)
- [Lesson 14 (Legacy): Long-Running Tasks and Loops](./lesson-14-legacy.md) - Old approach

---

**Next:** [Lesson 15: Agent Monetization and Payment Flows](./lesson-15.md)
