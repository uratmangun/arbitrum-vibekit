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
  overallScore: number;
  category: string;
  questionResults: QuestionResult[];
  summary: string;
  generatedAt: string;
}

export const scoreProtocolTool: VibkitToolDefinition<typeof ScoreProtocolSchema> = {
  name: 'score-protocol',
  description: 'Score a DeFi protocol based on DeFiSafety criteria using indexed documentation',
  parameters: ScoreProtocolSchema,
  execute: async (input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = '/app/lib/mcp-tools/doc-rag-mcp-server/dist/index.js';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
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

      // Process each question
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
          // If no relevant documentation found, score will be 0
        }

        // Analyze the documentation chunks against the question criteria
        const { score, justification, citations } = await analyzeQuestion(
          questionId,
          questionContent,
          relevantChunks,
          input.protocolName
        );

        questionResults.push({
          question: questionTitle,
          score,
          justification,
          citations,
        });

        totalWeightedScore += (score * weight) / 100;
      }

      // Generate category and summary
      const category = getScoreCategory(totalWeightedScore);
      const summary = generateSummary(input.protocolName, totalWeightedScore, questionResults);

      const report: ScoringReport = {
        protocolName: input.protocolName,
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
          'DeFi Safety Scoring Report',
          `${input.protocolName} scored ${report.overallScore}% (${category})`
        ),
        createArtifact(
          [{ kind: 'text', text: formatReadableReport(report) }],
          'Readable Report',
          'Human-readable scoring report'
        ),
      ];

      return createSuccessTask(
        'score-protocol',
        artifacts,
        `Successfully scored ${input.protocolName}: ${report.overallScore}% (${category})`
      );
    } catch (error) {
      return createErrorTask(
        'score-protocol',
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

async function analyzeQuestion(
  questionId: string,
  questionContent: string,
  documentChunks: any[],
  protocolName: string
): Promise<{ score: number; justification: string; citations: string[] }> {
  // This is a simplified scoring logic
  // In a production system, you would use the LLM to analyze the chunks
  // against the specific scoring criteria in the question content
  
  if (documentChunks.length === 0) {
    return {
      score: 0,
      justification: `No documentation found addressing this question for ${protocolName}.`,
      citations: [],
    };
  }

  // Extract scoring criteria from question content
  const criteriaMatch = questionContent.match(/Scoring Criteria:([\s\S]*?)Answer Format:/m);
  const criteria = criteriaMatch && criteriaMatch[1] ? criteriaMatch[1].trim() : '';

  // Simple heuristic scoring based on presence of relevant information
  // This should be replaced with proper LLM analysis
  const relevantInfo = documentChunks.filter(chunk => 
    chunk.content && chunk.content.toLowerCase().includes(questionId.toLowerCase())
  );

  let score = 0;
  let justification = '';
  const citations = documentChunks.slice(0, 3).map(chunk => 
    `[${chunk.url || 'Unknown source'}] ${chunk.content?.substring(0, 100)}...`
  );

  // Basic scoring logic (to be enhanced with LLM)
  if (relevantInfo.length > 0) {
    score = 70; // Partial score for having some information
    justification = `Found ${relevantInfo.length} relevant documentation sections addressing this question.`;
  } else if (documentChunks.length > 0) {
    score = 30; // Low score for having related but not specific information
    justification = `Found ${documentChunks.length} potentially related documentation sections, but none directly address this question.`;
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
    summary += `Strong areas include: ${strongPoints.map(r => r.question.split(':')[0]).join(', ')}. `;
  }
  
  if (weakPoints.length > 0) {
    summary += `Areas needing improvement: ${weakPoints.map(r => r.question.split(':')[0]).join(', ')}. `;
  }
  
  return summary;
}

function formatReadableReport(report: ScoringReport): string {
  let output = `DeFi Safety Scoring Report\n`;
  output += `========================\n\n`;
  output += `Protocol: ${report.protocolName}\n`;
  output += `Overall Score: ${report.overallScore}% (${report.category})\n`;
  output += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n\n`;
  
  output += `Summary:\n${report.summary}\n\n`;
  
  output += `Detailed Results:\n`;
  output += `-----------------\n\n`;
  
  for (const result of report.questionResults) {
    output += `${result.question}\n`;
    output += `Score: ${result.score}%\n`;
    output += `Justification: ${result.justification}\n`;
    if (result.citations.length > 0) {
      output += `Citations:\n${result.citations.map(c => `  - ${c}`).join('\n')}\n`;
    }
    output += `\n`;
  }
  
  return output;
}