# MCP Introspection API Proxy

## Overview

A Next.js API route that proxies MCP server introspection requests to bypass CORS (Cross-Origin Resource Sharing) errors. This allows the frontend to discover MCP server capabilities without being blocked by browser CORS policies.

## Problem Solved

**CORS Error:**
```
Access to fetch at 'http://external-mcp-server.com/mcp' from origin 'http://localhost:3100' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Solution:**
- Frontend calls our backend API (`/api/mcp-introspect`)
- Backend makes request to MCP server (no CORS restrictions)
- Backend returns data to frontend

## API Endpoint

**URL:** `/api/mcp-introspect`  
**Method:** `POST`  
**Content-Type:** `application/json`

### Request Body

```typescript
{
  url: string;              // MCP server URL
  protocol: 'http' | 'sse'; // Transport protocol
  headers?: {               // Optional custom headers
    [key: string]: string;
  };
}
```

### Response (Success)

```typescript
{
  name: string;        // Auto-detected server name
  description: string; // Server description
  tools: Array<{       // List of available tools
    name: string;
    description: string;
    inputSchema?: any;
  }>;
}
```

### Response (Error)

```typescript
{
  error: string; // Error message
}
```

## Usage Examples

### Example 1: Basic Request

```typescript
const response = await fetch('/api/mcp-introspect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'http://localhost:3000/mcp',
    protocol: 'http',
  }),
});

const data = await response.json();
console.log(data.name);  // "Local MCP Server (3000)"
console.log(data.tools); // Array of tools
```

### Example 2: With Custom Headers

```typescript
const response = await fetch('/api/mcp-introspect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://api.example.com/mcp',
    protocol: 'http',
    headers: {
      'Authorization': 'Bearer token123',
      'X-API-Key': 'api-key-456',
    },
  }),
});
```

### Example 3: SSE Protocol

```typescript
const response = await fetch('/api/mcp-introspect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'http://localhost:3001/sse',
    protocol: 'sse',
  }),
});
```

## Implementation Details

### File Location
```
app/(chat)/api/mcp-introspect/route.ts
```

### Key Features

1. **CORS Bypass**: Server-side requests avoid browser CORS restrictions
2. **Protocol Support**: Handles both HTTP and SSE transports
3. **Header Forwarding**: Passes custom headers to MCP server
4. **Error Handling**: Comprehensive error messages
5. **Resource Cleanup**: Properly closes MCP client connections
6. **URL Validation**: Validates URL format and protocol

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │         │  Next.js API │         │ MCP Server  │
│  (Frontend) │────────▶│    Proxy     │────────▶│  (External) │
└─────────────┘         └──────────────┘         └─────────────┘
     │                         │                         │
     │  POST /api/mcp-         │  Direct HTTP/SSE       │
     │  introspect             │  request (no CORS)     │
     │                         │                         │
     │◀────────────────────────│◀────────────────────────│
     │  JSON response          │  MCP response          │
     │  (no CORS issues)       │                         │
```

## Error Handling

### URL Validation Errors

**Missing URL:**
```json
{
  "error": "URL is required"
}
```
**Status:** `400 Bad Request`

**Invalid URL Format:**
```json
{
  "error": "Invalid URL format"
}
```
**Status:** `400 Bad Request`

**Invalid Protocol:**
```json
{
  "error": "Invalid URL protocol. Must be http:// or https://"
}
```
**Status:** `400 Bad Request`

### Connection Errors

**Server Unreachable:**
```json
{
  "error": "Failed to introspect MCP server: ECONNREFUSED"
}
```
**Status:** `500 Internal Server Error`

**Timeout:**
```json
{
  "error": "Failed to introspect MCP server: Request timeout"
}
```
**Status:** `500 Internal Server Error`

## Frontend Integration

### Updated Introspection Utility

The `introspectMCPServer()` function now uses the API proxy:

```typescript
// components/mcp-server-introspection.ts
export async function introspectMCPServer(
  url: string,
  protocol: 'http' | 'sse' = 'http',
  headers?: Record<string, string>
): Promise<MCPServerInfo> {
  const response = await fetch('/api/mcp-introspect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, protocol, headers }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }

  return await response.json();
}
```

### No Changes Required in UI

The dialog component (`add-mcp-server-dialog.tsx`) continues to work without modifications:

```typescript
// This still works the same way
const serverInfo = await introspectMCPServer(url, protocol, headers);
```

## Security Considerations

⚠️ **Important:**

1. **Server-Side Only**: API runs on Node.js server, not in browser
2. **No CORS Headers Needed**: Server-to-server communication
3. **Header Forwarding**: Custom headers passed securely to MCP server
4. **URL Validation**: Prevents malicious URL injection
5. **Error Sanitization**: Doesn't expose internal server details

### Recommendations

- Add rate limiting to prevent abuse
- Implement authentication if needed
- Log requests for monitoring
- Set timeout limits for long-running requests

## Testing

### Test with cURL

```bash
curl -X POST http://localhost:3100/api/mcp-introspect \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:3000/mcp",
    "protocol": "http"
  }'
```

### Test with Frontend

1. Open app at `http://localhost:3100`
2. Go to Settings → MCP Servers
3. Click "+ Add Custom MCP Server"
4. Enter URL and click "Discover"
5. Should work without CORS errors

## Performance

- **Response Time**: Depends on MCP server response time
- **Overhead**: Minimal (~10-50ms for proxy processing)
- **Concurrent Requests**: Supports multiple simultaneous introspections
- **Resource Cleanup**: Automatic client connection closure

## Troubleshooting

### "URL is required" error
**Cause**: Missing URL in request body  
**Solution**: Ensure URL is provided in POST body

### "Failed to introspect MCP server: ECONNREFUSED"
**Cause**: MCP server is not running or URL is incorrect  
**Solution**: Verify MCP server is running and URL is correct

### API route not found (404)
**Cause**: API route not properly created  
**Solution**: Ensure file exists at `app/(chat)/api/mcp-introspect/route.ts`

### Still getting CORS errors
**Cause**: Frontend calling MCP server directly instead of API  
**Solution**: Ensure `introspectMCPServer()` uses `/api/mcp-introspect`

## Benefits

✅ **No CORS Issues**: Bypasses browser CORS restrictions  
✅ **Secure**: Server-side validation and error handling  
✅ **Transparent**: Frontend code remains unchanged  
✅ **Flexible**: Supports multiple protocols and custom headers  
✅ **Reliable**: Proper resource cleanup and error handling  

## Future Enhancements

- [ ] Add request caching
- [ ] Implement rate limiting
- [ ] Add authentication/authorization
- [ ] Support request timeouts configuration
- [ ] Add request logging and monitoring
- [ ] Support WebSocket transport
