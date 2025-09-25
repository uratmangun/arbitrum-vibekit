# Para MCP Server Integration Example

This guide walks through connecting the Para MCP server to the Arbitrum VibeKit web client so agents can manage pregenerated wallets and sign transactions during conversations.

## 1. Build the MCP Server

```bash
cd arbitrum-vibekit/typescript/lib/mcp-tools/para-mcp-server
pnpm install
pnpm build
```

The build step compiles the TypeScript sources located in `src/` into the `dist/` directory that is used by the HTTP and stdio entrypoints.

## 2. Configure Environment Variables

Create a `.env` file in the Para MCP server directory with your Para credentials:

```env
PARA_API_KEY=pk_live_or_test_value
PARA_ENVIRONMENT=BETA        # or PRODUCTION
PORT=3011                    # optional; defaults to 3011
```

> The server throws a `MissingParaApiKey` error if `PARA_API_KEY` is absent, so make sure the value is injected in development and production environments.

## 3. Run the Server

```bash
# Development (tsx hot reload)
pnpm dev

# Production build + serve
pnpm start
```

You should see console output similar to:
```
Para MCP Server (Hono + Node) is running on port 3011
MCP endpoint available at http://localhost:3011/mcp
Para MCP stdio server started and connected.
```

At this point both transports are active:
- **HTTP**: `POST/GET/DELETE http://localhost:3011/mcp`
- **stdio**: Communicates over the spawned process stdout/stdin

## 4. Register the Server with the Web Client

Update the VibeKit agent configuration so the UI can reach the Para tools.

```typescript
// clients/web/agents-config.ts
export const MCP_SERVERS = [
  // ...other entries
  {
    name: 'para',
    url: 'http://localhost:3011/mcp',
    description: 'Para pregenerated wallet tools',
  },
];
```

The Streamable HTTP transport is the recommended option in the web client. If you prefer stdio during local development, spawn the compiled server binary and pass the process to `StdioClientTransport`.

```typescript
import { spawn } from 'node:child_process';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const paraProcess = spawn('node', [
  'lib/mcp-tools/para-mcp-server/dist/index.js',
], {
  env: process.env,
});

const transport = new StdioClientTransport(paraProcess);
await client.connect(transport);
```

## 5. Tool Usage Flow in the UI

A typical wallet onboarding conversation calls tools in this order:

1. **`create_pregen_wallet`** – Seeds the in-memory cache and retrieves the user share from Para.
2. **`list_pregen_wallets`** *(optional)* – Shows the operator the current cache contents.
3. **`claim_pregen_wallet`** – Returns the user share for the frontend to complete a client-side claim.
4. **`sign_pregen_transaction`** – Signs or executes a transaction once the wallet is ready.

Each tool returns an artifact whose first part is JSON text. The web client typically uses `JSON.parse` to render or store the results. See `clients/web/components/ClaimPregenWallet.tsx` and related components for usage patterns. Claim status is now inferred remotely via Para SDK (no local mark step).

### Example Conversation Snippets
```
User: "Create a pregenerated wallet for alice@example.com"
Agent: (calls para:create_pregen_wallet)
UI: Shows the stored wallet record returned in the artifact.
```

```
User: "Sign this transaction with the wallet you just created"
Agent: (calls para:sign_pregen_transaction with rawTransaction + chainId)
UI: Displays the execution result JSON, including the Para SDK response.
```

## 6. Testing Locally

The repository includes a node-based test runner that mocks the Para SDK. Run it after local changes to ensure the entire toolchain still succeeds:

```bash
pnpm --filter @arbitrum-vibekit/para-mcp-server test
```

All tests should pass before shipping configuration or server changes.

## 7. Deployment Checklist

- Inject `PARA_API_KEY` and `PARA_ENVIRONMENT` in the runtime environment.
- Expose the `/mcp` endpoint behind HTTPS if the server is reachable outside your private network.
- Monitor logs for `VibkitError` names (`ParaSdkNotAvailable`, `MissingUserShare`, etc.) to triage configuration issues quickly.
- Since the wallet cache is in-memory, run a persistent process per operator session or back the store with a proper database before scaling to production workloads.

Following these steps aligns the Para MCP server with the Arbitrum VibeKit web client, enabling rich wallet automation flows directly from the chat interface.
