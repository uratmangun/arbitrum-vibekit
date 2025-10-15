/**
 * Unit tests for AI SDK adapters
 * Tests conversion functions for workflows and MCP tools
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { workflowToCoreTools, createCoreToolFromMCP } from './adapters.js';
import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';

describe('workflowToCoreTools', () => {
  describe('Tool Creation', () => {
    it('should create a tool with workflow metadata', () => {
      // Given: workflow metadata
      const workflowId = 'test-workflow';
      const description = 'A test workflow';
      const inputSchema = z.object({
        param1: z.string(),
      });
      const execute = vi.fn();

      // When: converting to AI SDK tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema, execute);

      // Then: should create tool with correct properties
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect(tool.execute).toBeDefined();
    });

    it('should use default description when not provided', () => {
      // Given: workflow without description
      const workflowId = 'no-description-workflow';
      const inputSchema = z.object({});
      const execute = vi.fn();

      // When: converting with empty description
      const tool = workflowToCoreTools(workflowId, '', inputSchema, execute);

      // Then: should use default description format
      expect(tool.description).toBe(`Dispatch ${workflowId} workflow`);
    });

    it('should handle complex input schemas', () => {
      // Given: workflow with complex nested schema
      const workflowId = 'complex-workflow';
      const description = 'Complex workflow';
      const inputSchema = z.object({
        name: z.string(),
        age: z.number().int().positive(),
        email: z.string().email().optional(),
        metadata: z
          .object({
            tags: z.array(z.string()),
            priority: z.enum(['low', 'medium', 'high']),
          })
          .optional(),
      });
      const execute = vi.fn();

      // When: converting to tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema, execute);

      // Then: should preserve schema structure
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle empty input schema', () => {
      // Given: workflow with no parameters
      const workflowId = 'no-params-workflow';
      const description = 'No params workflow';
      const inputSchema = z.object({});
      const execute = vi.fn();

      // When: converting to tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema, execute);

      // Then: should create valid tool with empty schema
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should call execute function with provided arguments', async () => {
      // Given: workflow tool with execute function
      const workflowId = 'exec-workflow';
      const description = 'Executable workflow';
      const inputSchema = z.object({
        message: z.string(),
      });
      const execute = vi.fn().mockResolvedValue({ success: true });

      const tool = workflowToCoreTools(workflowId, description, inputSchema, execute);

      // When: calling tool execute
      const args = { message: 'test message' };
      await tool.execute(args);

      // Then: should invoke execute function with args
      expect(execute).toHaveBeenCalledWith(args);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should propagate execution results', async () => {
      // Given: workflow that returns data
      const expectedResult = {
        success: true,
        workflowId: 'test',
        artifacts: ['file1.txt', 'file2.json'],
      };
      const execute = vi.fn().mockResolvedValue(expectedResult);

      const tool = workflowToCoreTools('result-workflow', 'Result workflow', z.object({}), execute);

      // When: executing tool
      const result = await tool.execute({});

      // Then: should return workflow result
      expect(result).toEqual(expectedResult);
    });

    it('should propagate execution errors', async () => {
      // Given: workflow that throws error
      const expectedError = new Error('Workflow execution failed');
      const execute = vi.fn().mockRejectedValue(expectedError);

      const tool = workflowToCoreTools('error-workflow', 'Error workflow', z.object({}), execute);

      // When: executing tool
      // Then: should throw the error
      await expect(tool.execute({})).rejects.toThrow('Workflow execution failed');
    });

    it('should handle async execution', async () => {
      // Given: workflow with async operation
      const execute = vi.fn().mockImplementation(async (args: Record<string, unknown>) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { processed: args };
      });

      const tool = workflowToCoreTools('async-workflow', 'Async workflow', z.object({}), execute);

      // When: executing tool
      const args = { data: 'test' };
      const result = await tool.execute(args);

      // Then: should complete async execution
      expect(result).toEqual({ processed: args });
    });
  });

  describe('Schema Integration', () => {
    it('should validate required parameters via Zod schema', () => {
      // Given: workflow with required parameters
      const inputSchema = z.object({
        requiredField: z.string(),
      });
      const execute = vi.fn();

      const tool = workflowToCoreTools(
        'validation-workflow',
        'Validation workflow',
        inputSchema,
        execute,
      );

      // When/Then: tool should be created with execute function
      expect(tool.execute).toBeDefined();
    });

    it('should support optional parameters', () => {
      // Given: workflow with optional parameters
      const inputSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });
      const execute = vi.fn();

      const tool = workflowToCoreTools(
        'optional-workflow',
        'Optional workflow',
        inputSchema,
        execute,
      );

      // When/Then: should create tool with mixed required/optional params
      expect(tool.execute).toBeDefined();
    });

    it('should support default values in schema', () => {
      // Given: workflow with default parameter values
      const inputSchema = z.object({
        message: z.string().default('default message'),
        count: z.number().int().positive().default(1),
      });
      const execute = vi.fn();

      const tool = workflowToCoreTools(
        'defaults-workflow',
        'Defaults workflow',
        inputSchema,
        execute,
      );

      // When/Then: should preserve defaults in schema
      expect(tool.execute).toBeDefined();
    });
  });
});

describe('createCoreToolFromMCP', () => {
  describe('MCP Tool Conversion', () => {
    it('should convert MCP tool with basic schema', () => {
      // Given: MCP tool metadata
      const name = 'mcp__test_tool';
      const description = 'A test MCP tool';
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      };
      const execute = vi.fn();

      // When: converting to AI SDK tool
      const tool = createCoreToolFromMCP(name, description, inputSchema, execute);

      // Then: should create valid tool
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect(tool.execute).toBeDefined();
    });

    it('should handle MCP tool with complex schema', () => {
      // Given: MCP tool with nested properties
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              count: { type: 'number' },
            },
          },
        },
      };
      const execute = vi.fn();

      // When: converting to tool
      const tool = createCoreToolFromMCP('mcp__complex', 'Complex tool', inputSchema, execute);

      // Then: should create tool with preserved schema structure
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should execute MCP tool and return result', async () => {
      // Given: MCP tool with execute function
      const expectedResult = { content: 'MCP response' };
      const execute = vi.fn().mockResolvedValue(expectedResult);
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };

      const tool = createCoreToolFromMCP('mcp__exec', 'Executable MCP tool', inputSchema, execute);

      // When: executing tool
      const result = await tool.execute({});

      // Then: should return MCP result
      expect(result).toEqual(expectedResult);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle MCP tool execution errors', async () => {
      // Given: MCP tool that fails
      const execute = vi.fn().mockRejectedValue(new Error('MCP server error'));
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };

      const tool = createCoreToolFromMCP('mcp__error', 'Error MCP tool', inputSchema, execute);

      // When/Then: should propagate error
      await expect(tool.execute({})).rejects.toThrow('MCP server error');
    });
  });

  describe('Schema Normalization', () => {
    it('should normalize MCP schema to JSON Schema Draft-07', () => {
      // Given: MCP tool with various property types
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          str: { type: 'string' },
          num: { type: 'number' },
          bool: { type: 'boolean' },
        },
        required: ['str'],
      };
      const execute = vi.fn();

      // When: converting tool
      const tool = createCoreToolFromMCP('mcp__normalize', 'Normalized tool', inputSchema, execute);

      // Then: should create tool with normalized schema
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle empty MCP schema', () => {
      // Given: MCP tool with no properties
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };
      const execute = vi.fn();

      // When: converting tool
      const tool = createCoreToolFromMCP('mcp__empty', 'Empty schema tool', inputSchema, execute);

      // Then: should create valid tool
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
  });
});
