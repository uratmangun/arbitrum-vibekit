import type { ModelMessage } from 'ai';

import type { SessionManager } from '../../../src/a2a/sessions/manager.js';
import type { Session } from '../../../src/a2a/sessions/types.js';

/**
 * Mock SessionManager for testing
 */
export class MockSessionManager implements Partial<SessionManager> {
  private sessions = new Map<string, Session>();
  private histories = new Map<string, ModelMessage[]>();

  getOrCreateSession(contextId?: string): Session {
    const id = contextId || `ctx-${Date.now()}`;
    if (!this.sessions.has(id)) {
      const session: Session = {
        contextId: id,
        createdAt: new Date(),
        lastActivity: new Date(),
        state: {
          tasks: [],
          metadata: {},
          conversationHistory: [],
        },
      };
      this.sessions.set(id, session);
      this.histories.set(id, []);
    }
    return this.sessions.get(id)!;
  }

  getSession(contextId: string): Session | null {
    return this.sessions.get(contextId) || null;
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

  // Helper for tests to inspect state
  getAllSessions(): Map<string, Session> {
    return this.sessions;
  }

  reset(): void {
    this.sessions.clear();
    this.histories.clear();
  }
}
