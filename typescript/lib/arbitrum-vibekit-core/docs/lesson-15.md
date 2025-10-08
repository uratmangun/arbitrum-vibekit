# **Lesson 15: Agent Monetization and Payment Flows**

---

### 🔍 Overview

> 📝 **Note:** This lesson provides modern approaches to agent monetization in the v2 framework. While the legacy x402 protocol lesson is still available for reference, this covers practical payment integration patterns.

Vibekit v2 agents can implement various monetization strategies, from simple API key authentication to advanced payment-per-call models. This lesson covers practical patterns for monetizing your AI agents.

---

### 💳 Monetization Strategies

#### **1. API Key / Subscription Model**

```typescript
// src/hooks/auth.ts
export const apiKeyAuthHook = createHook({
  before: async (args, context) => {
    const apiKey = context.headers?.['x-api-key'];

    if (!apiKey) {
      throw new Error('API key required');
    }

    const subscription = await validateApiKey(apiKey);

    if (!subscription.active) {
      throw new Error('Subscription expired');
    }

    // Track usage
    await incrementUsage(apiKey);

    return args;
  },
});

// Apply to tools
export const paidTool = withHooks(baseTool, {
  before: [apiKeyAuthHook],
});
```

#### **2. Pay-Per-Use Model**

```typescript
// src/hooks/payment.ts
export const paymentHook = createHook({
  before: async (args, context) => {
    const paymentId = context.headers?.['x-payment-id'];

    if (!paymentId) {
      throw new Error('Payment required');
    }

    const payment = await verifyPayment(paymentId, {
      tool: context.toolName,
      minAmount: TOOL_PRICES[context.toolName],
    });

    if (!payment.verified) {
      throw new Error('Invalid payment');
    }

    return { ...args, paymentConfirmed: true };
  },
});
```

#### **3. Token Gating**

```typescript
export const tokenGateHook = createHook({
  before: async (args, context) => {
    const userAddress = args.walletAddress || context.userAddress;

    const balance = await checkTokenBalance(userAddress, ACCESS_TOKEN_ADDRESS);

    if (balance < MINIMUM_TOKEN_BALANCE) {
      throw new Error(`Requires ${MINIMUM_TOKEN_BALANCE} tokens to access this feature`);
    }

    return args;
  },
});
```

---

### 💰 Payment Integration Patterns

#### **Crypto Payment Flow**

```typescript
const cryptoPaymentParams = z.object({
  operation: z.string(),
  paymentTxHash: z.string(),
});

export const cryptoPaymentTool: VibkitToolDefinition<typeof cryptoPaymentParams> = {
  name: 'executeWithPayment',
  description: 'Execute operation with crypto payment',
  parameters: cryptoPaymentParams,
  execute: async (args, context) => {
    // Verify payment transaction
    const tx = await context.provider.getTransaction(args.paymentTxHash);
    const receipt = await tx.wait();

    // Validate payment amount and recipient
    if (receipt.to !== PAYMENT_RECEIVER_ADDRESS) {
      throw new Error('Payment sent to wrong address');
    }

    const paidAmount = tx.value;
    const requiredAmount = getOperationCost(args.operation);

    if (paidAmount < requiredAmount) {
      throw new Error('Insufficient payment');
    }

    // Execute the operation
    const result = await executeOperation(args.operation);

    return {
      success: true,
      result,
      paymentReceived: paidAmount.toString(),
    };
  },
};
```

#### **Fiat Payment Integration**

```typescript
// Integration with Stripe/payment processor
export const fiatPaymentHook = createHook({
  before: async (args, context) => {
    const sessionId = context.headers?.['stripe-session-id'];

    if (!sessionId) {
      throw new Error('Payment session required');
    }

    // Verify with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }

    return args;
  },
});
```

---

### 📊 Usage Tracking and Analytics

#### **Metered Billing**

```typescript
interface UsageRecord {
  userId: string;
  toolName: string;
  timestamp: number;
  cost: number;
}

export const meteringHook = createHook({
  before: async (args, context) => {
    const userId = getUserId(context);
    const cost = TOOL_PRICES[context.toolName] || 0;

    // Record usage
    await recordUsage({
      userId,
      toolName: context.toolName,
      timestamp: Date.now(),
      cost,
    });

    return args;
  },
  after: async (result, args, context) => {
    // Update metrics
    await updateUserMetrics(getUserId(context), {
      successfulCalls: 1,
      totalSpent: TOOL_PRICES[context.toolName],
    });

    return result;
  },
});
```

#### **Rate Limiting by Tier**

```typescript
export const rateLimitHook = createHook({
  before: async (args, context) => {
    const userId = getUserId(context);
    const tier = await getUserTier(userId);

    const limits = {
      free: { callsPerMinute: 10, callsPerDay: 100 },
      pro: { callsPerMinute: 100, callsPerDay: 10000 },
      enterprise: { callsPerMinute: 1000, callsPerDay: 100000 },
    };

    const userLimit = limits[tier];
    const usage = await getRecentUsage(userId);

    if (usage.lastMinute >= userLimit.callsPerMinute) {
      throw new Error('Rate limit exceeded for your tier');
    }

    if (usage.today >= userLimit.callsPerDay) {
      throw new Error('Daily limit exceeded');
    }

    return args;
  },
});
```

---

### 🔐 Secure Payment Handling

#### **Payment Signature Verification**

```typescript
import { verifyMessage } from 'ethers';

export const signatureVerificationHook = createHook({
  before: async (args, context) => {
    const { message, signature, signerAddress } = args;

    // Verify signature
    const recoveredAddress = verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    // Verify message contains payment info
    const paymentData = JSON.parse(message);
    if (paymentData.amount < MINIMUM_PAYMENT) {
      throw new Error('Payment amount too low');
    }

    return args;
  },
});
```

---

### 📈 Revenue Optimization

#### **Dynamic Pricing**

```typescript
function getDynamicPrice(toolName: string, usage: UsageStats): number {
  const basePrice = BASE_PRICES[toolName];

  // Increase price during high demand
  if (usage.currentLoad > 0.8) {
    return basePrice * 1.5;
  }

  // Decrease price during low usage
  if (usage.currentLoad < 0.2) {
    return basePrice * 0.7;
  }

  return basePrice;
}

export const dynamicPricingHook = createHook({
  before: async (args, context) => {
    const usage = await getSystemUsage();
    const price = getDynamicPrice(context.toolName, usage);

    const payment = args.paymentAmount;
    if (payment < price) {
      throw new Error(`Current price: ${price}. Paid: ${payment}. Please pay the difference.`);
    }

    return args;
  },
});
```

---

### 🔗 Related Resources

- [Lesson 9: How Tool Hooks Work](./lesson-09.md)
- [Lesson 16: Observability and Metrics in V2](./lesson-16.md)
- [Lesson 19: Agent Validation and Transaction Security](./lesson-19.md)
- [Lesson 15 (Legacy): Monetization with x402](./lesson-15-legacy.md) - Protocol reference

---

**Next:** [Lesson 16: Observability and Metrics in V2](./lesson-16.md)
