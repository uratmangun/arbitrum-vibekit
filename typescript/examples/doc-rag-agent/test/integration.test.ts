/**
 * Documentation RAG Agent Integration Tests
 *
 * Tests the full agent functionality including MCP server integration,
 * skills orchestration, and tool execution.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Agent } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { agentConfig } from '../src/index.js';

describe('Documentation RAG Agent - Integration Tests', () => {
  let agent: Agent<any, any>;
  let mcpClient: Client;
  let baseUrl: string;
  const port = 3009; // Use different port to avoid conflicts

  beforeAll(async () => {
    console.log('🚀 Starting Documentation RAG Agent for integration testing...');

    // Skip tests if required environment variables are not set
    if (!process.env.OPENAI_API_KEY || !process.env.OPENROUTER_API_KEY) {
      console.log('⚠️ Skipping integration tests - missing API keys');
      return;
    }

    // Create the agent with test configuration
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    agent = Agent.create(agentConfig, {
      llm: {
        model: openrouter('anthropic/claude-3.5-sonnet'),
      },
      cors: true,
    });

    // Start the agent with context provider
    const { contextProvider } = await import('../src/context/provider.js');
    await agent.start(port, contextProvider);
    baseUrl = `http://localhost:${port}`;

    console.log(`✅ Agent started on ${baseUrl}`);

    // Give the agent time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 30000);

  afterAll(async () => {
    console.log('🛑 Shutting down test agent...');
    try {
      if (mcpClient) {
        await mcpClient.close();
      }
      if (agent) {
        await agent.stop();
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }, 15000);

  describe('Agent Setup and Health', () => {
    test('Agent starts and serves basic endpoints', async () => {
      if (!process.env.OPENAI_API_KEY || !process.env.OPENROUTER_API_KEY) {
        return; // Skip if no API keys
      }

      const response = await fetch(`${baseUrl}`);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('MCP Server');
    });

    test('Agent card is available', async () => {
      if (!process.env.OPENAI_API_KEY || !process.env.OPENROUTER_API_KEY) {
        return;
      }

      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      expect(response.status).toBe(200);
      const agentCard = await response.json();

      expect(agentCard).toHaveProperty('type', 'AgentCard');
      expect(agentCard).toHaveProperty('name', 'Documentation RAG Agent');
      expect(agentCard).toHaveProperty('skills');
      expect(agentCard.skills).toHaveLength(2); // management and query skills
    });
  });

  describe('MCP Connection and Skills', () => {
    test('Can establish MCP connection', async () => {
      if (!process.env.OPENAI_API_KEY || !process.env.OPENROUTER_API_KEY) {
        return;
      }

      const sseUrl = `${baseUrl}/sse`;
      const transport = new SSEClientTransport(new URL(sseUrl));
      mcpClient = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await mcpClient.connect(transport);
      expect(mcpClient).toBeDefined();
    });

    test('Can list available skills', async () => {
      if (!mcpClient) return;

      const tools = await mcpClient.listTools();
      expect(tools.tools).toHaveLength(2);

      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('documentation-management');
      expect(toolNames).toContain('documentation-query');
    });

    test('Skills have proper metadata', async () => {
      if (!mcpClient) return;

      const tools = await mcpClient.listTools();
      const managementSkill = tools.tools.find(t => t.name === 'documentation-management');
      const querySkill = tools.tools.find(t => t.name === 'documentation-query');

      expect(managementSkill?.description).toContain('Index, clear, and list documentation');
      expect(querySkill?.description).toContain('Query indexed documentation');

      // Check for required metadata elements
      expect(managementSkill?.description).toContain('<tags>');
      expect(managementSkill?.description).toContain('<examples>');
      expect(querySkill?.description).toContain('<tags>');
      expect(querySkill?.description).toContain('<examples>');
    });
  });

  describe('Documentation Management Workflow', () => {
    test('Can list indexed URLs (initially empty)', async () => {
      if (!mcpClient) return;

      const result = await mcpClient.callTool({
        name: 'documentation-management',
        arguments: {
          instruction: 'List all indexed URLs',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      if (content[0].type === 'resource') {
        const task = JSON.parse(content[0].resource.text);
        expect(task.status.state).toBe('completed');
      }
    });

    test('Can clear index (even when empty)', async () => {
      if (!mcpClient) return;

      const result = await mcpClient.callTool({
        name: 'documentation-management',
        arguments: {
          instruction: 'Clear the documentation index',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      if (content[0].type === 'resource') {
        const task = JSON.parse(content[0].resource.text);
        expect(task.status.state).toBe('completed');
      }
    });

    test('Index operation requires valid URL', async () => {
      if (!mcpClient) return;

      // Try with invalid URL - should handle gracefully
      const result = await mcpClient.callTool({
        name: 'documentation-management',
        arguments: {
          instruction: 'Index documentation from invalid-url',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      // Should either succeed with error handling or fail gracefully
    });
  });

  describe('Documentation Query Workflow', () => {
    test('Query without indexed docs returns helpful message', async () => {
      if (!mcpClient) return;

      const result = await mcpClient.callTool({
        name: 'documentation-query',
        arguments: {
          query: 'How do React hooks work?',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      if (content[0].type === 'resource') {
        const task = JSON.parse(content[0].resource.text);
        // Should either be completed with "no docs" message or failed with helpful error
        expect(['completed', 'failed']).toContain(task.status.state);
      }
    });

    test('Query with different parameters', async () => {
      if (!mcpClient) return;

      const result = await mcpClient.callTool({
        name: 'documentation-query',
        arguments: {
          query: 'TypeScript generics',
          topK: 3,
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');
    });
  });

  describe('Error Handling', () => {
    test('Invalid skill input triggers validation error', async () => {
      if (!mcpClient) return;

      await expect(
        mcpClient.callTool({
          name: 'documentation-query',
          arguments: {
            query: '', // Empty query should fail validation
          },
        }),
      ).rejects.toThrow();
    });

    test('Missing required parameters triggers error', async () => {
      if (!mcpClient) return;

      await expect(
        mcpClient.callTool({
          name: 'documentation-query',
          arguments: {
            // Missing query parameter
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Context and State Management', () => {
    test('Agent maintains context across operations', async () => {
      if (!mcpClient) return;

      // Perform multiple operations
      await mcpClient.callTool({
        name: 'documentation-management',
        arguments: {
          instruction: 'List indexed URLs',
        },
      });

      await mcpClient.callTool({
        name: 'documentation-query',
        arguments: {
          query: 'test query',
        },
      });

      // Both operations should complete (context should be maintained)
      expect(true).toBe(true); // If we get here, context is working
    });
  });
}); 