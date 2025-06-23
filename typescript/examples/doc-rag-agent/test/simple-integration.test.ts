/**
 * Simple Integration Tests - No API Keys Required
 * Tests agent configuration and basic functionality
 */

import { describe, test, expect } from 'vitest';
import { agentConfig } from '../src/index.js';

describe('Documentation RAG Agent - Simple Integration', () => {
  test('Agent configuration is valid', () => {
    expect(agentConfig).toBeDefined();
    expect(agentConfig.name).toBe('Documentation RAG Agent');
    expect(agentConfig.version).toBe('1.0.0');
    expect(agentConfig.description).toContain('documentation');
    expect(agentConfig.skills).toHaveLength(2);
  });

  test('Skills are properly configured', () => {
    const skills = agentConfig.skills;
    
    // Check documentation management skill
    const managementSkill = skills.find(s => s.id === 'documentation-management');
    expect(managementSkill).toBeDefined();
    expect(managementSkill?.name).toBe('Documentation Management');
    expect(managementSkill?.tags).toContain('documentation');
    expect(managementSkill?.examples.length).toBeGreaterThan(0);
    expect(managementSkill?.tools.length).toBe(3); // index, clear, list

    // Check documentation query skill  
    const querySkill = skills.find(s => s.id === 'documentation-query');
    expect(querySkill).toBeDefined();
    expect(querySkill?.name).toBe('Documentation Query');
    expect(querySkill?.tags).toContain('RAG');
    expect(querySkill?.examples.length).toBeGreaterThan(0);
    expect(querySkill?.tools.length).toBe(1); // query
  });

  test('Skills have MCP server configurations', () => {
    agentConfig.skills.forEach(skill => {
      expect(skill.mcpServers).toBeDefined();
      expect(skill.mcpServers?.length).toBeGreaterThan(0);
      
      skill.mcpServers?.forEach(mcpConfig => {
        expect(mcpConfig.command).toBe('tsx');
        expect(mcpConfig.moduleName).toContain('doc-rag-mcp-server');
        expect(mcpConfig.env).toBeDefined();
      });
    });
  });

  test('Agent capabilities are configured correctly', () => {
    expect(agentConfig.capabilities).toBeDefined();
    expect(agentConfig.capabilities.streaming).toBe(false);
    expect(agentConfig.capabilities.pushNotifications).toBe(false);
    expect(agentConfig.capabilities.stateTransitionHistory).toBe(false);
  });

  test('Input/Output modes are set', () => {
    expect(agentConfig.defaultInputModes).toContain('application/json');
    expect(agentConfig.defaultOutputModes).toContain('application/json');
  });

  test('Agent URL is configured', () => {
    expect(agentConfig.url).toBe('localhost');
  });
}); 