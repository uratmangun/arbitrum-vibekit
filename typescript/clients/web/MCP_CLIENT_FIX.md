# MCP Client Import Fix

## Problem
The `experimental_createMCPClient` function was being imported from the wrong package, causing a build error:

```
Error: Export experimental_createMCPClient doesn't exist in target module
import { experimental_createMCPClient } from 'ai';
```

## Root Cause
The `experimental_createMCPClient` function is not exported from the `'ai'` package. It's exported from the separate `'@ai-sdk/mcp'` package.

## Solution
1. Changed the import statement to use the correct package
2. Installed the `@ai-sdk/mcp` package

## Changes Made

### 1. **Fixed Import** (`app/(chat)/api/mcp-introspect/route.ts`)

**Before:**
```typescript
import { experimental_createMCPClient } from 'ai';
```

**After:**
```typescript
import { experimental_createMCPClient } from '@ai-sdk/mcp';
```

### 2. **Installed Package**
```bash
pnpm add @ai-sdk/mcp
```

## Package Information

### `@ai-sdk/mcp`
- **Purpose**: Provides MCP (Model Context Protocol) client functionality for Vercel AI SDK
- **Main Export**: `experimental_createMCPClient`
- **Documentation**: https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client

## API Reference

### `experimental_createMCPClient()`

**Import:**
```typescript
import { experimental_createMCPClient } from '@ai-sdk/mcp';
```

**Usage:**
```typescript
const client = await experimental_createMCPClient({
  transport: new StreamableHTTPClientTransport(url, { headers }),
});

// Get available tools
const toolsMap = await client.tools();

// Close client when done
await client.close();
```

## Related Packages

The AI SDK ecosystem is modular:

| Package | Purpose |
|---------|---------|
| `ai` | Core AI SDK functionality (streamText, generateText, etc.) |
| `@ai-sdk/mcp` | Model Context Protocol client |
| `@ai-sdk/react` | React hooks for AI SDK |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/groq` | Groq provider |
| `@ai-sdk/xai` | xAI provider |
| `@openrouter/ai-sdk-provider` | OpenRouter provider |

## Why Separate Package?

The MCP functionality is in a separate package because:

1. **Modularity** - Not all projects need MCP functionality
2. **Bundle Size** - Keeps the core `ai` package smaller
3. **Experimental** - MCP features are still experimental and may change
4. **Dependencies** - MCP has specific transport dependencies

## File Modified

- `app/(chat)/api/mcp-introspect/route.ts` - Fixed import statement

## Testing

After the fix:
1. ✅ Build should succeed
2. ✅ MCP introspection endpoint should work
3. ✅ No import errors
4. ✅ MCP client creation works correctly

## Future Considerations

Since this is an **experimental** API:
- The API may change in future versions
- Monitor AI SDK release notes for updates
- Consider adding error handling for API changes
- May become stable in future releases

## Additional Resources

- [AI SDK MCP Documentation](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [MCP Client Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
- [Model Context Protocol](https://modelcontextprotocol.io/)
