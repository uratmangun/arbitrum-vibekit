# **Lesson 12: Context Composition and Reusability**

---

### 🔍 Overview

> 📝 **Note:** This lesson replaces the legacy "Reducers and Immutable Updates" pattern with v2's functional composition approach for building reusable context providers.

In v2, instead of reducers and immutable state updates, we use **composable context providers** that can be combined, extended, and reused across different skills and agents. This approach provides better type safety and clearer data flow.

---

### 🧩 Composable Context Providers

#### **Base Provider Pattern**

```typescript
// src/context/base.ts
export const baseWeb3Provider: ContextProvider<BaseWeb3Context> = async deps => {
  const provider = new JsonRpcProvider(process.env.RPC_URL);
  const signer = new Wallet(process.env.PRIVATE_KEY, provider);

  return {
    provider,
    signer,
    chainId: await provider.getNetwork().then(n => n.chainId),
  };
};
```

#### **Extending Providers**

```typescript
// src/context/lending.ts
import { baseWeb3Provider } from './base.js';

export const lendingProvider: ContextProvider<LendingContext> = async deps => {
  // Reuse base provider
  const baseContext = await baseWeb3Provider(deps);

  // Add lending-specific context
  const aavePool = new Contract(AAVE_POOL_ADDRESS, AAVE_ABI, baseContext.signer);

  const reserves = await fetchAaveReserves(aavePool);

  return {
    ...baseContext,
    aavePool,
    reserves,
    tokenMap: buildTokenMap(reserves),
  };
};
```

---

### 🔄 Composition Patterns

#### **1. Merging Multiple Contexts**

```typescript
export const composedProvider: ContextProvider<ComposedContext> = async deps => {
  const [web3, prices, external] = await Promise.all([
    baseWeb3Provider(deps),
    priceProvider(deps),
    externalServicesProvider(deps),
  ]);

  return {
    ...web3,
    ...prices,
    ...external,
  };
};
```

#### **2. Conditional Context**

```typescript
export const contextProvider: ContextProvider<MyContext> = async deps => {
  const baseCtx = await baseProvider(deps);

  // Add features based on environment
  if (process.env.ENABLE_MONITORING === 'true') {
    return {
      ...baseCtx,
      metrics: await initMetrics(),
      logger: createLogger(),
    };
  }

  return baseCtx;
};
```

#### **3. Factory Pattern**

```typescript
// Create specialized providers
function createProtocolProvider(protocolName: string) {
  return async (deps: RuntimeDependencies) => {
    const base = await baseWeb3Provider(deps);
    const config = await loadProtocolConfig(protocolName);

    return {
      ...base,
      protocol: protocolName,
      contracts: await initContracts(config, base.signer),
    };
  };
}

// Use factory
export const aaveProvider = createProtocolProvider('aave');
export const compoundProvider = createProtocolProvider('compound');
```

---

### 🎯 Reusability Strategies

#### **Shared Utilities Provider**

```typescript
// src/context/utils.ts
export const utilsProvider: ContextProvider<UtilsContext> = async deps => {
  return {
    parseAmount: (amount: string, decimals: number) => parseUnits(amount, decimals),

    formatAmount: (amount: bigint, decimals: number) => formatUnits(amount, decimals),

    validateAddress: (address: string) => isAddress(address),
  };
};
```

#### **Cross-Agent Context Sharing**

```typescript
// shared/context/common.ts
export const commonProvider: ContextProvider<CommonContext> = async deps => {
  return {
    rpcUrl: process.env.RPC_URL!,
    chainId: parseInt(process.env.CHAIN_ID || '42161'),
    wrappedNative: process.env.WRAPPED_NATIVE_TOKEN!,
  };
};

// agents/lending-agent/src/context/index.ts
import { commonProvider } from '../../../../shared/context/common.js';

export const lendingContext: ContextProvider<LendingContext> = async deps => {
  const common = await commonProvider(deps);
  // Add lending-specific context
  return { ...common /* lending extras */ };
};
```

---

### 💡 Type-Safe Composition

```typescript
// Define context types that compose
interface BaseContext {
  provider: JsonRpcProvider;
  signer: Wallet;
}

interface PriceContext {
  getPrices: (tokens: string[]) => Promise<Map<string, number>>;
}

interface TokenContext {
  tokens: Map<string, TokenInfo>;
}

// Compose types
type FullContext = BaseContext & PriceContext & TokenContext;

// Provider with full type safety
export const fullProvider: ContextProvider<FullContext> = async deps => {
  const base = await baseProvider(deps);
  const prices = await priceProvider(deps);
  const tokens = await tokenProvider(deps);

  return {
    ...base,
    ...prices,
    ...tokens,
  };
};
```

---

### 🧪 Testing Composed Contexts

```typescript
describe('Composed Context', () => {
  it('should merge multiple providers', async () => {
    const mockDeps = { mcpClients: {} };

    const context = await composedProvider(mockDeps);

    // Verify all provider outputs are present
    expect(context.provider).toBeDefined();
    expect(context.getPrices).toBeDefined();
    expect(context.tokens).toBeDefined();
  });

  it('should allow selective mocking', async () => {
    const mockContext: Partial<FullContext> = {
      getPrices: vi.fn().mockResolvedValue(new Map([['ETH', 2000]])),
      tokens: new Map([['ETH', { address: '0xETH' }]]),
    };

    // Use partial context in tests
    const result = await toolImplementation(args, mockContext as FullContext);

    expect(mockContext.getPrices).toHaveBeenCalled();
  });
});
```

---

### 🔗 Related Resources

- [Lesson 5: Stateless vs Stateful Logic with Context](./lesson-05.md)
- [Lesson 11: State Management with Context Providers](./lesson-11.md)
- [Lesson 12 (Legacy): Reducers and Immutable Updates](./lesson-12-legacy.md) - Old approach

---

**Next:** [Lesson 13: Error Handling](./lesson-13.md)
