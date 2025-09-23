# MCP LocalStorage Fix - Client to Server Communication

## Problem

When MCP servers were added dynamically through the UI, they were stored in `localStorage` (client-side only). However, the `getDynamicTools()` function was called on the server-side (in the API route), which cannot access `localStorage`. This caused the MCP servers list to always be empty on the server.

## Root Cause

```
┌─────────────┐         ┌──────────────┐
│   Browser   │         │  Server API  │
│  (Client)   │────────▶│   Route      │
└─────────────┘         └──────────────┘
     │                         │
     │ localStorage            │ No localStorage!
     │ (MCP servers)           │ getEnabledMCPServers()
     │                         │ returns empty []
     ✓ Has data               ❌ No data
```

## Solution

Pass MCP servers from client to server via the request body:

```
┌─────────────┐         ┌──────────────┐
│   Browser   │         │  Server API  │
│  (Client)   │────────▶│   Route      │
└─────────────┘         └──────────────┘
     │                         │
     │ Load from               │ Receive via
     │ localStorage            │ request.context
     │                         │
     │ Send in body ──────────▶│ Pass to
     │ context.mcpServers      │ getDynamicTools()
     ✓ Has data               ✓ Has data
```

## Changes Made

### 1. Updated API Route Schema (`app/(chat)/api/chat/route.ts`)

**Added MCP servers to context schema:**
```typescript
const ContextSchema = z.object({
  walletAddress: z.string().optional(),
  mcpServers: z.array(z.object({
    id: z.string(),
    url: z.string(),
    enabled: z.boolean(),
    headers: z.record(z.string()).optional(),
  })).optional(),
});
```

**Extract and pass to getDynamicTools:**
```typescript
// Pass MCP servers from client context to getDynamicTools
const mcpServers = validatedContext.mcpServers || [];
const enabledServers = mcpServers.filter(s => s.enabled);
const serverMap = new Map(enabledServers.map(s => [s.id, s.url]));

console.log('[ROUTE] Loading dynamic tools with MCP servers:', enabledServers.length);
dynamicTools = await getDynamicTools(serverMap);
```

### 2. Updated getTools Function (`lib/ai/tools/tool-agents.ts`)

**Accept optional serverMap parameter:**
```typescript
export const getTools = async (
  serverMap?: Map<string, string>
): Promise<{ [key: string]: CoreTool }> => {
  // Use provided serverMap or fall back to DEFAULT_SERVER_URLS
  const SERVER_URLS = serverMap || DEFAULT_SERVER_URLS;
  
  console.log('[getTools] Using MCP servers:', Array.from(SERVER_URLS.entries()));

  if (SERVER_URLS.size === 0) {
    console.log('[getTools] No MCP servers configured, returning empty tools');
    return {};
  }
  
  // ... rest of the function uses SERVER_URLS
}
```

### 3. Updated Chat Component (`components/chat.tsx`)

**Load MCP servers from localStorage:**
```typescript
const [mcpServers, setMcpServers] = useState<Array<{
  id: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
}>>([]);

// Load MCP servers from localStorage
useEffect(() => {
  try {
    const stored = localStorage.getItem('mcp_servers_config');
    if (stored) {
      const servers = JSON.parse(stored);
      setMcpServers(servers);
      console.log('[Chat] Loaded MCP servers from localStorage:', servers.length);
    }
  } catch (error) {
    console.error('[Chat] Error loading MCP servers:', error);
  }
}, []);
```

**Pass to API via context:**
```typescript
useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: {
      id,
      selectedChatModel,
      context: {
        walletAddress: address,
        mcpServers,  // ← Now included!
      },
    },
  }),
  // ...
});
```

## Data Flow

### Complete Flow:

```
1. User adds MCP server in Settings
   ↓
2. Saved to localStorage (client-side)
   ↓
3. Chat component loads
   ↓
4. useEffect reads from localStorage
   ↓
5. Sets mcpServers state
   ↓
6. useChat sends request to /api/chat
   ↓
7. Request body includes context.mcpServers
   ↓
8. Server validates with ContextSchema
   ↓
9. Extracts enabled servers
   ↓
10. Creates Map<id, url>
   ↓
11. Passes to getDynamicTools(serverMap)
   ↓
12. getDynamicTools uses provided servers
   ↓
13. Tools loaded from MCP servers
   ↓
14. Tools available in chat
```

## Testing

### Verify the Fix:

1. **Add MCP Server:**
   - Go to Settings → MCP Servers
   - Add a custom MCP server
   - Enable it

2. **Check Console Logs:**
   ```
   [Chat] Loaded MCP servers from localStorage: 1
   [ROUTE] Loading dynamic tools with MCP servers: 1
   [getTools] Using MCP servers: [["server-id", "http://..."]
   [getTools] Loading tools from all servers: ["http://..."]
   ```

3. **Verify Tools Loaded:**
   - Start a chat
   - Check server console for tool loading messages
   - Tools should be available to the AI

### Debug Commands:

**Check localStorage (Browser Console):**
```javascript
JSON.parse(localStorage.getItem('mcp_servers_config'))
```

**Check server logs:**
```bash
# Look for these messages:
[Chat] Loaded MCP servers from localStorage: X
[ROUTE] Loading dynamic tools with MCP servers: X
[getTools] Using MCP servers: [...]
```

## Benefits

✅ **Works Across Server/Client Boundary**: MCP servers accessible on server  
✅ **No localStorage on Server**: Server receives data via request  
✅ **Type Safe**: Zod validation ensures correct data structure  
✅ **Headers Support**: Custom headers passed through  
✅ **Logging**: Console logs for debugging  

## Files Modified

1. ✅ `app/(chat)/api/chat/route.ts` - Accept mcpServers in context
2. ✅ `lib/ai/tools/tool-agents.ts` - Accept serverMap parameter
3. ✅ `components/chat.tsx` - Load and send MCP servers

## Troubleshooting

### Still seeing empty tools?

**Check 1: localStorage has data**
```javascript
// In browser console
localStorage.getItem('mcp_servers_config')
```

**Check 2: Chat component loads data**
```
// Look for this log:
[Chat] Loaded MCP servers from localStorage: X
```

**Check 3: Server receives data**
```
// Look for this log:
[ROUTE] Loading dynamic tools with MCP servers: X
```

**Check 4: getTools receives data**
```
// Look for this log:
[getTools] Using MCP servers: [...]
```

### No servers showing?

- Ensure servers are enabled in Settings
- Check servers have valid URLs
- Verify localStorage is not cleared
- Check browser console for errors

## Future Enhancements

- [ ] Add server-side caching of MCP servers
- [ ] Implement server-side storage (database)
- [ ] Add MCP server health checks
- [ ] Support hot-reloading of MCP servers
