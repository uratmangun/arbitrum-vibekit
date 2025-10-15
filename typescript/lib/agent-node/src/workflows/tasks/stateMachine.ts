import type { TaskState } from '@a2a-js/sdk';

export const validTransitions: Record<TaskState, readonly TaskState[]> = {
  submitted: ['working', 'failed', 'canceled', 'rejected'],
  working: ['input-required', 'auth-required', 'completed', 'failed', 'canceled'],
  'input-required': ['working', 'canceled'],
  'auth-required': ['working', 'canceled'],
  completed: [],
  failed: [],
  canceled: [],
  rejected: [],
  unknown: [],
} as const;

export function canTransition(from: TaskState, to: TaskState): boolean {
  return validTransitions[from].includes(to);
}

export function ensureTransition(taskId: string, from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    const message = `Invalid task transition ${from} -> ${to} for ${taskId}`;
    throw new Error(message);
  }
}
