import { dynamicTool} from 'ai';
import { z } from 'zod';
import type { CoreTool } from '@/lib/ai/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { cookies } from 'next/headers';
import { DEFAULT_SERVER_URLS } from '../../../agents-config';
import type { ChatAgentId } from '../../../agents-config';

/*export const getEmberLending = tool({
  description: 'Get the current weather at a location',
  parameters: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ latitude, longitude }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
    );

    const weatherData = await response.json();
    return weatherData;
  },
}); */

const URL_CHAT_IDS = new Map<string, ChatAgentId>();
if (DEFAULT_SERVER_URLS.size > 0) {
  DEFAULT_SERVER_URLS.forEach((value, key) => URL_CHAT_IDS.set(value, key));
}

const convertToZodSchema = (schema: any): z.ZodSchema => {
  if (!schema) return z.object({});

  // If it's already a Zod schema, return it
  if (schema._def !== undefined) return schema;

  // For an object schema, convert properties
  if (schema.type === 'object' && schema.properties) {
    const zodProperties: { [key: string]: z.ZodTypeAny } = {};
    const requiredFields = schema.required || [];

    Object.entries(schema.properties).forEach(
      ([key, propSchema]: [string, any]) => {
        let zodType: z.ZodTypeAny;

        switch (propSchema.type) {
          case 'string':
            zodType = z.string().describe(propSchema.description || '');
            break;
          case 'number':
            zodType = z.number().describe(propSchema.description || '');
            break;
          case 'boolean':
            zodType = z.boolean().describe(propSchema.description || '');
            break;
          default:
            // Default to any for complex types
            zodType = z.any();
        }

        // Mark as optional if not in required list
        if (!requiredFields.includes(key)) {
          zodType = zodType.optional();
        }

        zodProperties[key] = zodType;
      },
    );
    return z.object(zodProperties);
  }

  // Default fallback
  return z.object({});
};

async function getTool(serverUrl: string, selectedTools?: string[]) {
  let mcpClient = null;

  // Create MCP Client
  mcpClient = new Client(
    { name: 'TestClient', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  // Create StreamableHTTP transport
  let transport = null;
  if (serverUrl) {
    transport = new StreamableHTTPClientTransport(
      new URL(serverUrl),
      {} // headers - empty for now
    );
  }

  // Connect to the server
  if (transport) {
    await mcpClient.connect(transport);
    console.log('MCP client initialized successfully!');
  }

  // Try to discover tools
  console.log('Attempting to discover tools via MCP client...');
  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let toolsResponse;
  try {
    toolsResponse = await mcpClient.listTools();
    console.log(toolsResponse);
  } catch (error) {
    console.error('Error discovering tools:', error);
    toolsResponse = { tools: [] }; // Fallback to empty tools array
  }

  // Filter tools if selectedTools is provided
  const toolsToProcess = selectedTools && selectedTools.length > 0
    ? toolsResponse.tools.filter(tool => selectedTools.includes(tool.name))
    : toolsResponse.tools;

  // Use reduce to create an object mapping tool names to AI tools
  const toolObject = toolsToProcess.reduce(
    (acc, mcptool) => {
      // Log the MCP tool schema for debugging
      console.log(`[getTool] Processing MCP tool: ${mcptool.name}`);
      console.log(`[getTool] Tool description:`, mcptool.description);
      console.log(`[getTool] Tool input schema:`, JSON.stringify(mcptool.inputSchema, null, 2));

      // Convert MCP tool schema to Zod schema
      const zodSchema = convertToZodSchema(mcptool.inputSchema);
      console.log(`[getTool] Converted Zod schema for ${mcptool.name}:`, zodSchema);

      const aiTool = dynamicTool({
        description: mcptool.description,
        parameters: zodSchema,
        // Enable approval for all MCP tools to ensure user consent before execution
        needsApproval: false,
        // @ts-ignore - AI SDK v6 tool types have compatibility issues with parameter inference
        execute: async (args: Record<string, unknown>) => {
          console.log(`[getTool] ========== EXECUTING TOOL: ${mcptool.name} ==========`);
          console.log(`[getTool] Arguments received:`, JSON.stringify(args, null, 2));
          console.log(`[getTool] MCP Client available:`, !!mcpClient);

          try {
            const result = await mcpClient.callTool({
              name: mcptool.name,
              arguments: args,
            });
            console.log(`[getTool] Tool result for ${mcptool.name}:`, JSON.stringify(result));
            const toolResult = { status: 'completed', result: result };
            return toolResult;
          } catch (error) {
            console.error(`[getTool] Error executing tool ${mcptool.name}:`, error);
            throw error;
          }
        },
      }) as any;
      // Add the tool to the accumulator object, using its name as the key
      acc[mcptool.name] = aiTool;
      return acc;
    },
    {} as { [key: string]: CoreTool },
  ); // Initialize with the correct type

  // Return the object of tools
  console.log('toolObject =', toolObject);
  return toolObject;
}

export const getTools = async (
  serverMap?: Map<string, string>,
  serverToolsMap?: Map<string, string[]>
): Promise<{ [key: string]: CoreTool }> => {
  console.log('Initializing MCP client...');

  // Use provided serverMap or fall back to DEFAULT_SERVER_URLS
  const SERVER_URLS = serverMap || DEFAULT_SERVER_URLS;

  console.log('[getTools] Using MCP servers:', Array.from(SERVER_URLS.entries()));

  if (SERVER_URLS.size === 0) {
    console.log('[getTools] No MCP servers configured, returning empty tools');
    return {};
  }

  const cookieStore = await cookies();
  const rawAgentId = cookieStore.get('agent')?.value;
  const agentId = rawAgentId as ChatAgentId | undefined;
  const overrideUrl = process.env.MCP_SERVER_URL; // optional env override

  // helper that chooses override first, then config file
  const resolveUrl = (id: ChatAgentId) =>
    overrideUrl ?? SERVER_URLS.get(id) ?? '';

  // "all" agents: fan-out to every URL
  if (!agentId || agentId === 'all') {
    const urls = Array.from(SERVER_URLS.keys()).map((id) =>
      resolveUrl(id),
    );
    console.log('[getTools] Loading tools from all servers:', urls);
    const toolsByAgent = await Promise.all(
      urls.map((url, idx) => {
        const serverId = Array.from(SERVER_URLS.keys())[idx];
        const selectedTools = serverToolsMap?.get(serverId);
        return getTool(url, selectedTools);
      })
    );
    // flatten and prefix so you don't get name collisions
    return toolsByAgent.reduce(
      (
        all: Record<string, CoreTool>,
        tools: { [key: string]: CoreTool },
        idx: number,
      ) => {
        const id = Array.from(SERVER_URLS.keys())[idx];
        Object.entries(tools).forEach(([toolName, tool]) => {
          all[`${id}-${toolName}`] = tool; // Changed to dash for clarity
        });
        return all;
      },
      {} as Record<string, CoreTool>,
    );
  }

  // single agent
  const serverUrl = resolveUrl(agentId);
  if (!serverUrl) {
    // It's better to return an empty object or handle this case as per your application's needs
    // Throwing an error might be too disruptive for some use cases.
    // For now, let's log an error and return an empty toolset.
    console.error(`No server URL configured for agent "${agentId}"`);
    return {};
  }
  console.log('[getTools] Loading tools from single server:', serverUrl);
  const selectedTools = serverToolsMap?.get(agentId);
  return getTool(serverUrl, selectedTools);
};
