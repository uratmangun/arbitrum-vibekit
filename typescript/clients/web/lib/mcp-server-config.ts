export interface MCPServer {
  id: string;
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  isCustom?: boolean;
  headers?: Record<string, string>;
}

export const DEFAULT_MCP_SERVERS: MCPServer[] = [
  // Real MCP servers - users can add their own via the UI
  // Default list is empty, allowing users to configure their own servers
];

export const MCP_SERVERS_STORAGE_KEY = 'mcp_servers_config';

export function loadMCPServers(): MCPServer[] {
  if (typeof window === 'undefined') return DEFAULT_MCP_SERVERS;
  
  try {
    const stored = localStorage.getItem(MCP_SERVERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading MCP servers:', error);
  }
  return DEFAULT_MCP_SERVERS;
}

export function saveMCPServers(servers: MCPServer[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(MCP_SERVERS_STORAGE_KEY, JSON.stringify(servers));
  } catch (error) {
    console.error('Error saving MCP servers:', error);
  }
}

export function addMCPServer(server: Omit<MCPServer, 'id'>): MCPServer {
  const newServer: MCPServer = {
    ...server,
    id: `custom-${Date.now()}`,
    isCustom: true,
  };
  
  const servers = loadMCPServers();
  servers.push(newServer);
  saveMCPServers(servers);
  
  return newServer;
}

export function removeMCPServer(id: string): void {
  const servers = loadMCPServers();
  const filtered = servers.filter((s) => s.id !== id);
  saveMCPServers(filtered);
}

export function toggleMCPServer(id: string): void {
  const servers = loadMCPServers();
  const updated = servers.map((s) =>
    s.id === id ? { ...s, enabled: !s.enabled } : s
  );
  saveMCPServers(updated);
}

export function updateMCPServer(id: string, updates: Partial<MCPServer>): void {
  const servers = loadMCPServers();
  const updated = servers.map((s) =>
    s.id === id ? { ...s, ...updates } : s
  );
  saveMCPServers(updated);
}
