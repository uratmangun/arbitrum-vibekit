/**
 * Context types for the Documentation RAG Agent
 */

export interface DocumentationStats {
  totalIndexedPages: number;
  totalEmbeddings: number;
  lastIndexedUrl?: string;
  lastIndexedAt?: Date;
  estimatedCost: number;
}

export interface QueryHistory {
  query: string;
  timestamp: Date;
  resultsCount: number;
}

export interface DocRagContext {
  stats: DocumentationStats;
  indexedUrls: string[];
  queryHistory: QueryHistory[];
  lastQueryResults?: any;
} 