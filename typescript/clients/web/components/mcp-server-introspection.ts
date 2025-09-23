/**
 * MCP Server Introspection Utilities
 * 
 * This module provides utilities to connect to MCP servers and discover their
 * capabilities, including server metadata and available tools.
 * 
 * Uses a backend API proxy to avoid CORS issues.
 */

export interface MCPServerInfo {
  name: string;
  description: string;
  tools: MCPTool[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

/**
 * Test connection to an MCP server and retrieve its metadata and tools
 * 
 * @param url - The MCP server URL
 * @param protocol - The protocol type ('http' or 'sse')
 * @returns Server info including name, description, and available tools
 */
export async function introspectMCPServer(
  url: string,
  protocol: 'http' | 'sse' = 'http',
  headers?: Record<string, string>
): Promise<MCPServerInfo> {
  try {
    // Call our backend API to avoid CORS issues
    const response = await fetch('/api/mcp-introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        protocol,
        headers,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to introspect MCP server');
    }

    const data: MCPServerInfo = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to introspect MCP server: ${errorMessage}`);
  }
}


/**
 * Validate MCP server URL format
 */
export function isValidMCPServerUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Format tools for display
 */
export function formatToolsForDisplay(tools: MCPTool[]): string {
  if (tools.length === 0) {
    return 'No tools available';
  }
  
  return tools
    .map(tool => `• ${tool.name}: ${tool.description}`)
    .join('\n');
}
