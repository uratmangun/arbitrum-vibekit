/**
 * Index Documentation Tool
 * Wrapper for the MCP server's index_documentation tool
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { DocRagContext } from '../context/types.js';

const IndexDocumentationParams = z.object({
  baseUrl: z.string().url().describe('Base URL to scrape (will not go beyond this domain/path)'),
  maxPages: z.number().int().positive().default(100).optional().describe('Maximum pages to scrape'),
  selector: z.string().default('main, article, .content, .documentation').optional().describe('CSS selector for main content'),
});

export const indexDocumentationTool: VibkitToolDefinition<typeof IndexDocumentationParams, any, { custom: DocRagContext }> = {
  name: 'index-documentation',
  description: 'Scrape and index documentation from a website for RAG queries',
  parameters: IndexDocumentationParams,
  execute: async (args, context) => {
    try {
      // Get the MCP client for doc-rag-mcp-server
      const mcpClient = context.mcpClients?.['doc-rag-mcp-server'];
      
      if (!mcpClient) {
        return createErrorTask(
          'index-documentation',
          new Error('Documentation RAG MCP server is not available')
        );
      }
      
      // Call the MCP tool
      const response = await mcpClient.callTool({
        name: 'index_documentation',
        arguments: {
          baseUrl: args.baseUrl,
          maxPages: args.maxPages || 100,
          selector: args.selector || 'main, article, .content, .documentation',
        },
      });
      
      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'text' in firstContent) {
          const result = JSON.parse(firstContent.text);
          
          // Check if it was an error
          if (response.isError) {
            return createErrorTask('index-documentation', new Error(result));
          }
          
          // Format success message
          const message = `Successfully indexed ${result.totalPagesScraped} pages from ${result.baseUrl}`;
          const details = [];
          
          if (result.embeddings.embeddingsGenerated > 0) {
            details.push(`Generated ${result.embeddings.embeddingsGenerated} embeddings from ${result.embeddings.chunksCreated} chunks`);
            details.push(`Estimated cost: $${result.embeddings.estimatedCost.toFixed(4)}`);
          } else {
            details.push('⚠️ No embeddings generated (OPENAI_API_KEY may not be set)');
          }
          
          if (result.totalErrors > 0) {
            details.push(`Encountered ${result.totalErrors} errors during indexing`);
          }
          
          // Update context with new indexed data
          if (context.custom) {
            context.custom.indexedUrls = result.urls || [];
            context.custom.stats.totalIndexedPages = result.totalPagesScraped || 0;
            context.custom.stats.totalEmbeddings = result.embeddings.embeddingsGenerated || 0;
            context.custom.stats.estimatedCost += result.embeddings.estimatedCost || 0;
            context.custom.stats.lastIndexedUrl = result.baseUrl;
            context.custom.stats.lastIndexedAt = new Date();
          }
          
          return createSuccessTask('index-documentation', undefined, `${message}\n\n${details.join('\n')}`);
        }
      }
      
      return createFailedTask(
        'index-documentation',
        new Error('Invalid response from MCP server')
      );
    } catch (error) {
      return createFailedTask(
        'index-documentation',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },
}; 