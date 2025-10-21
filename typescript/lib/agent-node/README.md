# Agent Node

Agent Node is a modern agent framework for the agentic economy. It enables building autonomous AI agents that can communicate with other agents, execute complex workflows, and perform transactions. It's a complete implementation of the [A2A (Agent-to-Agent) protocol](https://a2a.co) with integrated AI capabilities, workflow orchestration, and blockchain wallet support.

## Features

Agent Node provides a complete framework for building autonomous AI agents with these core capabilities:

### AI-Powered Agent Communication

Built on the A2A (Agent-to-Agent) protocol, your agents can send messages, stream responses in real-time, and manage complex tasks. The system handles session isolation and provides standards-compliant agent discovery.

### Flexible AI Integration

Choose from multiple AI providers (OpenRouter, OpenAI, xAI, Hyperbolic) and give your agents access to tools through the Model Context Protocol (MCP). Agents can trigger multi-step workflows and maintain conversation context across sessions.

### Smart Workflow System

Create sophisticated workflows using JavaScript generators that can pause for user input or authorization. The system validates inputs, tracks state transitions, and allows multiple workflows to run concurrently with isolated contexts.

### Modular Configuration

Organize your agent's capabilities using a file-based workspace. Define skills as separate modules, configure which tools they can access, and let the system automatically compose prompts. Changes are hot-reloaded during development.

### Blockchain Integration

Built-in wallet support for Ethereum and other EVM chains (Arbitrum, Base, etc.). Agents can sign transactions, estimate gas fees, and pause workflows for user approval before executing blockchain operations.

### Developer Experience

Simple CLI commands for initialization, validation, and deployment. Create new agent configurations, validate setups, and bundle everything for production deployment.

## Architecture

### Project Structure

```
agent-node/
├── src/                     # Source code
│   ├── a2a/                 # A2A protocol & message handling
│   ├── ai/                  # AI providers & tool management
│   ├── config/             # Configuration loading & validation
│   ├── workflows/           # Workflow execution engine
│   ├── cli/                 # Command-line interface
│   └── utils/               # Shared utilities
│
├── config/                  # Your agent configuration
│   ├── agent.md            # Agent personality & model
│   ├── agent.manifest.json  # Skill/server selection
│   ├── skills/             # Modular capabilities
│   │   ├── general-assistant.md
│   │   └── ember-onchain-actions.md
│   ├── mcp.json            # MCP server registry
│   ├── workflow.json       # Workflow registry
│   └── workflows/          # Custom workflows
│       └── example-workflow.ts
│
└── tests/                   # Test suites
```

### How It Works

When you send a message to your agent, here's what happens:

1. Your message arrives at the agent server
2. The agent uses AI (Claude, GPT, etc.) to understand your request
3. If needed, the agent chooses appropriate tools (DeFi actions, web requests, etc.)
4. The agent executes the chosen tools or workflows
5. You get back a helpful response with results

**Example**: Ask "Swap 100 USDC for ETH" → Agent gets quote → Asks for approval → Executes swap → Returns transaction hash

### How Your Agent Handles Complex Requests

**Sessions**: Keep your conversations organized and private. Each chat is separate, you can have multiple ongoing conversations with your agent without them interfering with each other.

**Tasks**: When your agent does something complex (like a DeFi transaction), it creates a task you can track. You'll see updates like "Getting quote..." → "Waiting for approval..." → "Transaction complete!"

