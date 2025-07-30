import { createSuccessTask, createErrorTask, createArtifact } from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ScoreProtocolSchema = z.object({
  protocolName: z.string().min(1).describe('Name of the protocol to score'),
  documentationUrl: z.string().url().optional().describe('URL of the protocol documentation'),
  pagesToScrape: z.number().int().positive().default(50).describe('Number of pages to scrape'),
});

// Question weights as percentages
const QUESTION_WEIGHTS = {
  Q1: 15, // Contract addresses
  Q2: 3, // Public repository
  Q3: 8, // Whitepaper
  Q4: 8, // Architecture
  Q5: 15, // Testing
  Q6: 15, // Bug bounty
  Q7: 7, // Admin controls findability
  Q8: 7, // Upgradeability labeling
  Q9: 7, // Ownership type
  Q10: 7, // Change capabilities
  Q11: 8, // Oracle documentation
};

interface QuestionResult {
  question: string;
  score: number;
  justification: string;
  citations: string[];
}

interface ScoringReport {
  protocolName: string;
  documentationUrl?: string;
  overallScore: number;
  category: string;
  questionResults: QuestionResult[];
  summary: string;
  generatedAt: string;
}

export const scoreProtocolEnhancedTool: VibkitToolDefinition<typeof ScoreProtocolSchema> = {
  name: 'score-protocol-enhanced',
  description: 'Score a DeFi protocol based on DeFiSafety criteria with enhanced LLM analysis',
  parameters: ScoreProtocolSchema,
  execute: async (input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = '/app/lib/mcp-tools/doc-rag-mcp-server/dist/index.js';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
      }

      // Step 1: Index the documentation if URL provided
      if (input.documentationUrl) {
        const indexResult = await context.mcpClients[mcpClientKey].callTool({
          name: 'index_documentation',
          arguments: {
            url: input.documentationUrl,
            maxPages: input.pagesToScrape,
          },
        });

        // Wait for indexing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Load question templates
      const questionsDir = path.join(__dirname, '../../Defisafety-instructions');
      const questions: { [key: string]: string } = {};
      
      // Read all question files
      for (let i = 1; i <= 11; i++) {
        const questionFile = await fs.readFile(
          path.join(questionsDir, `Q${i}-${getQuestionFileName(i)}.txt`),
          'utf-8'
        );
        questions[`Q${i}`] = questionFile;
      }

      // Process each question with LLM analysis
      const questionResults: QuestionResult[] = [];
      let totalWeightedScore = 0;

      for (const [questionId, questionContent] of Object.entries(questions)) {
        const weight = QUESTION_WEIGHTS[questionId as keyof typeof QUESTION_WEIGHTS];
        
        // Extract the main question from the content
        const questionTitle = questionContent.split('\n')[0] || '';
        
        // Query documentation for this specific question
        const queryResult = await context.mcpClients[mcpClientKey].callTool({
          name: 'query_documentation',
          arguments: {
            query: `${input.protocolName} ${questionTitle}`,
            topK: 10,
          },
        });

        // Parse query results
        const responseText = (queryResult as any).content[0].text;
        let relevantChunks = [];
        
        try {
          const response = JSON.parse(responseText);
          relevantChunks = response.results || [];
        } catch (e) {
          // If no relevant documentation found, chunks will be empty
        }

        // For now, use heuristic analysis as LLM integration requires different approach in Vibekit
        // TODO: Integrate with Vibekit's LLM orchestration system
        const analysisResult = await analyzeQuestionHeuristic(
          questionId,
          questionContent,
          relevantChunks,
          input.protocolName
        );

        questionResults.push({
          question: questionTitle,
          score: analysisResult.score,
          justification: analysisResult.justification,
          citations: analysisResult.citations,
        });

        totalWeightedScore += (analysisResult.score * weight) / 100;
      }

      // Generate category and summary
      const category = getScoreCategory(totalWeightedScore);
      const summary = generateSummary(input.protocolName, totalWeightedScore, questionResults);

      const report: ScoringReport = {
        protocolName: input.protocolName,
        documentationUrl: input.documentationUrl,
        overallScore: Math.round(totalWeightedScore * 10) / 10,
        category,
        questionResults,
        summary,
        generatedAt: new Date().toISOString(),
      };

      // Create artifacts for the report
      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(report, null, 2) }],
          'DeFi Safety Scoring Report (JSON)',
          `${input.protocolName} scored ${report.overallScore}% (${category})`
        ),
        createArtifact(
          [{ kind: 'text', text: formatReadableReport(report) }],
          'DeFi Safety Scoring Report',
          'Human-readable scoring report with detailed analysis'
        ),
      ];

      return createSuccessTask(
        'score-protocol-enhanced',
        artifacts,
        `Successfully scored ${input.protocolName}: ${report.overallScore}% (${category})\n\n${summary}`
      );
    } catch (error) {
      return createErrorTask(
        'score-protocol-enhanced',
        error instanceof Error ? error : new Error('Failed to score protocol')
      );
    }
  },
};

function getQuestionFileName(questionNumber: number): string {
  const fileNames = [
    'Contract-Addresses',
    'Public-Repository',
    'Whitepaper',
    'Architecture',
    'Testing',
    'Bug-Bounty',
    'Admin-Controls',
    'Upgradeability',
    'Contract-Ownership',
    'Change-Capabilities',
    'Oracle-Documentation',
  ];
  return fileNames[questionNumber - 1] || 'Unknown';
}

