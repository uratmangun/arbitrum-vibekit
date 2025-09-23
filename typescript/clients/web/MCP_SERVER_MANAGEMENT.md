# Dynamic MCP Server Management

## Overview
Implemented a dynamic MCP (Model Context Protocol) server management system that allows users to add, remove, and toggle MCP servers through the UI without code changes.

## Features

- ✅ **Add Custom MCP Servers**: Users can add their own MCP servers via dialog
- ✅ **Enable/Disable Servers**: Toggle servers on/off with checkboxes
- ✅ **Remove Custom Servers**: Delete custom servers (built-in servers cannot be removed)
- ✅ **Persistent Storage**: Configuration saved in browser localStorage
- ✅ **Server Details**: Display name, description, URL, and status
- ✅ **Visual Indicators**: "Active" and "Custom" badges for easy identification

## Implementation

### Files Created

**1. `lib/mcp-server-config.ts`** - Core configuration management
```typescript
export interface MCPServer {
  id: string;
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  isCustom?: boolean;
}

// Functions:
- loadMCPServers(): Load from localStorage
- saveMCPServers(): Save to localStorage
- addMCPServer(): Add new server
- removeMCPServer(): Remove server by ID
- toggleMCPServer(): Enable/disable server
- updateMCPServer(): Update server properties
```

**2. `components/add-mcp-server-dialog.tsx`** - Add server dialog
- Form with name, URL, description fields
- "Enable immediately" checkbox
- Validation for required fields
- Clean, user-friendly interface

### Files Modified

**1. `components/sidebar-user-nav.tsx`**
- Added MCP server state management
- Integrated add/remove/toggle handlers
- Dynamic server list rendering
- Shows server URL, status badges
- Remove button for custom servers only

**2. `agents-config.ts`**
- Replaced hardcoded `DEFAULT_SERVER_URLS` Map
- Added `getEnabledMCPServers()` function
- Loads enabled servers from localStorage dynamically
- Maintains backward compatibility

## Usage

### For Users

**Adding a Custom MCP Server:**
1. Click wallet address → Settings
2. Scroll to "MCP Servers" section
3. Click "+ Add Custom MCP Server"
4. Fill in the form:
   - **Server Name**: Display name (e.g., "My Custom Server")
   - **Server URL**: Endpoint URL (e.g., "http://localhost:3000/mcp")
   - **Description**: What the server does
   - **Enable immediately**: Check to activate right away
5. Click "Add Server"

**Enabling/Disabling Servers:**
- Click the checkbox next to any server to toggle it on/off
- Active servers show a green "Active" badge
- Changes are saved automatically

**Removing Custom Servers:**
- Click the "×" button next to custom servers
- Confirm the removal
- Built-in servers cannot be removed (no × button)

### For Developers

**Default Servers:**
```typescript
// lib/mcp-server-config.ts
export const DEFAULT_MCP_SERVERS: MCPServer[] = [
  // Empty by default - users add their own real MCP servers via UI
  // No mock servers included
];
```

**Note:** The default list is intentionally empty. Users should add their real MCP servers through the Settings UI. This ensures only actual, working MCP servers are configured.

**Loading Enabled Servers:**
```typescript
// agents-config.ts
import { getEnabledMCPServers } from '@/lib/mcp-server-config';

const enabledServers = getEnabledMCPServers();
// Returns Map<string, string> of enabled server IDs and URLs
```

**Programmatic Management:**
```typescript
import {
  addMCPServer,
  removeMCPServer,
  toggleMCPServer,
  updateMCPServer,
} from '@/lib/mcp-server-config';

// Add server
const newServer = addMCPServer({
  name: 'Custom Server',
  description: 'My custom MCP server',
  url: 'http://localhost:3000/mcp',
  enabled: true,
});

// Toggle server
toggleMCPServer('mongodb');

// Remove server
removeMCPServer('custom-1234567890');

// Update server
updateMCPServer('mongodb', {
  enabled: false,
  url: 'mongodb://newhost:27017',
});
```

## Storage

**localStorage Key:** `mcp_servers_config`

