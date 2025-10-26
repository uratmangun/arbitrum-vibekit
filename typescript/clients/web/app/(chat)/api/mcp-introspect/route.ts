import { experimental_createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface IntrospectRequest {
  url: string;
  protocol: 'http' | 'sse';
  headers?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body: IntrospectRequest = await request.json();
    const { url, protocol, headers } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let urlObj: URL;
    try {
      urlObj = new URL(url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return NextResponse.json(
          { error: 'Invalid URL protocol. Must be http:// or https://' },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    let client;
    let transport;

    try {
      // Create appropriate transport based on protocol
      if (protocol === 'sse') {
        transport = new SSEClientTransport(urlObj, {
          headers: headers || {},
        });
      } else {
        transport = new StreamableHTTPClientTransport(urlObj, {
          headers: headers || {},
        });
      }

      // Create MCP client
      client = await experimental_createMCPClient({
        transport,
      });

      // Fetch available tools
      const toolsMap = await client.tools();

      // Convert tools map to array format
      const tools = Object.entries(toolsMap).map(([name, tool]) => ({
        name,
        description: (tool as any).description || 'No description available',
        inputSchema: (tool as any).inputSchema,
      }));

      // Extract server name from URL
      const hostname = urlObj.hostname;
      let serverName: string;
      
      if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        const port = urlObj.port || '3000';
        serverName = `Local MCP Server (${port})`;
      } else {
        serverName = hostname.split('.')[0].charAt(0).toUpperCase() + 
                     hostname.split('.')[0].slice(1) + ' MCP Server';
      }

      const serverDescription = `MCP Server with ${tools.length} tool${tools.length !== 1 ? 's' : ''}`;

      return NextResponse.json({
        name: serverName,
        description: serverDescription,
        tools,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to introspect MCP server: ${errorMessage}` },
        { status: 500 }
      );
    } finally {
      // Properly close the client
      if (client) {
        try {
          await client.close();
        } catch (closeError) {
          console.error('Error closing MCP client:', closeError);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Request processing failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
