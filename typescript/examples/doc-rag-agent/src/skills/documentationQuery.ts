/**
 * Documentation Query Skill
 * Handles querying indexed documentation using natural language
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { queryDocumentationTool } from '../tools/queryDocumentation.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input schema for the documentation query skill
const DocumentationQueryInputSchema = z.object({
  query: z.string().describe('Natural language query about the indexed documentation'),
  topK: z.number().optional().describe('Number of relevant chunks to retrieve (default: 5)'),
});

export const documentationQuerySkill = defineSkill({
  // Skill metadata
  id: 'documentation-query',
  name: 'Documentation Query',
  description: 'Query indexed documentation using natural language and get relevant results with citations',
  
  // Required tags and examples
  tags: ['documentation', 'query', 'search', 'RAG', 'retrieval'],
  examples: [
    'How do React hooks work?',
    'What is the useState hook?',
    'Explain TypeScript generics',
    'Show me documentation about async/await',
    'Find information about error boundaries in React'
  ],
  
  // Schemas
  inputSchema: DocumentationQueryInputSchema,
  
  // Tools available to this skill
  tools: [queryDocumentationTool],
  
  // MCP server connection (same as management skill)
  mcpServers: [{
    command: 'tsx',
    moduleName: path.join(__dirname, '../../../lib/mcp-tools/doc-rag-mcp-server/src/index.ts'),
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    },
  }],
  
  // No manual handler - uses LLM orchestration
}); 