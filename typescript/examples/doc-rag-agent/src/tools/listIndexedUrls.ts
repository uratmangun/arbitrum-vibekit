/**
 * List Indexed URLs Tool
 * Wrapper for the MCP server's list_indexed_urls tool
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { DocRagContext } from '../context/types.js';

const ListIndexedUrlsParams = z.object({});

export const listIndexedUrlsTool: VibkitToolDefinition<typeof ListIndexedUrlsParams, any, { custom: DocRagContext }> = {
  name: 'list-indexed-urls',
  description: 'List all URLs that have been indexed in the documentation store',
  parameters: ListIndexedUrlsParams,
  execute: async (_args, context) => {
    try {
      // Get the MCP client for doc-rag-mcp-server
      const mcpClient = context.mcpClients?.['doc-rag-mcp-server'];
      
      if (!mcpClient) {
        return createFailedTask(
          'list-indexed-urls',
          new Error('Documentation RAG MCP server is not available'),
          { suggestion: 'Please ensure the doc-rag-mcp-server is properly configured' }
        );
      }
      
      // Call the MCP tool
      const response = await mcpClient.callTool({
        name: 'list_indexed_urls',
        arguments: {},
      });
      
      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'text' in firstContent) {
          const result = JSON.parse(firstContent.text);
          
          // Update context
          if (context.custom) {
            context.custom.indexedUrls = result.urls || [];
            context.custom.stats.totalIndexedPages = result.totalIndexedPages || 0;
            
            if (result.vectorStore) {
              context.custom.stats.totalEmbeddings = result.vectorStore.totalDocuments || 0;
            }
          }
          
          // Format the response
          if (result.totalIndexedPages === 0) {
            return createSuccessTask('list-indexed-urls', {
              message: 'No documentation has been indexed yet.',
              suggestion: 'Use the documentation management skill to index documentation from a website.',
              stats: result.vectorStore,
            });
          }
          
          // Group URLs by domain for better readability
          const urlsByDomain: Record<string, string[]> = {};
          result.urls.forEach((url: string) => {
            try {
              const domain = new URL(url).hostname;
              if (!urlsByDomain[domain]) {
                urlsByDomain[domain] = [];
              }
              urlsByDomain[domain].push(url);
            } catch {
              // Invalid URL, add to misc
              if (!urlsByDomain['misc']) {
                urlsByDomain['misc'] = [];
              }
              urlsByDomain['misc'].push(url);
            }
          });
          
          // Create formatted list
          const formattedList = Object.entries(urlsByDomain).map(([domain, urls]) => 
            `📁 **${domain}** (${urls.length} pages)\n${urls.map(u => `   - ${u}`).join('\n')}`
          ).join('\n\n');
          
          return createSuccessTask('list-indexed-urls', {
            summary: result.summary,
            totalPages: result.totalIndexedPages,
            formattedList,
            urls: result.urls,
            vectorStore: result.vectorStore,
            embeddingsReady: result.vectorStore?.embeddingsReady || false,
          });
        }
      }
      
      return createFailedTask(
        'list-indexed-urls',
        new Error('Invalid response from MCP server')
      );
    } catch (error) {
      return createFailedTask(
        'list-indexed-urls',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },
}; 