/**
 * Clear Index Tool
 * Wrapper for the MCP server's clear_index tool
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { DocRagContext } from '../context/types.js';

const ClearIndexParams = z.object({});

export const clearIndexTool: VibkitToolDefinition<typeof ClearIndexParams, any, { custom: DocRagContext }> = {
  name: 'clear-index',
  description: 'Clear the entire documentation index. Use with caution as this removes all indexed content.',
  parameters: ClearIndexParams,
  execute: async (_args, context) => {
    try {
      // Get the MCP client for doc-rag-mcp-server
      const mcpClient = context.mcpClients?.['doc-rag-mcp-server'];
      
      if (!mcpClient) {
        return createErrorTask(
          'clear-index',
          new Error('Documentation RAG MCP server is not available')
        );
      }
      
      // Call the MCP tool
      const response = await mcpClient.callTool({
        name: 'clear_index',
        arguments: {},
      });
      
      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'text' in firstContent) {
          const message = firstContent.text;
          
          // Update context
          if (context.custom) {
            context.custom.indexedUrls = [];
            context.custom.stats = {
              totalIndexedPages: 0,
              totalEmbeddings: 0,
              estimatedCost: 0,
            };
            context.custom.lastQueryResults = undefined;
          }
          
          return createSuccessTask('clear-index', undefined, `${message}\n\nYou can now index new documentation using the documentation management skill.`);
        }
      }
      
      return createErrorTask(
        'clear-index',
        new Error('Invalid response from MCP server')
      );
    } catch (error) {
      return createErrorTask(
        'clear-index',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },
}; 