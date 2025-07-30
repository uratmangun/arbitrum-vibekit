import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { scoreProtocolEnhancedTool } from '../tools/scoreProtocolEnhanced.js';
import { indexDocumentationTool } from '../tools/indexDocumentation.js';
import { queryDocumentationTool } from '../tools/queryDocumentation.js';
import { clearIndexTool } from '../tools/clearIndex.js';
import { listIndexedUrlsTool } from '../tools/listIndexedUrls.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defiSafetyScoringSkill = defineSkill({
  id: 'defi-safety-scoring',
  name: 'DeFi Safety Scoring',
  description:
    'Comprehensive DeFi protocol safety scoring system - indexes protocol documentation and evaluates it against DeFiSafety criteria to produce a safety score.',
  tags: ['defi', 'safety', 'scoring', 'protocol', 'audit', 'documentation'],
  examples: [
    'Score the Uniswap protocol using their documentation at https://docs.uniswap.org',
    'Evaluate the safety of Aave protocol',
    'Generate a DeFi Safety report for Compound Finance',
    'What is the safety score for this protocol?',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('Natural language instruction for DeFi safety scoring'),
  }),
  tools: [
    indexDocumentationTool,
    queryDocumentationTool,
    scoreProtocolEnhancedTool,
    listIndexedUrlsTool,
    clearIndexTool,
  ],

  // Single MCP server configuration shared by all tools
  mcpServers: [
    {
      command: 'node',
      moduleName: path.join(
        __dirname,
        '../../../../lib/mcp-tools/doc-rag-mcp-server/dist/index.js'
      ),
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>,
    },
  ],
});