---
skill:
  id: example-skill
  name: Example Skill
  description: 'A sample skill demonstrating skill composition and tool integration'
  tags: [example, demo]
  examples:
    - 'Show me an example of using this skill'
    - 'Demonstrate the example skill capabilities'
  inputModes: ['text/plain']
  outputModes: ['text/plain', 'application/json']

  # Optional: Model override for this skill
  # model:
  #   provider: openai
  #   name: gpt-5-mini
  #   params:
  #     temperature: 0.0
  #     reasoning: none

  # MCP server selection with per-skill tool scoping
  # mcp:
  #   servers:
  #     - name: example_server
  #       allowedTools: [example_server.read_file, example_server.list_files]

  # Workflow selection
  # workflows:
  #   include: ['example-workflow']
  #   overrides:
  #     example-workflow: { config: { mode: 'fast' } }
---

You are the Example Skill. This is a demonstration skill showing how skills are composed into the agent.

When activated, you can:

- Access tools from selected MCP servers
- Execute workflows defined in the registry
- Override model parameters for specific tasks
- Provide specialized domain knowledge