**Workflows**: Multi-step operations that pause for your input. For example: "Swap tokens" → Agent gets quote → Asks "Approve this swap?" → You say yes → Agent executes → Returns transaction hash.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 22+**: Download from [nodejs.org](https://nodejs.org)
- **pnpm**: Install with `npm install -g pnpm`
- **AI Provider API Key** : Get one from [OpenRouter](https://openrouter.ai), [OpenAI](https://openai.com), [xAI](https://x.ai), or [Hyperbolic](https://hyperbolic.ai)

## Installation

1. Install dependencies:

   ```bash
   cd typescript/lib/agent-node
   pnpm install
   ```

2. Set up environment:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys.

## Quickstart

Creates a general-purpose AI agent with DeFi capabilities in 4 steps:

### 1. Initialize Your Agent

```bash
pnpm cli init
```

This creates a `config/` directory with a general-purpose AI agent that has DeFi capabilities (swapping, lending, liquidity) and web tools. You can customize it by editing `config/agent.md`.

### 2. Start the Server

```bash
pnpm cli run --dev
```

Your agent is now running at `http://0.0.0.0:3000`

### 3. Test Your Agent

In a different terminal, send a message to verify everything works:

```bash
curl -X POST http://0.0.0.0:3000/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello! Can you help me?"}]
      }
    },
    "id": 1
  }'
```

Your agent is now ready to receive messages and execute workflows.

### 4. Connect to Your Agent

Your agent exposes these endpoints for integration:

- **A2A Endpoint**: `http://0.0.0.0:3000/a2a` - Send messages and get responses
- **Agent Card**: `http://0.0.0.0:3000/.well-known/agent-card.json` - Agent discovery
- **Health Check**: POST to `/a2a` with `{"jsonrpc": "2.0", "method": "health", "id": 1}`

**Using the A2A SDK:**

```typescript
import { A2AClient } from '@a2a-js/sdk/client';

const client = await A2AClient.fromCardUrl('http://0.0.0.0:3000/.well-known/agent-card.json');

const response = await client.sendMessage({
  message: {
    kind: 'message',
    messageId: 'msg-1',
    role: 'user',
    parts: [{ kind: 'text', text: 'Hello agent!' }],
  },
});

console.log(response);
```

## CLI Commands

The Agent CLI provides essential commands for managing your agent throughout its lifecycle:

```bash
# Initialize agent configuration. Creates a new agent configuration workspace with sample files
pnpm cli init

# Run agent in development mode. Starts your agent with hot reload for development
pnpm cli run --dev

# Validate configuration. Checks your configuration for errors and missing references
pnpm cli doctor

# View composed configuration. Shows your composed agent configuration in readable format
pnpm cli print-config

# Create deployment bundle. Creates a production-ready deployment package
pnpm cli bundle
```

## Development

When working on Agent Node itself, use these commands for development:

```bash
# Start development server with hot reload. Use for active development with automatic file watching
pnpm dev

# Run tests. Use to ensure your changes don't break existing functionality
pnpm test

# Lint and fix code. Use to automatically fix code formatting and style issues
pnpm lint:fix

# Build for production. This creates optimized JavaScript files in the `dist/` directory
pnpm build
```

## Deployment

### Production Build

First, build your agent for production:

```bash
pnpm build
```

This creates optimized JavaScript files in the `dist/` directory.

### Environment Variables

Configure your production environment with these required variables:

```bash
OPENROUTER_API_KEY=your_api_key
PORT=3000
HOST=0.0.0.0
```

### Docker

Deploy your agent server using Docker for containerized environments:

```bash
# Build and run with Docker
docker build -t agent-node .
docker run -p 3000:3000 agent-node

# Or use Docker Compose for easier management
docker compose up
```

This creates a production-ready container with your agent server running on port 3000.

## Creating Custom Workflows

### What are Workflows?

Workflows are powerful multi-step operations that enable your agent to handle complex, long-running tasks that require user interaction, external API calls, or sequential processing. Unlike simple tool calls that execute instantly, workflows can pause execution to wait for user input, show progress updates, and resume from where they left off. This makes them perfect for scenarios like multi-step onboarding processes, complex data analysis pipelines, interactive tutorials, or any task that requires back-and-forth communication with users. Workflows are built using generator functions that can yield status updates and pause for input, making them ideal for creating engaging, interactive agent experiences.

### Workflow Execution

Workflows are automatically triggered when your AI agent decides to use them during conversations. You don't manually call workflows, instead, you ask your agent to do something (like "help me swap tokens" or "guide me through onboarding"), and the agent intelligently chooses to use a workflow tool when appropriate. The workflow then executes in the background, can pause for your input, and returns results to continue the conversation. Here's how to create a simple workflow:

### 1. Create Your Workflow File

Create a workflow file in `config/workflows/`. Note that the `config/` folder and example workflow file are created when you run `pnpm cli init` and they don't exist in the initial repository. There is an example `config/workflows/example-workflow.ts` file provided for reference. The example workflow demonstrates progress updates, user interaction, and multi-step execution:

```typescript
import type { WorkflowPlugin, WorkflowContext } from '../../src/workflows/types.js';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'my-workflow', // Unique identifier for your workflow
  name: 'My Workflow', // Display name
  description: 'A simple workflow example', // What this workflow does
  version: '1.0.0', // Version for tracking changes

  // Define what inputs this workflow expects
  inputSchema: z.object({
    message: z.string(), // Requires a string message parameter
  }),

  // The main workflow execution logic
  async *execute(context: WorkflowContext) {
    const { message } = context.parameters; // Extract the input message

    // Step 1: Show progress to the user
    yield {
      type: 'status',
      status: {
        state: 'working', // Indicates the workflow is processing
        message: {
          kind: 'message',
          messageId: 'processing',
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Processing...' }], // Shows "Processing..." to user
        },
      },
    };

    // Step 2: Pause and ask for user confirmation
    const userInput = yield {
      type: 'pause', // Pauses execution to wait for user input
      status: {
        state: 'input-required', // Indicates user input is needed
        message: {
          kind: 'message',
          messageId: 'confirmation',
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Continue?' }], // Asks "Continue?" to user
        },
      },
      inputSchema: z.object({
        confirmed: z.boolean(), // Expects a boolean response from user
      }),
    };

    // Step 3: Return the final result
    return { success: true, message }; // Workflow completes successfully
  },
};

export default plugin;
```

### 2. Register Your Workflow

To register your workflow, add it to `config/workflow.json`. This step makes your workflow discoverable by the agent system:

```json
{
  "workflows": {
    "my-workflow": "./workflows/my-workflow.ts"
  }
}
```

And add it to `config/agent.manifest.json`. This step enables the workflow for your agent:

```json
{
  "enabledWorkflows": ["my-workflow"]
}
```

### 3. Test Your Workflow

```bash
pnpm cli doctor
pnpm cli run --dev
```

This step validates your workflow configuration and starts the agent with your new workflow available. Your workflow becomes available as a tool with the naming pattern `dispatch_workflow_{workflow_id}` (e.g., `dispatch_workflow_my_workflow`).
