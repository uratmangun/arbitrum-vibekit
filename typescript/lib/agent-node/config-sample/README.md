# Sample Config Workspace

This directory demonstrates the config-driven agent composition system.

## Structure

```
config/
├── agent.md                      # Agent base with A2A card + model defaults
├── agent.manifest.json           # Main manifest selecting skills & registries
├── mcp.json                      # MCP server registry (Claude-compatible)
├── workflow.json                 # Workflow plugin registry
├── skills/                       # Independent skill modules
│   └── example-skill.md
└── workflows/                    # Workflow plugin implementations
    └── example-workflow.ts
```

## Configuration Files

### agent.md

Contains:

- YAML frontmatter with A2A card base
- Agent-level model configuration (defaults)
- Base system prompt

### agent.manifest.json

Defines:

- Skill ordering (composition order)
- Registry paths (MCP, workflows)
- Merge policies (capabilities, policies, guardrails)

### skills/\*.md

Each skill contains:

- A2A skill fields (id, name, description, etc.)
- Optional model overrides (temperature, reasoning, model name)
- MCP server selections with optional tool scoping
- Workflow selections with optional config overrides
- Skill-specific system prompt

### mcp.json

Claude-compatible MCP server registry supporting:

- Stdio transport (local process)
- HTTP transport (remote servers)
- Environment variable references (`$env:VAR_NAME`)

### workflow.json

Explicit allowlist of workflow plugins:

- Plugin ID and source path
- Enabled/disabled flag
- Default configuration

## Usage

### Load Configuration

```typescript
import { loadAgentConfigFromDefault } from './src/config/index.js';

const config = await loadAgentConfigFromDefault('./config');
console.log(config.card);
console.log(config.prompt.content);
```

### Initialize Runtime

```typescript
import { initFromConfigWorkspace } from './src/config/runtime/init.js';

const runtime = await initFromConfigWorkspace({
  root: './config',
  dev: true, // Enable hot reload
});

// Access composed config
const { agentCard, finalPrompt, mcpInstances, workflowPlugins } = runtime.config;

// Cleanup
await runtime.close();
```

## Environment Variables

Required environment variables referenced in `mcp.json`:

```bash
EXAMPLE_API_KEY=your-api-key-here
```

Add these to your `.env` file.

## Adding a New Skill

1. Create `skills/my-skill.md`:

```markdown
---
skill:
  id: my-skill
  name: My Skill
  description: 'What this skill does'
  mcp:
    servers:
      - name: example_server
        allowedTools: [example_server.my_tool]
---

You are the My Skill. You specialize in...
```

2. Add to `agent.manifest.json`:

```json
{
  "skills": ["./skills/example-skill.md", "./skills/my-skill.md"]
}
```

3. Restart agent or rely on hot reload (dev mode)

## Adding a New Workflow

1. Create `workflows/my-workflow.ts` (ESM format)
2. Add to `workflow.json`:

```json
{
  "workflows": [
    {
      "id": "my-workflow",
      "from": "./workflows/my-workflow.ts",
      "enabled": true
    }
  ]
}
```

3. Select in skill frontmatter:

```yaml
workflows:
  include: ['my-workflow']
```

## Validation

Run configuration validation:

```bash
# TODO: Add agent doctor command
agent doctor
```

## Tool Naming Convention

All tools must follow the canonical naming scheme:

- Format: `server_name.tool_name`
- Allowed characters: lowercase letters (a-z), digits (0-9), underscores (\_)
- Duplicates are forbidden

Example: `example_server.read_file`
