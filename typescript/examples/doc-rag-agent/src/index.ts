#!/usr/bin/env node
/**
 * Documentation RAG Agent
 * Demonstrates RAG capabilities using the doc-rag-mcp-server
 */

import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { documentationManagementSkill } from './skills/documentationManagement.js';
import { documentationQuerySkill } from './skills/documentationQuery.js';
import { contextProvider } from './context/provider.js';

// Check required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is required');
  console.error('   This is needed for generating embeddings in the doc-rag-mcp-server');
  console.error('   Please set it in your .env file or environment');
  console.error('   Get your API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ Error: OPENROUTER_API_KEY environment variable is required');
  console.error('   This is needed for the agent\'s LLM capabilities');
  console.error('   Please set it in your .env file or environment');
  console.error('   Get your API key from: https://openrouter.ai/keys');
  process.exit(1);
}

// Create OpenRouter instance for LLM
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Documentation RAG Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'AI agent that can index and query documentation using RAG',
  skills: [documentationManagementSkill, documentationQuerySkill],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// Configure the agent
const agent = Agent.create(agentConfig, {
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: openrouter(process.env.LLM_MODEL || 'anthropic/claude-3.5-sonnet'),
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3008', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Documentation RAG Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n📚 Available capabilities:');
    console.log('  - Index documentation from any website');
    console.log('  - Query indexed docs with natural language');
    console.log('  - Clear documentation index');
    console.log('  - List all indexed URLs');
    console.log('\n✅ All required environment variables are set');
  })
  .catch((error) => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await agent.stop();
  process.exit(0);
}); 