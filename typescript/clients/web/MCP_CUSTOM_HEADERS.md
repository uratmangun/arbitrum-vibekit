# MCP Server Custom Headers Feature

## Overview

Added support for custom HTTP headers in MCP server configuration, allowing users to add authentication tokens, API keys, and other custom headers when connecting to MCP servers.

## Features

- ✅ **Custom Headers Input**: JSON-based header configuration
- ✅ **Header Validation**: Real-time JSON validation
- ✅ **Header Display**: Shows header count in server list
- ✅ **Introspection Support**: Headers sent during server discovery
- ✅ **Secure Storage**: Headers stored in localStorage

## Use Cases

### Authentication
```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "X-API-Key": "your-api-key-here"
}
```

### Custom Headers
```json
{
  "X-Custom-Header": "custom-value",
  "X-Client-Version": "1.0.0",
  "X-Request-ID": "unique-id"
}
```

### Content Type
```json
{
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

## Implementation

### Data Structure

**MCPServer Interface:**
```typescript
interface MCPServer {
  id: string;
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  isCustom?: boolean;
  headers?: Record<string, string>; // New field
}
```

### Files Modified

1. **`lib/mcp-server-config.ts`**
   - Added `headers?: Record<string, string>` to MCPServer interface

2. **`components/mcp-server-introspection.ts`**
   - Added `headers` parameter to `introspectMCPServer()`
   - Headers passed to transport layer during connection

3. **`components/add-mcp-server-dialog.tsx`**
   - Added headers JSON textarea input
   - JSON validation with error display
   - Headers included in server creation

4. **`components/sidebar-user-nav.tsx`**
   - Display header count indicator (🔒 2 custom headers)

## UI Components

### Headers Input Field (Form-based)

```
Custom Headers (Optional)          [+ Add Header]

┌─────────────────────────────────────────────┐
│ [Authorization        ] [Bearer token  ] [×]│
│ [X-Custom-Header      ] [custom-value  ] [×]│
└─────────────────────────────────────────────┘

Add custom HTTP headers for authentication
```

### Server Display with Headers

```
┌─────────────────────────────────────┐
│ My Server  [Active] [Custom]  [✓][×]│
│ Production MCP server               │
│ http://localhost:3000/mcp           │
│ 🔒 2 custom headers                 │
└─────────────────────────────────────┘
```

## Usage

### Adding Headers

1. Open Settings → MCP Servers
2. Click "+ Add Custom MCP Server"
3. Fill in server details
4. Scroll to "Custom Headers (Optional)"
5. Click "+ Add Header" button
6. Enter header name (e.g., "Authorization")
7. Enter header value (e.g., "Bearer your-token")
8. Click "+ Add Header" again to add more headers
9. Click "×" to remove a header
10. Click "Add Server"

### Form Fields

**Header Name:**
- Input field for the header key
- Example: `Authorization`, `X-API-Key`, `Content-Type`

**Header Value:**
- Input field for the header value
- Example: `Bearer token123`, `api-key-value`

**Remove Button (×):**
- Removes the header row
- Available for each header

## Validation

- **Empty headers skipped**: Headers with empty key or value are ignored
- **Trimming**: Whitespace is automatically trimmed
- **No duplicates check**: Multiple headers with same name are allowed
- **Optional**: Headers section is completely optional

## Security Considerations

⚠️ **Important:**
- Headers stored in browser localStorage (client-side only)
- Sensitive tokens visible in localStorage
- Use HTTPS for production servers
- Rotate tokens regularly
- Don't share localStorage data

## Examples

### Example 1: Bearer Token Authentication
```json
{
  "Authorization": "Bearer sk-1234567890abcdef"
}
```

### Example 2: API Key + Custom Headers
```json
{
  "X-API-Key": "your-api-key",
  "X-Client-ID": "client-123",
  "X-Request-Source": "web-app"
}
```

### Example 3: Multiple Auth Methods
```json
{
  "Authorization": "Bearer token",
  "X-API-Key": "api-key",
  "X-Session-ID": "session-123"
}
```

## Testing

```bash
# Start dev server
pnpm run dev

# Test flow
1. Open Settings → MCP Servers
2. Click "+ Add Custom MCP Server"
3. Enter URL: http://localhost:3000/mcp
4. Add headers:
   {
     "Authorization": "Bearer test-token"
   }
5. Click "Discover" (headers sent to server)
6. Verify server responds correctly
7. Add server and check display shows "🔒 1 custom header"
```

## Troubleshooting

### Headers not being sent
**Solution**: Ensure both key and value fields are filled, check server logs

### Header not saved
**Solution**: Make sure you filled in both the name and value fields

### Can't remove header
**Solution**: Click the "×" button on the right side of the header row

### Headers not working
**Solution**: Verify server expects these headers, check server logs

## Future Enhancements

- [ ] Header templates (common auth patterns)
- [ ] Encrypted header storage
- [ ] Header testing/validation
- [ ] Import/export headers
- [ ] Header presets library
