export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface Task {
  id: string;
  contextId: string;
  state: TaskState;
  metadata?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  result?: unknown;
  error?: {
    message: string;
    code?: string;
  };
  pauseInfo?: {
    inputSpec?: Record<string, unknown>;
    message?: string;
    action?: string;
  };
}

export interface TaskHistoryEntry {
  state: TaskState;
  timestamp: string;
  details?: Record<string, unknown>;
}
