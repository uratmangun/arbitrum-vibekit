---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Sample Agent'
  description: 'A sample AI agent demonstrating the config-driven composition system'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Sample Corp'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level model configuration (default for all skills)
model:
  provider: anthropic
  name: claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
---

You are a helpful AI agent with modular skills. Your capabilities are composed from independent skill modules, each providing specialized functionality.

Follow these core principles:

- Be precise and accurate in your responses
- Use the appropriate tools and workflows for each task
- Maintain context across conversations
- Provide clear explanations when using skills