**Data Structure:**
```json
[
  {
    "id": "custom-1234567890",
    "name": "My MCP Server",
    "description": "Production MCP server",
    "url": "http://localhost:3000/mcp",
    "enabled": true,
    "isCustom": true,
    "headers": {
      "Authorization": "Bearer token123",
      "X-Custom-Header": "value"
    }
  },
  {
    "id": "custom-9876543210",
    "name": "Another MCP Server",
    "description": "Secondary MCP server",
    "url": "http://localhost:3001/mcp",
    "enabled": false,
    "isCustom": true
  }
]
```

**Note:** All servers added by users will have `isCustom: true` since there are no pre-configured default servers. The `headers` field is optional and can contain custom HTTP headers for authentication or other purposes.

## UI Components

### Settings Dialog - MCP Servers Section

```
┌─ MCP Servers ──────────────────────────────────┐
│ Enable Model Context Protocol servers for      │
│ extended functionality                          │
│                                                 │
│ (No servers configured yet)                    │
│                                                 │
│ ────────────────────────────────────────────   │
│ + Add Custom MCP Server                        │
└─────────────────────────────────────────────────┘

After adding servers:

┌─ MCP Servers ──────────────────────────────────┐
│ Enable Model Context Protocol servers for      │
│ extended functionality                          │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ My Server  [Active] [Custom]  [✓]  [×] │   │
│ │ Production MCP server                   │   │
│ │ http://localhost:3000/mcp               │   │
│ │ 🔒 2 custom headers                     │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ────────────────────────────────────────────   │
│ + Add Custom MCP Server                        │
└─────────────────────────────────────────────────┘
```

### Add Server Dialog

```
┌─ Add Custom MCP Server ────────────────────┐
│ Add a new Model Context Protocol server    │
│ to extend functionality.                    │
│ You can auto-discover server details.      │
│                                             │
│ Server URL *                                │
│ [http://localhost:3000/mcp] [Discover]     │
│ The endpoint URL for your MCP server       │
│                                             │
│ Protocol                                    │
│ [HTTP (Streamable)        ▼]               │
│ Select the transport protocol              │
│                                             │
│ Server Name *                               │
│ [e.g., My Custom Server            ]       │
│                                             │
│ Description                                 │
│ [Describe what this server does... ]       │
│ [                                   ]       │
│                                             │
│ Custom Headers (Optional)  [+ Add Header]  │
│ ┌─────────────────────────────────────┐   │
│ │ [Authorization] [Bearer token  ] [×]│   │
│ │ [X-API-Key    ] [your-key      ] [×]│   │
│ └─────────────────────────────────────┘   │
│ Add custom HTTP headers                    │
│                                             │
│ [✓] Enable immediately                     │
│                                             │
│                    [Cancel]  [Add Server]  │
└─────────────────────────────────────────────┘
```

## Benefits

1. **No Code Changes**: Users can add/remove servers without editing code
2. **Flexibility**: Support for any MCP-compatible server
3. **Persistence**: Configuration survives page reloads
4. **User-Friendly**: Simple UI for non-technical users
5. **Clean Start**: No mock servers - only real, working MCP servers
6. **Visual Feedback**: Clear status indicators and badges
7. **Full Control**: All servers are user-managed and can be removed

## Migration from Hardcoded Config

**Before:**
```typescript
// agents-config.ts
export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ['ember-aave', 'https://api.emberai.xyz/mcp'],
  ['mongodb', 'mongodb://localhost:27017'],
  // ... hardcoded servers
]);
```

**After:**
```typescript
// agents-config.ts
export function getEnabledMCPServers(): Map<string, string> {
  // Loads from localStorage dynamically
  // Returns only enabled servers
}

export const DEFAULT_SERVER_URLS = getEnabledMCPServers();
```

## Testing

```bash
# Start dev server
pnpm run dev

# Test flow
1. Open http://localhost:3100
2. Click wallet → Settings
3. Scroll to MCP Servers section
4. Toggle existing servers on/off
5. Click "+ Add Custom MCP Server"
6. Fill in form and submit
7. Verify new server appears in list
8. Toggle new server
9. Remove custom server with × button
10. Refresh page - verify persistence
```

## Future Enhancements

- [ ] Import/export server configurations
- [ ] Server health check/status indicator
- [ ] Server categories/grouping
- [ ] Search/filter servers
- [ ] Bulk enable/disable
- [ ] Server connection testing
- [ ] Usage statistics per server
- [ ] Share server configurations
