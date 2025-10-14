import type { TaskStatusUpdateEvent, TaskState, Artifact } from '@a2a-js/sdk';
import type { z } from 'zod';

export interface WorkflowContext {
  contextId: string;
  taskId: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// A2A-aligned status type for yields
export type WorkflowStatus = TaskStatusUpdateEvent['status'];

// Yield value shapes produced by workflow generators
export type WorkflowState =
  | {
      type: 'status';
      status: WorkflowStatus;
    }
  | {
      type: 'progress';
      current: number;
      total: number;
    }
  | {
      type: 'artifact';
      artifact: Artifact;
    }
  | {
      type: 'pause';
      status: Omit<WorkflowStatus, 'state'> & {
        state: 'input-required' | 'auth-required';
      };
      inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
      correlationId?: string;
    }
  | { type: 'error'; error: Error };

export interface WorkflowPlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  // Zod object schema for input validation
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  execute: (context: WorkflowContext) => AsyncGenerator<WorkflowState, unknown, unknown>;
}

export interface WorkflowExecution {
  id: string;
  pluginId: string;
  state: TaskState;
  context: WorkflowContext;
  result?: unknown;
  error?: Error;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  waitForCompletion: () => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => WorkflowExecution;
  getArtifacts: () => unknown[];
  getError: () => Error | undefined;
  getPauseInfo: () => PauseInfo | undefined;
  resume: (input: unknown) => Promise<ResumeResult>;
}

export interface PauseInfo {
  state: string;
  message?: string;
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  correlationId?: string;
  validationErrors?: unknown[];
}

export interface ResumeResult {
  valid: boolean;
  errors?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactEvent {
  name: string;
  mimeType?: string;
  data: unknown;
}

export interface UpdateEvent {
  type: 'status' | 'progress';
  status?: unknown;
  current?: number;
  total?: number;
}

export interface WorkflowTool {
  execute: (params: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: Error;
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
}
