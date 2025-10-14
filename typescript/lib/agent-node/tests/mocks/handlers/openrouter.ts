import { http } from 'msw';

import { checkErrorTriggers, createResponseFromMock } from '../utils/error-simulation.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

/**
 * Compute deterministic mockKey from request body
 * Maps request messages to the mock file key
 */
function computeMockKey(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return 'streaming-simple';
  }

  const requestBody = body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    stream?: boolean;
  };

  if (!requestBody.messages || requestBody.messages.length === 0) {
    return 'streaming-simple';
  }

  // Get last user message content
  const lastUserMessage = requestBody.messages.filter((m) => m.role === 'user').pop();

  if (!lastUserMessage) {
    return 'streaming-simple';
  }

  const content = lastUserMessage.content.toLowerCase();
  const isStreaming = requestBody.stream === true;

  // Map message content to mock keys
  if (content.includes('2+2') || content.includes('what is 2')) {
    return isStreaming ? 'streaming-simple' : 'simple-inference';
  }

  if (content.includes('heartbeat') || content.includes('test')) {
    return 'streaming-heartbeat';
  }

  if (requestBody.messages.length > 1) {
    return 'streaming-with-context';
  }

  return isStreaming ? 'streaming-simple' : 'simple-inference';
}

export const openrouterHandlers = [
  // Chat completions (streaming)
  http.post(`${OPENROUTER_API_URL}/chat/completions`, async ({ request }) => {
    const errorResponse = await checkErrorTriggers('openrouter');
    if (errorResponse) {
      return errorResponse;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const mockKey = computeMockKey(body);
    return await createResponseFromMock(mockKey, 'openrouter');
  }),
  // Responses API (Vercel AI SDK openrouter provider)
  http.post(`${OPENROUTER_API_URL}/responses`, async ({ request }) => {
    const errorResponse = await checkErrorTriggers('openrouter');
    if (errorResponse) {
      return errorResponse;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const mockKey = computeMockKey(body);
    return await createResponseFromMock(mockKey, 'openrouter');
  }),
];
