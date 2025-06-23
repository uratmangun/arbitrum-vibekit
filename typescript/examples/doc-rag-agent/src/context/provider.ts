/**
 * Context Provider for Documentation RAG Agent
 * Tracks indexed URLs, stats, and query history
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { DocRagContext } from './types.js';

export async function contextProvider(deps: { mcpClients: Record<string, Client> }): Promise<{ custom: DocRagContext }> {
  console.log('Initializing Documentation RAG context...');
  
  // Initialize context with default values
  const context: DocRagContext = {
    stats: {
      totalIndexedPages: 0,
      totalEmbeddings: 0,
      estimatedCost: 0,
    },
    indexedUrls: [],
    queryHistory: [],
  };
  
  // Try to get current state from the MCP server
  const mcpClient = deps.mcpClients['doc-rag-mcp-server'];
  
  if (mcpClient) {
    try {
      // Get current indexed URLs
      const response = await mcpClient.callTool({
        name: 'list_indexed_urls',
        arguments: {},
      });
      
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'text' in firstContent) {
          const result = JSON.parse(firstContent.text);
          
          // Update context with current state
          context.indexedUrls = result.urls || [];
          context.stats.totalIndexedPages = result.totalIndexedPages || 0;
          
          if (result.vectorStore) {
            context.stats.totalEmbeddings = result.vectorStore.totalDocuments || 0;
          }
          
          console.log(`Loaded context: ${context.stats.totalIndexedPages} pages indexed, ${context.stats.totalEmbeddings} embeddings`);
        }
      }
    } catch (error) {
      console.error('Failed to load initial context from MCP server:', error);
      // Continue with empty context
    }
  }
  
  return { custom: context };
} 