// Fallback heuristic analysis if LLM is not available
async function analyzeQuestionHeuristic(
  questionId: string,
  questionContent: string,
  documentChunks: any[],
  protocolName: string
): Promise<{ score: number; justification: string; citations: string[] }> {
  if (documentChunks.length === 0) {
    return {
      score: 0,
      justification: `No documentation found addressing this question for ${protocolName}.`,
      citations: [],
    };
  }

  // Basic scoring based on presence of relevant keywords
  const keywords = {
    Q1: ['contract', 'address', 'deployed', '0x'],
    Q2: ['github', 'repository', 'source code', 'open source'],
    Q3: ['whitepaper', 'documentation', 'litepaper'],
    Q4: ['architecture', 'design', 'diagram', 'system'],
    Q5: ['test', 'testing', 'coverage', 'unit test'],
    Q6: ['bug bounty', 'bounty', 'reward', 'vulnerability'],
    Q7: ['admin', 'governance', 'control', 'ownership'],
    Q8: ['upgradeable', 'immutable', 'proxy', 'upgrade'],
    Q9: ['multisig', 'dao', 'owner', 'governance'],
    Q10: ['change', 'parameter', 'modify', 'adjust'],
    Q11: ['oracle', 'price feed', 'chainlink', 'data feed'],
  };

  const relevantKeywords = keywords[questionId as keyof typeof keywords] || [];
  let matchCount = 0;
  const citations: string[] = [];

  for (const chunk of documentChunks) {
    const content = chunk.content?.toLowerCase() || '';
    const hasRelevantInfo = relevantKeywords.some(keyword => content.includes(keyword));
    
    if (hasRelevantInfo) {
      matchCount++;
      if (citations.length < 3) {
        citations.push(`[${chunk.url || 'Documentation'}] ${chunk.content?.substring(0, 150)}...`);
      }
    }
  }

  let score = 0;
  let justification = '';

  if (matchCount >= 3) {
    score = 70;
    justification = `Found ${matchCount} documentation sections with relevant information about this topic.`;
  } else if (matchCount > 0) {
    score = 40;
    justification = `Found ${matchCount} documentation section(s) with some relevant information, but coverage appears limited.`;
  } else {
    score = 20;
    justification = `Documentation was found but does not clearly address this specific requirement.`;
  }

  return { score, justification, citations };
}

function getScoreCategory(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Failing';
}

function generateSummary(protocolName: string, score: number, results: QuestionResult[]): string {
  const strongPoints = results.filter(r => r.score >= 80);
  const weakPoints = results.filter(r => r.score < 50);
  
  let summary = `${protocolName} achieved an overall DeFi Safety score of ${Math.round(score * 10) / 10}%. `;
  
  if (strongPoints.length > 0) {
    summary += `\n\nStrengths:\n`;
    strongPoints.forEach(r => {
      summary += `• ${r.question.split(':')[0]} (${r.score}%)\n`;
    });
  }
  
  if (weakPoints.length > 0) {
    summary += `\n\nAreas for Improvement:\n`;
    weakPoints.forEach(r => {
      summary += `• ${r.question.split(':')[0]} (${r.score}%)\n`;
    });
  }
  
  summary += `\n\nThis score indicates that ${protocolName} is in the "${getScoreCategory(score)}" category for DeFi safety practices.`;
  
  return summary;
}

function formatReadableReport(report: ScoringReport): string {
  let output = `╔═══════════════════════════════════════════════════════════════╗\n`;
  output += `║                  DeFi Safety Scoring Report                   ║\n`;
  output += `╚═══════════════════════════════════════════════════════════════╝\n\n`;
  
  output += `Protocol: ${report.protocolName}\n`;
  if (report.documentationUrl) {
    output += `Documentation: ${report.documentationUrl}\n`;
  }
  output += `Overall Score: ${report.overallScore}% (${report.category})\n`;
  output += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n`;
  output += `\n${'═'.repeat(65)}\n\n`;
  
  output += `EXECUTIVE SUMMARY\n`;
  output += `${'─'.repeat(65)}\n`;
  output += `${report.summary}\n`;
  output += `\n${'═'.repeat(65)}\n\n`;
  
  output += `DETAILED SCORING BREAKDOWN\n`;
  output += `${'─'.repeat(65)}\n\n`;
  
  for (const [idx, result] of report.questionResults.entries()) {
    const weight = QUESTION_WEIGHTS[`Q${idx + 1}` as keyof typeof QUESTION_WEIGHTS];
    output += `${idx + 1}. ${result.question}\n`;
    output += `   Weight: ${weight}%\n`;
    output += `   Score: ${result.score}%\n`;
    output += `   Weighted Contribution: ${((result.score * weight) / 100).toFixed(1)} points\n\n`;
    output += `   Analysis: ${result.justification}\n\n`;
    
    if (result.citations.length > 0) {
      output += `   Evidence:\n`;
      result.citations.forEach(citation => {
        output += `   • ${citation}\n`;
      });
      output += `\n`;
    }
    
    if (idx < report.questionResults.length - 1) {
      output += `${'─'.repeat(65)}\n\n`;
    }
  }
  
  output += `\n${'═'.repeat(65)}\n\n`;
  output += `SCORING METHODOLOGY\n`;
  output += `${'─'.repeat(65)}\n`;
  output += `This report follows DeFiSafety's Process Quality Review methodology,\n`;
  output += `evaluating ${report.questionResults.length} key criteria across documentation transparency,\n`;
  output += `testing practices, security measures, and administrative controls.\n\n`;
  output += `Score Categories:\n`;
  output += `• Excellent (90-100%): Very high transparency and security practices\n`;
  output += `• Good (70-89%): Solid documentation with minor gaps\n`;
  output += `• Fair (50-69%): Some important documentation missing\n`;
  output += `• Poor (30-49%): Major gaps in transparency\n`;
  output += `• Failing (0-29%): Critical lack of documentation\n`;
  
  return output;
}