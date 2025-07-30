# DeFi Safety Agent

An AI agent that scores DeFi protocols based on DeFiSafety criteria by analyzing their documentation.

## Overview

The DeFi Safety Agent evaluates DeFi protocols across 11 key criteria:

1. **Contract Addresses** (15%) - Are deployed smart contract addresses easy to find?
2. **Public Repository** (3%) - Does the protocol have a public source code repository?
3. **Whitepaper** (8%) - Is there comprehensive project documentation available?
4. **Architecture** (8%) - Is the software architecture clearly documented?
5. **Testing** (15%) - Has the protocol thoroughly tested its code?
6. **Bug Bounty** (15%) - Is the bug bounty program value acceptably high?
7. **Admin Controls** (7%) - Is admin control documentation easy to find?
8. **Upgradeability** (7%) - Are contracts clearly labeled as upgradeable or immutable?
9. **Contract Ownership** (7%) - Is the type of contract ownership clearly indicated?
10. **Change Capabilities** (7%) - Are contract change capabilities described?
11. **Oracle Documentation** (8%) - Is the protocol's use of oracles sufficiently documented?

## How It Works

1. **Documentation Indexing**: The agent first indexes the protocol's documentation from provided URLs
2. **Question Processing**: For each DeFiSafety criterion, the agent queries the indexed documentation
3. **Scoring**: Each question is scored based on the quality and completeness of information found
4. **Report Generation**: A comprehensive report is generated with:
   - Overall score (0-100%)
   - Category rating (Excellent/Good/Fair/Poor/Failing)
   - Detailed breakdown by question
   - Citations from documentation
   - Summary of strengths and weaknesses

## Usage

### Prerequisites

- Node.js 18+
- OpenRouter API key

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Configure environment variables:
```bash
cp env.example .env
# Edit .env with your API keys
```

3. Build the agent:
```bash
pnpm build
```

4. Start the agent:
```bash
pnpm start
```

### Example Commands

Once the agent is running, you can interact with it through the VibeKit interface:

1. **Score a protocol with documentation URL**:
   ```
   "Score the Uniswap protocol using their documentation at https://docs.uniswap.org"
   ```

2. **Score a protocol (will prompt for documentation)**:
   ```
   "Generate a DeFi Safety report for Aave"
   ```

3. **View indexed documentation**:
   ```
   "List all indexed documentation"
   ```

4. **Clear index before scoring another protocol**:
   ```
"Clear the documentation index"
```

## Scoring Interpretation

- **90-100%**: Excellent - Very high transparency and security practices
- **70-89%**: Good - Solid documentation and practices with minor gaps
- **50-69%**: Fair - Some important documentation missing or practices lacking
- **30-49%**: Poor - Major gaps in transparency and security practices
- **0-29%**: Failing - Critical lack of documentation and transparency

## Development

### Running in Development Mode

```bash
pnpm dev
```

### Testing

```bash
pnpm test
```

### Project Structure

```
defisafety-agent/
├── src/
│   ├── index.ts              # Main agent entry point
│   ├── skills/
│   │   └── defiSafetyScoring.ts  # DeFi Safety scoring skill
│   └── tools/
│       ├── scoreProtocol.ts      # Protocol scoring logic
│       ├── indexDocumentation.ts # Documentation indexing
│       └── queryDocumentation.ts # Documentation querying
├── Defisafety-instructions/   # DeFiSafety criteria definitions
│   ├── Q1-Contract-Addresses.txt
│   ├── Q2-Public-Repository.txt
│   └── ... (other questions)
└── Scoring-Rubric.txt        # Scoring weights and interpretation
```

## Integration with VibeKit

This agent is designed to work within the VibeKit ecosystem. It can be accessed through:

- **Web Interface**: http://localhost:3000 (when VibeKit is running)
- **Direct API**: http://localhost:3008
- **MCP SSE**: http://localhost:3008/sse

## Notes

- The agent uses RAG (Retrieval Augmented Generation) to analyze documentation
- Scores are based on the presence and quality of information in the documentation
- For best results, ensure the protocol's documentation is comprehensive and well-structured
- The agent can process multiple pages of documentation (recommended: 50-100 for full analysis)

## License

MIT
