/**
 * Documentation Management Skill
 * Handles indexing, clearing, and listing documentation
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { indexDocumentationTool } from '../tools/indexDocumentation.js';
import { clearIndexTool } from '../tools/clearIndex.js';
import { listIndexedUrlsTool } from '../tools/listIndexedUrls.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input schema for the documentation management skill
const DocumentationManagementInputSchema = z.object({
  instruction: z.string().describe('Natural language instruction for documentation management'),
});

export const documentationManagementSkill = defineSkill({
  // Skill metadata
  id: 'documentation-management',
  name: 'Documentation Management',
  description: 'Index, clear, and list documentation from websites for RAG',
  
  // Required tags and examples
  tags: ['documentation', 'indexing', 'web-scraping', 'management'],
  examples: [
    'Index the React documentation at https://react.dev',
    'Clear the documentation index',
    'Show me all indexed URLs',
    'Index TypeScript docs with max 50 pages',
    'List what documentation is currently indexed'
  ],
  
  // Schemas
  inputSchema: DocumentationManagementInputSchema,
  
  // Tools available to this skill
  tools: [indexDocumentationTool, clearIndexTool, listIndexedUrlsTool],
  
  // MCP server connection
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