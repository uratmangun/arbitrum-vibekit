/**
 * Query Documentation Tool
 * Wrapper for the MCP server's query_documentation tool
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { DocRagContext } from '../context/types.js';

const QueryDocumentationParams = z.object({
  query: z.string().min(1).describe('Natural language query'),
  topK: z.number().int().positive().default(5).optional().describe('Number of relevant chunks to retrieve'),
});

export const queryDocumentationTool: VibkitToolDefinition<typeof QueryDocumentationParams, any, { custom: DocRagContext }> = {
  name: 'query-documentation',
  description: 'Query indexed documentation using natural language and get relevant results with citations',
  parameters: QueryDocumentationParams,
  execute: async (args, context) => {
    try {
      // Get the MCP client for doc-rag-mcp-server
      const mcpClient = context.mcpClients?.['doc-rag-mcp-server'];
      
      if (!mcpClient) {
        return createFailedTask(
          'query-documentation',
          new Error('Documentation RAG MCP server is not available'),
          { suggestion: 'Please ensure the doc-rag-mcp-server is properly configured' }
        );
      }
      
      // Call the MCP tool
      const response = await mcpClient.callTool({
        name: 'query_documentation',
        arguments: {
          query: args.query,
          topK: args.topK || 5,
        },
      });
      
      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'text' in firstContent) {
          const text = firstContent.text;
          
          // Check for errors
          if (text.includes('Error:')) {
            return createFailedTask(
              'query-documentation',
              new Error(text),
              {
                suggestion: text.includes('OPENAI_API_KEY') 
                  ? 'Please set the OPENAI_API_KEY environment variable'
                  : text.includes('No documents have been indexed')
                  ? 'Please use the documentation management skill to index some documentation first'
                  : undefined
              }
            );
          }
          
          const result = JSON.parse(text);
          
          // Update context with query history
          if (context.custom) {
            context.custom.queryHistory.push({
              query: args.query,
              timestamp: new Date(),
              resultsCount: result.totalResults || 0,
            });
            context.custom.lastQueryResults = result;
          }
          
          // Format the results for display
          if (result.totalResults === 0) {
            return createSuccessTask('query-documentation', {
              message: 'No relevant documentation found for your query.',
              suggestion: 'Try rephrasing your query or index more documentation.',
              stats: result.indexStats,
            });
          }
          
          // Create formatted response
          const formattedResults = result.results.map((r: any) => 
            `📄 **${r.title}** (${r.chunkInfo})\n` +
            `   Score: ${r.score} | Source: ${r.source}\n` +
            `   \n${r.content}\n`
          ).join('\n---\n\n');
          
          return createSuccessTask('query-documentation', {
            query: args.query,
            totalResults: result.totalResults,
            formattedResults,
            rawResults: result.results,
            indexStats: result.indexStats,
            ragInstruction: result.ragInstruction,
          });
        }
      }
      
      return createFailedTask(
        'query-documentation',
        new Error('Invalid response from MCP server')
      );
    } catch (error) {
      return createFailedTask(
        'query-documentation',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },
}; 