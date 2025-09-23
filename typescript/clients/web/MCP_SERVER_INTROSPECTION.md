# MCP Server Introspection Feature

## Overview

The MCP Server Introspection feature allows users to automatically discover and validate MCP server capabilities without manual configuration. When adding a new MCP server, users can click "Discover" to:

- ✅ Test the server connection
- ✅ Auto-detect server name
- ✅ Auto-detect server description
- ✅ List all available tools
- ✅ View tool descriptions and input schemas

## How It Works

### Architecture

```
User enters URL → Click "Discover" → Connect to MCP Server
                                           ↓
                                    Fetch Available Tools
                                           ↓
                                    Extract Tool Metadata
                                           ↓
                                    Auto-fill Form Fields
                                           ↓
                                    Display Tools List
```

### Technology Stack

- **Vercel AI SDK**: `experimental_createMCPClient` for MCP connections
- **MCP SDK**: Transport layers (HTTP, SSE)
- **TypeScript**: Type-safe introspection utilities

## Features

- **Discover Button**: One-click server introspection
- **Protocol Selection**: Support for HTTP and SSE transports
- **Auto-fill**: Automatically populate name and description
- **Tool Discovery**: List all available tools with descriptions
- **Error Handling**: Clear error messages for connection issues
- **Loading States**: Visual feedback during discovery

## Usage

1. Open Settings → MCP Servers
2. Click "+ Add Custom MCP Server"
3. Enter server URL (e.g., `http://localhost:3000/mcp`)
4. Select protocol (HTTP or SSE)
5. Click "Discover" button
6. Review auto-filled name, description, and tools
7. Click "Add Server"

## Dependencies

```bash
pnpm add @modelcontextprotocol/sdk ai
```

## Testing

```bash
pnpm run dev
# Navigate to Settings → MCP Servers → Add Custom MCP Server
# Enter URL and click Discover
```
