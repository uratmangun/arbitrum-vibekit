import type { ModelMessage } from 'ai';

import type { SessionManager } from '../../../src/a2a/sessions/manager.js';
import type { Session } from '../../../src/a2a/sessions/types.js';

/**
 * Mock SessionManager for testing
 */
export class MockSessionManager implements Partial<SessionManager> {
  private sessions = new Map<string, Session>();
  private histories = new Map<string, ModelMessage[]>();

  createSessionWithId(contextId: string): Session {
    if (!this.sessions.has(contextId)) {
      const session: Session = {
        contextId,
        createdAt: new Date(),
        lastActivity: new Date(),
        state: {
          tasks: [],
          metadata: {},
          conversationHistory: [],
        },
      };
      this.sessions.set(contextId, session);
      this.histories.set(contextId, []);
    }
    return this.sessions.get(contextId)!;
  }

  getOrCreateSession(contextId?: string): Session {
    const id = contextId || `ctx-${Date.now()}`;
    return this.createSessionWithId(id);
  }

  getSession(contextId: string): Session | null {
    return this.sessions.get(contextId) || null;
  }

  // Provide createSession to align with real interface
  createSession(contextId?: string): Session {
    const id = contextId || `ctx-${Date.now()}`;
    return this.createSessionWithId(id);
  }

  addToHistory(contextId: string, message: ModelMessage): void {
    const history = this.histories.get(contextId) || [];
    history.push(message);
    this.histories.set(contextId, history);

    // Also update session state
    const session = this.sessions.get(contextId);
    if (session) {
      session.state.conversationHistory = history;
    }
  }

  getHistory(contextId: string): ModelMessage[] {
    return this.histories.get(contextId) || [];
  }

  // Align with real interface: update session state
  updateSessionState(contextId: string, updates: Partial<Session['state']>): void {
    const session = this.sessions.get(contextId) || this.createSessionWithId(contextId);
    if (updates.tasks) {
      session.state.tasks = [...updates.tasks];
    }
    if (updates.metadata) {
      session.state.metadata = { ...session.state.metadata, ...updates.metadata };
    }
    if (updates.conversationHistory) {
      session.state.conversationHistory = [...updates.conversationHistory];
      this.histories.set(contextId, [...updates.conversationHistory]);
    }
    session.lastActivity = new Date();
    this.sessions.set(contextId, session);
  }

  // Align with real interface: add a task to the session
  addTask(contextId: string, taskId: string): void {
    const session = this.sessions.get(contextId) || this.createSessionWithId(contextId);
    if (!session.state.tasks.includes(taskId)) {
      session.state.tasks.push(taskId);
    }
    session.lastActivity = new Date();
    this.sessions.set(contextId, session);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getMetadata(contextId: string): Record<string, unknown> {
    const session = this.sessions.get(contextId);
    return session ? session.state.metadata : {};
  }

  isSessionActive(contextId: string): boolean {
    return this.sessions.has(contextId);
  }

  updateActivity(contextId: string): void {
    const session = this.sessions.get(contextId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  setLastActivity(contextId: string, timestamp: Date): void {
    const session = this.sessions.get(contextId);
    if (session) {
      session.lastActivity = timestamp;
    }
  }

  saveSession(_contextId: string): void {
    // No-op for mock
  }

  loadSession(contextId: string): Session | null {
    return this.getSession(contextId);
  }

  deleteSession(contextId: string): void {
    this.sessions.delete(contextId);
    this.histories.delete(contextId);
  }

  on(): this {
    return this;
  }

  emit(): boolean {
    return true;
  }

  getTasks(contextId: string): string[] {
    const session = this.sessions.get(contextId);
    if (!session) {
      return [];
    }
    return session.state.tasks;
  }

  // Helper for tests to inspect state
  getAllSessions(): Map<string, Session> {
    return this.sessions;
  }

  reset(): void {
    this.sessions.clear();
    this.histories.clear();
  }
}
