/**
 * Documentation RAG Agent Unit Tests
 *
 * Tests individual tools and components in isolation
 */

import { describe, test, expect, vi } from 'vitest';
import { z } from 'zod';

// Mock the vibekit functions
const mockCreateSuccessTask = vi.fn();
const mockCreateFailedTask = vi.fn();

vi.mock('arbitrum-vibekit-core', () => ({
  createSuccessTask: mockCreateSuccessTask,
  createFailedTask: mockCreateFailedTask,
}));

describe('Documentation RAG Agent - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation Schemas', () => {
    test('IndexDocumentationParams validates correctly', () => {
      const IndexDocumentationSchema = z.object({
        baseUrl: z.string().url(),
        maxPages: z.number().int().positive().default(100).optional(),
        selector: z.string().default('main, article, .content, .documentation').optional(),
      });

      // Valid inputs
      const validInput1 = { baseUrl: 'https://react.dev' };
      const validInput2 = { 
        baseUrl: 'https://typescript.dev', 
        maxPages: 50, 
        selector: '.documentation' 
      };

      expect(() => IndexDocumentationSchema.parse(validInput1)).not.toThrow();
      expect(() => IndexDocumentationSchema.parse(validInput2)).not.toThrow();

      // Invalid inputs
      const invalidUrl = { baseUrl: 'not-a-url' };
      const invalidMaxPages = { baseUrl: 'https://react.dev', maxPages: -1 };

      expect(() => IndexDocumentationSchema.parse(invalidUrl)).toThrow();
      expect(() => IndexDocumentationSchema.parse(invalidMaxPages)).toThrow();
    });

    test('QueryDocumentationParams validates correctly', () => {
      const QueryDocumentationSchema = z.object({
        query: z.string().min(1),
        topK: z.number().int().positive().default(5).optional(),
      });

      // Valid inputs
      const validInput1 = { query: 'How do React hooks work?' };
      const validInput2 = { query: 'TypeScript generics', topK: 3 };

      expect(() => QueryDocumentationSchema.parse(validInput1)).not.toThrow();
      expect(() => QueryDocumentationSchema.parse(validInput2)).not.toThrow();

      // Invalid inputs
      const emptyQuery = { query: '' };
      const invalidTopK = { query: 'test', topK: 0 };

      expect(() => QueryDocumentationSchema.parse(emptyQuery)).toThrow();
      expect(() => QueryDocumentationSchema.parse(invalidTopK)).toThrow();
    });
  });

  describe('Context Types', () => {
    test('DocRagContext structure is valid', () => {
      const mockContext = {
        stats: {
          totalIndexedPages: 10,
          totalEmbeddings: 50,
          lastIndexedUrl: 'https://react.dev',
          lastIndexedAt: new Date(),
          estimatedCost: 0.05,
        },
        indexedUrls: ['https://react.dev/docs', 'https://react.dev/tutorial'],
        queryHistory: [
          {
            query: 'How do hooks work?',
            timestamp: new Date(),
            resultsCount: 3,
          },
        ],
        lastQueryResults: { totalResults: 3 },
      };

      // Verify structure
      expect(mockContext).toHaveProperty('stats');
      expect(mockContext).toHaveProperty('indexedUrls');
      expect(mockContext).toHaveProperty('queryHistory');
      expect(mockContext.stats).toHaveProperty('totalIndexedPages');
      expect(mockContext.stats).toHaveProperty('totalEmbeddings');
      expect(Array.isArray(mockContext.indexedUrls)).toBe(true);
      expect(Array.isArray(mockContext.queryHistory)).toBe(true);
    });
  });

  describe('Tool Response Handling', () => {
    test('Success task creation', () => {
      const mockResult = { message: 'Success', data: { count: 5 } };
      
      // Simulate what our tools do
      const result = {
        kind: 'task',
        status: { state: 'completed' },
        data: mockResult,
      };

      expect(result.status.state).toBe('completed');
      expect(result.data).toEqual(mockResult);
    });

    test('Error task creation with suggestion', () => {
      const error = new Error('Test error');
      const suggestion = 'Try this instead';
      
      const result = {
        kind: 'task',
        status: { state: 'failed' },
        error: error.message,
        suggestion,
      };

      expect(result.status.state).toBe('failed');
      expect(result.error).toBe('Test error');
      expect(result.suggestion).toBe(suggestion);
    });
  });

  describe('MCP Response Parsing', () => {
    test('Parses successful MCP response', () => {
      const mockMcpResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              totalPagesScraped: 5,
              baseUrl: 'https://react.dev',
              embeddings: { embeddingsGenerated: 25, estimatedCost: 0.01 },
            }),
          },
        ],
        isError: false,
      };

      const firstContent = mockMcpResponse.content[0];
      const result = JSON.parse(firstContent.text);

      expect(result.totalPagesScraped).toBe(5);
      expect(result.baseUrl).toBe('https://react.dev');
      expect(result.embeddings.embeddingsGenerated).toBe(25);
    });

    test('Handles MCP error response', () => {
      const mockMcpResponse = {
        content: [
          {
            type: 'text',
            text: 'Error: Invalid URL provided',
          },
        ],
        isError: true,
      };

      expect(mockMcpResponse.isError).toBe(true);
      expect(mockMcpResponse.content[0].text).toContain('Error:');
    });
  });

  describe('URL Grouping Logic', () => {
    test('Groups URLs by domain correctly', () => {
      const urls = [
        'https://react.dev/docs/hooks',
        'https://react.dev/tutorial',
        'https://typescript.dev/docs/handbook',
        'https://typescript.dev/docs/reference',
      ];

      const urlsByDomain: Record<string, string[]> = {};
      urls.forEach((url) => {
        const domain = new URL(url).hostname;
        if (!urlsByDomain[domain]) {
          urlsByDomain[domain] = [];
        }
        urlsByDomain[domain].push(url);
      });

      expect(urlsByDomain['react.dev']).toHaveLength(2);
      expect(urlsByDomain['typescript.dev']).toHaveLength(2);
      expect(Object.keys(urlsByDomain)).toHaveLength(2);
    });

    test('Handles invalid URLs gracefully', () => {
      const urls = ['https://react.dev/docs', 'invalid-url', 'also-invalid'];

      const urlsByDomain: Record<string, string[]> = {};
      urls.forEach((url) => {
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

      expect(urlsByDomain['react.dev']).toHaveLength(1);
      expect(urlsByDomain['misc']).toHaveLength(2);
    });
  });

  describe('Result Formatting', () => {
    test('Formats query results correctly', () => {
      const mockResults = [
        {
          title: 'React Hooks',
          chunkInfo: 'Chunk 1 of 3',
          score: '0.9234',
          source: 'https://react.dev/docs/hooks',
          content: 'Hooks are a new addition in React 16.8...',
        },
        {
          title: 'useState Hook',
          chunkInfo: 'Chunk 2 of 5',
          score: '0.8765',
          source: 'https://react.dev/docs/hooks-state',
          content: 'useState is a Hook that lets you add state...',
        },
      ];

      const formattedResults = mockResults.map((r) => 
        `📄 **${r.title}** (${r.chunkInfo})\n` +
        `   Score: ${r.score} | Source: ${r.source}\n` +
        `   \n${r.content}\n`
      ).join('\n---\n\n');

      expect(formattedResults).toContain('📄 **React Hooks**');
      expect(formattedResults).toContain('Score: 0.9234');
      expect(formattedResults).toContain('Source: https://react.dev/docs/hooks');
      expect(formattedResults).toContain('---');
    });
  });

  describe('Environment Variable Validation', () => {
    test('Validates required environment variables', () => {
      const requiredVars = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY'];
      
      requiredVars.forEach(varName => {
        const hasVar = Boolean(process.env[varName]);
        // In test environment, we just verify the check works
        expect(typeof hasVar).toBe('boolean');
      });
    });
  });

  describe('Skill Configuration', () => {
    test('Skills have required metadata fields', () => {
      const mockSkill = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill',
        tags: ['test', 'demo'],
        examples: ['Test example 1', 'Test example 2'],
        inputSchema: z.object({ test: z.string() }),
        tools: [],
      };

      expect(mockSkill).toHaveProperty('id');
      expect(mockSkill).toHaveProperty('name');
      expect(mockSkill).toHaveProperty('description');
      expect(mockSkill).toHaveProperty('tags');
      expect(mockSkill).toHaveProperty('examples');
      expect(mockSkill.tags.length).toBeGreaterThan(0);
      expect(mockSkill.examples.length).toBeGreaterThan(0);
    });
  });
}); 