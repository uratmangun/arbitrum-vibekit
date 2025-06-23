# Documentation RAG Agent

An AI agent that demonstrates documentation indexing and querying capabilities using the doc-rag-mcp-server. This agent can scrape documentation websites, index them with embeddings, and answer questions using RAG (Retrieval Augmented Generation).

## Features

- 📚 **Documentation Indexing**: Scrape and index any documentation website
- 🔍 **Semantic Search**: Query indexed docs using natural language
- 📊 **Embeddings Support**: Generate OpenAI embeddings for better search
- 🗑️ **Index Management**: Clear and list indexed documentation
- 📈 **Context Tracking**: Maintains state of indexed URLs and query history

## Prerequisites

- Node.js 18+
- pnpm package manager
- OpenAI API key (for embeddings)
- OpenRouter API key (for agent LLM)

## Setup

1. **Install dependencies** from the workspace root:
   ```bash
   cd typescript/
   pnpm install
   pnpm build
   ```

2. **Set environment variables**:
   Create a `.env` file in this directory:
   ```env
   # Required
   OPENAI_API_KEY=sk-your-openai-api-key
   OPENROUTER_API_KEY=sk-or-your-openrouter-key
   
   # Optional
   LLM_MODEL=anthropic/claude-3.5-sonnet
   PORT=3008
   ```

3. **Run the agent**:
   ```bash
   pnpm dev
   ```

## Usage Examples

### 1. Index Documentation

Connect to the agent via MCP and use natural language:

```
User: "Index the React documentation"
Agent: Will scrape and index https://react.dev

User: "Index TypeScript docs with max 50 pages"
Agent: Will index up to 50 pages from TypeScript documentation
```

### 2. Query Documentation

```
User: "How do React hooks work?"
Agent: Returns relevant documentation chunks about React hooks with sources

User: "What is the useState hook?"
Agent: Provides specific information about useState with citations
```

### 3. Manage Index

```
User: "Show me all indexed URLs"
Agent: Lists all indexed documentation organized by domain

User: "Clear the documentation index"
Agent: Removes all indexed content (use with caution!)
```

## Skills

### Documentation Management
- **Purpose**: Handle indexing, clearing, and listing operations
- **Tools**: `index-documentation`, `clear-index`, `list-indexed-urls`
- **Examples**: "Index React docs", "Clear the index", "List indexed pages"

### Documentation Query
- **Purpose**: Search and retrieve information from indexed docs
- **Tools**: `query-documentation`
- **Examples**: "How do hooks work?", "Explain useState", "Find async/await docs"

## Architecture

```
doc-rag-agent/
├── src/
│   ├── index.ts           # Agent entry point with env checks
│   ├── context/           # Context provider for state tracking
│   │   ├── provider.ts    # Loads initial state from MCP
│   │   └── types.ts       # Context type definitions
│   ├── skills/            # Agent capabilities
│   │   ├── documentationManagement.ts
│   │   └── documentationQuery.ts
│   └── tools/             # MCP tool wrappers
│       ├── indexDocumentation.ts
│       ├── queryDocumentation.ts
│       ├── clearIndex.ts
│       └── listIndexedUrls.ts
├── test/                  # Integration tests
├── package.json
└── README.md
```

## How It Works

1. **MCP Server Connection**: The agent connects to the doc-rag-mcp-server via STDIO
2. **Tool Wrapping**: Each MCP tool is wrapped to transform responses into Vibekit task format
3. **Context Tracking**: A context provider maintains state across operations
4. **LLM Orchestration**: The agent uses LLM to route user intents to appropriate tools

## Testing

Run the test suite:
```bash
pnpm test
```

## Docker Support

Build and run with Docker:
```bash
docker build -f Dockerfile -t doc-rag-agent .
docker run -p 3008:3008 --env-file .env doc-rag-agent
```

## Troubleshooting

### "OPENAI_API_KEY is required"
The agent requires an OpenAI API key for embeddings. Get one from [OpenAI Platform](https://platform.openai.com/api-keys).

### "No documents indexed"
You need to index documentation before querying. Use commands like "Index the React documentation" first.

### Puppeteer/Chrome Issues
The doc-rag-mcp-server uses Puppeteer for web scraping. In Docker, Chrome dependencies are pre-installed. On local systems, ensure Chrome/Chromium is available.

## Development

### Adding New Features

1. **New Tools**: Add tool wrappers in `src/tools/`
2. **Context Extensions**: Update types in `src/context/types.ts`
3. **Skill Modifications**: Edit skills in `src/skills/`

### Best Practices

- Always update context when modifying indexed data
- Provide helpful error messages with suggestions
- Use the LLM for intent routing, not manual parsing
- Test with various documentation sites

## Contributing

See the main [CONTRIBUTIONS.md](../../CONTRIBUTIONS.md) for guidelines.

## License

MIT 