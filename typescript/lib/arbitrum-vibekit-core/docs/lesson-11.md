# **Lesson 11: State Management with Context Providers**

---

### 🔍 Overview

> 📝 **Note:** This lesson replaces the legacy "Global State" approach with v2's Context Provider pattern, which provides cleaner dependency injection and better testability.

In v2, state management is handled through **Context Providers** rather than global state objects. Context providers offer a clean way to share data and dependencies across tools within a skill while maintaining proper scoping and testability.

---

### 🎯 Why Context Providers Over Global State

**V2 Philosophy:**

- ✅ **Explicit Dependencies**: Tools declare what they need
- ✅ **Better Testing**: Easy to mock context in tests
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Scoped State**: Each skill can have its own context
- ✅ **No Side Effects**: Predictable behavior

**Legacy Global State Issues:**

- ❌ Hidden dependencies
- ❌ Hard to test and mock
- ❌ Potential race conditions
- ❌ Unclear data flow

---

### 🏗️ Context Provider Pattern

#### **1. Define Your Context Type**

```typescript
// src/context/types.ts
export interface LendingContext {
  rpcProvider: JsonRpcProvider;
  tokenMap: Map<string, TokenInfo>;
  aavePool: Contract;
  userAddress: string;
}
```

#### **2. Create Context Provider**

```typescript
// src/context/provider.ts
import type { ContextProvider } from 'arbitrum-vibekit-core';
import type { LendingContext } from './types.js';

export const lendingContextProvider: ContextProvider<LendingContext> = async deps => {
  const rpcProvider = new JsonRpcProvider(process.env.RPC_URL);
  const tokenMap = await loadTokenMap();
  const aavePool = new Contract(AAVE_POOL_ADDRESS, AAVE_ABI, rpcProvider);

  return {
    rpcProvider,
    tokenMap,
    aavePool,
    userAddress: deps.userAddress || '', // From runtime
  };
};
```

#### **3. Use Context in Tools**

```typescript
// src/tools/supply.ts
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { LendingContext } from '../context/types.js';
import { z } from 'zod';

const supplyParams = z.object({
  token: z.string(),
  amount: z.string(),
});

export const supplyTool: VibkitToolDefinition<typeof supplyParams, any, LendingContext> = {
  name: 'supplyToken',
  description: 'Supply tokens to Aave',
  parameters: supplyParams,
  execute: async (args, context) => {
    // Access shared state through context
    const tokenInfo = context.custom.tokenMap.get(args.token);
    const tx = await context.custom.aavePool.supply(
      tokenInfo.address,
      args.amount,
      context.custom.userAddress,
      0
    );

    return { transactionHash: tx.hash };
  },
};
```

---

### 🔄 Context Lifecycle

```
Agent Startup
     ↓
Context Provider Initialization
     ↓
Shared State Created
     ↓
Skills Registered
     ↓
Tools Receive Context
     ↓
Request Handling
```

**Key Points:**

- Context is created **once** at agent startup
- Same context instance shared across all tools in the agent
- Clean separation between initialization and execution

---

### 💡 Advanced Patterns

#### **Lazy Loading**

```typescript
export const contextProvider: ContextProvider<MyContext> = async deps => {
  let cachedData: SomeData | null = null;

  return {
    getData: async () => {
      if (!cachedData) {
        cachedData = await fetchExpensiveData();
      }
      return cachedData;
    },
  };
};
```

#### **External Service Integration**

```typescript
export const contextProvider: ContextProvider<MyContext> = async deps => {
  return {
    // Access MCP clients from runtime
    emberClient: deps.mcpClients['ember'],
    coingeckoClient: deps.mcpClients['coingecko'],

    // Local state
    config: await loadConfig(),
  };
};
```

#### **Multi-Skill Context**

```typescript
// Shared context across multiple skills
const sharedContext: ContextProvider<SharedContext> = async deps => {
  return {
    wallet: new Wallet(process.env.PRIVATE_KEY),
    provider: new JsonRpcProvider(process.env.RPC_URL),
  };
};

// Use in multiple skills
const lendingSkill = defineSkill({
  // ...
  contextProvider: sharedContext,
});

const swapSkill = defineSkill({
  // ...
  contextProvider: sharedContext,
});
```

---

### 🧪 Testing with Context

Context providers make testing straightforward:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { supplyTool } from './supply.js';

describe('Supply Tool', () => {
  it('should supply tokens using context', async () => {
    const mockContext = {
      rpcProvider: mockProvider,
      tokenMap: new Map([['USDC', { address: '0xUSDC' }]]),
      aavePool: {
        supply: vi.fn().mockResolvedValue({ hash: '0xTX' }),
      },
      userAddress: '0xUSER',
    };

    const result = await supplyTool.implementation({ token: 'USDC', amount: '100' }, mockContext);

    expect(result.transactionHash).toBe('0xTX');
  });
});
```

---

### 🔗 Related Resources

- [Lesson 5: Stateless vs Stateful Logic with Context](./lesson-05.md)
- [Lesson 7: v2 Agent Structure and File Layout](./lesson-07.md)
- [Lesson 11 (Legacy): Global State](./lesson-11-legacy.md) - Old approach

---

**Next:** [Lesson 12: Context Composition and Reusability](./lesson-12.md)
