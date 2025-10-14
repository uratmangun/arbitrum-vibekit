/**
 * CLI Command: agent init
 * Scaffolds a new config workspace with sample files
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cliOutput } from '../output.js';

export interface InitOptions {
  target?: string;
  force?: boolean;
}

const SAMPLE_AGENT_MD = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'My Agent'
  description: 'An AI agent built with the config-driven composition system'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'My Organization'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
`;

const SAMPLE_GENERAL_SKILL = `---
skill:
  id: general-assistant
  name: General Assistant
  description: 'A general-purpose skill for helping users with common tasks'
  tags: [general, assistant]
  examples:
    - 'Help me with a task'
    - 'Answer my questions'
  inputModes: ['text/plain']
  outputModes: ['text/plain', 'application/json']

# MCP server integration
mcp:
  servers:
    - name: playwright
    - name: fetch
      allowedTools: [fetch_json, fetch_txt, fetch_markdown]

# Optional: Uncomment to add workflow integration
# workflows:
#   include: ['workflow-id']

# Optional: Uncomment to override model for this skill
# model:
#   provider: openrouter
#   name: anthropic/claude-sonnet-4.5
#   params:
#     temperature: 0.7
#     reasoning: low

---

You are a general-purpose assistant skill. Your role is to help users accomplish their goals by:

- Answering questions clearly and accurately
- Breaking down complex tasks into manageable steps
- Providing helpful suggestions and guidance
- Using available tools and resources effectively

Always be helpful, clear, and professional in your responses.
`;

const SAMPLE_MANIFEST = `{
  "version": 1,
  "skills": ["./skills/general-assistant.md"],
  "registries": {
    "mcp": "./mcp.json",
    "workflows": "./workflow.json"
  },
  "merge": {
    "card": {
      "capabilities": "union",
      "toolPolicies": "intersect",
      "guardrails": "tightest"
    }
  }
}
`;

const SAMPLE_MCP_JSON = `{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "fetch": {
      "command": "npx",
      "args": [
        "mcp-fetch-server"
      ],
      "env": {
        "DEFAULT_LIMIT": "50000"
      }
    }
  }
}
`;

const SAMPLE_WORKFLOW_JSON = `{
  "workflows": []
}
`;

const SAMPLE_README = `# Agent Configuration

This directory contains the config workspace for your agent.

## Structure

- \`agent.md\` - Agent base with A2A card and system prompt
- \`agent.manifest.json\` - Skill ordering and merge policies
- \`skills/\` - Individual skill markdown files
- \`mcp.json\` - MCP server registry
- \`workflow.json\` - Workflow plugin registry
- \`workflows/\` - Custom workflow plugin implementations

## Usage

### Development

Start the server with hot reload:

\`\`\`bash
NODE_ENV=development pnpm start
\`\`\`

### Print Configuration

View the composed configuration:

\`\`\`bash
pnpm agent print-config
\`\`\`

### Validate Configuration

Check for errors and conflicts:

\`\`\`bash
pnpm agent doctor
\`\`\`

## Adding Skills

1. Create a new skill file in \`skills/\` directory
2. Add the skill path to \`agent.manifest.json\` skills array
3. The skill will be automatically composed into the agent

## Adding MCP Servers

1. Add server configuration to \`mcp.json\`
2. Reference the server in skill frontmatter MCP config
3. Allowed tools can be scoped per skill

## Adding Workflows

1. Create a workflow plugin in \`workflows/\` directory
2. Add workflow entry to \`workflow.json\`
3. Reference the workflow in skill frontmatter workflow config
`;

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const targetDir = resolve(process.cwd(), options.target ?? 'config');

  // Check if target already exists
  if (existsSync(targetDir) && !options.force) {
    throw new Error(
      `Directory already exists: ${targetDir}\nUse --force to overwrite existing directory`,
    );
  }

  cliOutput.print(`Initializing config workspace at ${targetDir}`);

  // Create directory structure
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(resolve(targetDir, 'skills'), { recursive: true });
  mkdirSync(resolve(targetDir, 'workflows'), { recursive: true });

  // Write sample files
  writeFileSync(resolve(targetDir, 'agent.md'), SAMPLE_AGENT_MD);
  writeFileSync(resolve(targetDir, 'agent.manifest.json'), SAMPLE_MANIFEST);
  writeFileSync(resolve(targetDir, 'mcp.json'), SAMPLE_MCP_JSON);
  writeFileSync(resolve(targetDir, 'workflow.json'), SAMPLE_WORKFLOW_JSON);
  writeFileSync(resolve(targetDir, 'README.md'), SAMPLE_README);
  writeFileSync(resolve(targetDir, 'skills', 'general-assistant.md'), SAMPLE_GENERAL_SKILL);

  cliOutput.success('Created `agent.md`');
  cliOutput.success('Created `agent.manifest.json`');
  cliOutput.success('Created `mcp.json`');
  cliOutput.success('Created `workflow.json`');
  cliOutput.success('Created `README.md`');
  cliOutput.success('Created `skills/` directory');
  cliOutput.success('Created `skills/general-assistant.md`');
  cliOutput.success('Created `workflows/` directory');

  cliOutput.blank();
  cliOutput.print('Config workspace initialized successfully!', 'cyan');
  cliOutput.blank();
  cliOutput.print('**Next steps:**');
  cliOutput.print('  1. Edit `config/agent.md` to customize your agent');
  cliOutput.print('  2. Customize `config/skills/general-assistant.md` or add more skills');
  cliOutput.print('  3. Run: `pnpm agent doctor`');
  cliOutput.print('  4. Run: `pnpm agent run --dev`');
}
