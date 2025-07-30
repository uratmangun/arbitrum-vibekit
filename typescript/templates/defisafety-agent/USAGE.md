# DeFi Safety Agent Usage Guide

## Quick Start

### 1. Setup Environment

```bash
# Copy and configure environment
cp env.example .env

# Required environment variables:
# OPENROUTER_API_KEY - For LLM analysis
# OPENAI_API_KEY - Optional, for better embeddings
```

### 2. Build and Start

```bash
# Install dependencies
pnpm install

# Build the agent
pnpm build

# Start the agent
pnpm start
```

The agent will be available at:
- Direct API: http://localhost:3008
- VibeKit UI: http://localhost:3000 (when VibeKit is running)

## Using the Agent

### Through VibeKit Chat Interface

1. Connect to VibeKit UI at http://localhost:3000
2. Select the DeFi Safety Agent
3. Use natural language commands

### Example Commands

#### Score a Protocol with Documentation URL

```
"Score the Uniswap protocol using their documentation at https://docs.uniswap.org with 50 pages"
```

This will:
1. Scrape 50 pages from the Uniswap docs
2. Index the content for searching
3. Analyze against all 11 DeFiSafety criteria
4. Generate a comprehensive report

#### Score a Protocol (Manual Process)

```
"I want to score the Aave protocol"
```

The agent will guide you through:
1. First indexing their documentation
2. Then running the scoring analysis

#### Check Indexed Documentation

```
"Show me what documentation is currently indexed"
```

#### Clear Index Before New Protocol

```
"Clear the documentation index"
```

Always clear the index before scoring a new protocol to avoid mixed results.

## Understanding the Scoring Process

### 1. Documentation Indexing Phase

- Agent scrapes the provided documentation URL
- Recommended: 50-100 pages for comprehensive analysis
- Content is indexed for semantic search

### 2. Question Analysis Phase

For each of the 11 DeFiSafety criteria:
- Relevant documentation chunks are retrieved
- LLM analyzes the content against scoring criteria
- Score (0-100%) is assigned with justification
- Citations are provided from the documentation

### 3. Report Generation Phase

- Individual scores are weighted according to importance
- Overall score is calculated (0-100%)
- Category assigned (Excellent/Good/Fair/Poor/Failing)
- Executive summary generated
- Detailed breakdown provided

## Scoring Criteria Overview

| Question | Weight | Focus Area |
|----------|--------|------------|
| Q1 | 15% | Contract addresses visibility |
| Q2 | 3% | Public source code repository |
| Q3 | 8% | Whitepaper/documentation |
| Q4 | 8% | Architecture documentation |
| Q5 | 15% | Testing thoroughness |
| Q6 | 15% | Bug bounty program |
| Q7 | 7% | Admin controls documentation |
| Q8 | 7% | Upgradeability labeling |
| Q9 | 7% | Contract ownership type |
| Q10 | 7% | Change capabilities |
| Q11 | 8% | Oracle documentation |

## Interpreting Results

### Score Categories

- **90-100% (Excellent)**: Exceptional transparency and security practices
- **70-89% (Good)**: Solid documentation with minor gaps
- **50-69% (Fair)**: Some important areas need improvement
- **30-49% (Poor)**: Major transparency issues
- **0-29% (Failing)**: Critical lack of documentation

### Report Sections

1. **Executive Summary**
   - Overall score and category
   - Key strengths
   - Areas for improvement

2. **Detailed Breakdown**
   - Score for each question
   - Justification for the score
   - Evidence/citations from docs
   - Weighted contribution

3. **Methodology**
   - Explanation of scoring system
   - Category definitions

## Best Practices

### For Accurate Scoring

1. **Use Official Documentation**
   - Always use the protocol's official docs site
   - Avoid third-party or outdated sources

2. **Sufficient Page Count**
   - Minimum: 20-30 pages for basic protocols
   - Recommended: 50-100 pages for comprehensive analysis
   - Large protocols: 100+ pages

3. **Clear Index Between Protocols**
   - Always clear before scoring a new protocol
   - Prevents contamination of results

### For Comparing Protocols

1. **Use Same Page Counts**
   - Ensures fair comparison
   - Example: Always use 50 pages

2. **Score at Same Time**
   - Criteria interpretation remains consistent
   - LLM behavior is more predictable

3. **Document Context**
   - Note protocol version (V2, V3, etc.)
   - Record date of scoring
   - Save reports for future reference

## Advanced Usage

### Batch Scoring

```bash
# Score multiple protocols sequentially
for url in "https://docs.aave.com" "https://docs.compound.finance" "https://docs.uniswap.org"; do
  echo "Scoring $url..."
  # Send request to agent
  # Save report
  # Clear index
done
```

### Custom Page Limits

```
"Score MakerDAO with 150 pages from https://docs.makerdao.com"
```

### Specific Documentation Sections

```
"Index only the security section from https://docs.protocol.com/security"
```

## Troubleshooting

### Common Issues

1. **"No documentation found"**
   - Check if URL is accessible
   - Verify it's not behind authentication
   - Try increasing page count

2. **Low scores across all criteria**
   - Documentation might be poorly structured
   - Try different starting URL
   - Increase page count

3. **Timeout errors**
   - Reduce page count
   - Check network connectivity
   - Ensure stable API keys

### Debug Mode

For detailed logging:
```bash
DEBUG=* pnpm start
```

## Integration Examples

### Programmatic Usage

```typescript
// Example: Score a protocol programmatically
const response = await fetch('http://localhost:3008/sse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instruction: 'Score Uniswap using https://docs.uniswap.org with 50 pages'
  })
});
```

### Webhook Integration

```javascript
// Notify when scoring complete
const report = await scoreProtocol('Aave');
if (report.overallScore < 70) {
  await notifyTeam('Protocol scored below threshold', report);
}
```

## Report Storage

Reports can be saved for historical tracking:

```bash
# Create reports directory
mkdir -p reports/$(date +%Y-%m)

# Save report with timestamp
cp sample-aave-report.txt reports/$(date +%Y-%m)/aave-$(date +%Y%m%d).txt
```