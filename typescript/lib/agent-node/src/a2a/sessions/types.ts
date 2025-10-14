import type { ModelMessage } from 'ai';

export interface SessionContext {
  contextId: string;
}

export interface SessionState {
  tasks: string[];
  metadata: Record<string, unknown>;
  conversationHistory: ModelMessage[];
}

export interface Session {
  contextId: string;
  createdAt: Date;
  lastActivity: Date;
  state: SessionState;
}

export interface SessionManager {
  createSession(contextId?: string): Session;
  getSession(contextId: string): Session | null;
  listSessions(): Session[];
  updateSessionState(contextId: string, updates: Partial<SessionState>): void;
  addToHistory(contextId: string, message: ModelMessage): void;
  addTask(contextId: string, taskId: string): void;
  getTasks(contextId: string): string[];
  getMetadata(contextId: string): Record<string, unknown>;
  getHistory(contextId: string): ModelMessage[];
  isSessionActive(contextId: string): boolean;
  updateActivity(contextId: string): void;
  setLastActivity(contextId: string, timestamp: Date): void;
  saveSession(contextId: string): void;
  loadSession(contextId: string): Session | null;
  cleanupInactiveSessions(maxInactivityMinutes: number): void;
  deleteSession(contextId: string): void;
  getOrCreateSession(contextId?: string): Session;
  on(event: string, listener: (...args: unknown[]) => void): SessionManager;
  emit(event: string, data: unknown): boolean;
}

export interface TaskResponse {
  result?: {
    kind: 'task' | 'message';
    id?: string;
    contextId?: string;
    status?: {
      state: string;
      final?: boolean;
    };
    metadata?: Record<string, unknown>;
    parts?: unknown[];
    data?: unknown;
    tasks?: Task[];
    optimization?: {
      terminalTasksOptimized?: boolean;
      queryTime?: number;
    };
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  body?: {
    result?: TaskResponse['result'];
    error?: TaskResponse['error'];
  };
  status?: number;
}

export interface Task {
  id: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  status: {
    state: string;
    final: boolean;
  };
  metadata?: {
    initialState?: string;
    stateTransitions?: StateTransition[];
    persistedAcrossRestart?: boolean;
    modified?: boolean;
    newProperty?: string;
  };
}

export interface StateTransition {
  from?: string;
  to: string;
  timestamp: string;
  valid: boolean;
  reason?: string;
}
