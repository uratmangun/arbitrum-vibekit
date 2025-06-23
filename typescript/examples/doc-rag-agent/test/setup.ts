/**
 * Test setup file for doc-rag-agent tests
 * Handles environment variables and global test configuration
 */

import { vi } from 'vitest';

// Mock environment variables for testing
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

if (!process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
}

// Mock process.exit to prevent tests from actually exiting
const originalExit = process.exit;
process.exit = vi.fn() as any;

// Clean up after all tests
afterAll(() => {
  process.exit = originalExit;
}); 