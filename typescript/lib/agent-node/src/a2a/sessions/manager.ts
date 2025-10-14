import { EventEmitter } from 'events';

import { v7 as uuidv7 } from 'uuid';

import type { ModelMessage } from 'ai';

import type { Session, SessionState } from './types.js';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private persistedSessions: Map<string, Session> = new Map();

  constructor() {
    super();
  }

  /**
   * Creates a new session or reattaches to an existing one per A2A spec
   * - If no contextId provided: generates server-side contextId (new session)
   * - If contextId provided and exists: returns existing session (reattachment)
   * - If contextId provided but doesn't exist: throws error (proper API design)
   */
  createSession(contextId?: string): Session {
    // Check if this is a reattachment attempt
    if (contextId) {
      if (this.sessions.has(contextId)) {
        // Reattach to existing session
        const existing = this.sessions.get(contextId)!;
        existing.lastActivity = new Date();
        return existing;
      } else {
        // Reject non-existent contextId per better API design
        const error = new Error('Session not found') as Error & {
          code: number;
          data: { contextId: string; hint: string };
        };
        error.code = -32602;
        error.data = {
          contextId,
          hint: 'Omit contextId to create new session, or provide valid existing contextId to reattach',
        };
        throw error;
      }
    }

    // For new sessions, use server-generated ID per A2A spec
    const id = this.generateContextId();

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
    this.emit('sessionCreated', { contextId: id, session });
    return session;
  }

  /**
   * Gets a session by contextId
   */
  getSession(contextId: string): Session | null {
    return this.sessions.get(contextId) || null;
  }

  /**
   * Lists all active sessions
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Updates session state
   */
  updateSessionState(contextId: string, updates: Partial<SessionState>): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    // Merge updates into state
    if (updates.metadata) {
      session.state.metadata = {
        ...session.state.metadata,
        ...updates.metadata,
      };
    }

    if (updates.tasks) {
      session.state.tasks = updates.tasks;
    }

    if (updates.conversationHistory) {
      session.state.conversationHistory = updates.conversationHistory;
    }

    // Update activity
    session.lastActivity = new Date();

    // Emit update event
    this.emit('sessionUpdated', { contextId, changes: updates });
  }

  /**
   * Adds a message to conversation history
   */
  addToHistory(contextId: string, message: ModelMessage): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    session.state.conversationHistory.push(message);
    session.lastActivity = new Date();
  }

  /**
   * Adds a task to the session
   */
  addTask(contextId: string, taskId: string): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    if (!session.state.tasks.includes(taskId)) {
      session.state.tasks.push(taskId);
    }
    session.lastActivity = new Date();
  }

  /**
   * Gets tasks for a session
   */
  getTasks(contextId: string): string[] {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }
    return session.state.tasks;
  }

  /**
   * Gets metadata for a session
   */
  getMetadata(contextId: string): Record<string, unknown> {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }
    return session.state.metadata;
  }

  /**
   * Gets conversation history for a session
   */
  getHistory(contextId: string): ModelMessage[] {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }
    return session.state.conversationHistory;
  }

  /**
   * Checks if a session is active
   */
  isSessionActive(contextId: string): boolean {
    const session = this.sessions.get(contextId);
    if (!session) {
      return false;
    }
    // Consider a session active if it had activity in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return session.lastActivity > thirtyMinutesAgo;
  }

  /**
   * Updates the last activity timestamp
   */
  updateActivity(contextId: string): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    session.lastActivity = new Date();
  }

  /**
   * Sets the last activity timestamp (for testing)
   */
  setLastActivity(contextId: string, timestamp: Date): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    session.lastActivity = timestamp;
  }

  /**
   * Saves a session to persistent storage
   */
  saveSession(contextId: string): void {
    const session = this.sessions.get(contextId);
    if (!session) {
      throw new Error(`Session ${contextId} not found`);
    }

    // Deep clone the session for persistence
    this.persistedSessions.set(contextId, JSON.parse(JSON.stringify(session)) as Session);
  }

  /**
   * Loads a session from persistent storage
   */
  loadSession(contextId: string): Session | null {
    const persisted = this.persistedSessions.get(contextId);
    if (!persisted) {
      return null;
    }

    // Restore date objects
    const session: Session = {
      ...persisted,
      createdAt: new Date(persisted.createdAt),
      lastActivity: new Date(persisted.lastActivity),
      state: {
        ...persisted.state,
        // CoreMessage doesn't need date restoration - it's already in correct format
        conversationHistory: persisted.state.conversationHistory,
      },
    };

    // Add to active sessions
    this.sessions.set(contextId, session);
    return session;
  }

  /**
   * Cleans up inactive sessions
   */
  cleanupInactiveSessions(maxInactivityMinutes: number): void {
    const cutoffTime = Date.now() - maxInactivityMinutes * 60 * 1000;

    for (const [contextId, session] of this.sessions.entries()) {
      if (session.lastActivity.getTime() < cutoffTime) {
        this.sessions.delete(contextId);
      }
    }
  }

  /**
   * Deletes a session
   */
  deleteSession(contextId: string): void {
    this.sessions.delete(contextId);
    this.persistedSessions.delete(contextId);
    this.emit('sessionDeleted', { contextId });
  }

  /**
   * Generates a unique context ID
   */
  /**
   * Gets or creates a session
   * This is a convenience method that explicitly handles the A2A session pattern
   */
  getOrCreateSession(contextId?: string): Session {
    // If contextId provided, try to get existing
    if (contextId) {
      const existing = this.getSession(contextId);
      if (existing) {
        existing.lastActivity = new Date();
        return existing;
      } else {
        // Reject non-existent contextId per better API design
        const error = new Error('Session not found') as Error & {
          code: number;
          data: { contextId: string; hint: string };
        };
        error.code = -32602;
        error.data = {
          contextId,
          hint: 'Omit contextId to create new session, or provide valid existing contextId to reattach',
        };
        throw error;
      }
    }

    // Create new session with server-generated ID
    return this.createSession();
  }

  private generateContextId(): string {
    return `ctx-${uuidv7()}`;
  }
}
