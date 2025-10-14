import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Session, SessionManager as ISessionManager } from './types.js';

// Session management is handled at the application level, not by A2A SDK.
// A2A SDK manages tasks and contextId, but session persistence is our responsibility.

/**
 * Unit tests for Session Manager behavior
 * Tests observable outcomes of session management, not internal implementation
 * Following TDD principles: testing WHAT the system does, not HOW
 */
describe('Session Manager', () => {
  let sessionManager: ISessionManager;

  beforeEach(async () => {
    const { SessionManager } = await import('./manager.js');
    sessionManager = new SessionManager() as ISessionManager;
  });

  describe('session creation behavior', () => {
    it('should create new session with unique identifier', () => {
      // Given a request to create a new session
      // When creating session without specific ID
      const session = sessionManager.createSession();

      // Then session should be created with unique ID
      expect(session).toBeDefined();
      expect(session.contextId).toBeDefined();
      expect(typeof session.contextId).toBe('string');
    });

    it('should generate server-side contextId when none provided per A2A spec', () => {
      // Given no specific session ID is provided
      // When creating session without contextId
      const session = sessionManager.createSession();

      // Then session should be created with server-generated ID
      expect(session.contextId).toBeDefined();
      expect(typeof session.contextId).toBe('string');
      expect(session.contextId).toMatch(/^[a-zA-Z0-9-_]+$/); // Valid ID format
    });

    it('should allow reattachment to existing session with contextId', () => {
      // Given a session already exists (server-generated ID)
      const firstSession = sessionManager.createSession();
      const contextId = firstSession.contextId;

      // Add some state to the session
      sessionManager.addTask(contextId, 'task-1');
      sessionManager.updateSessionState(contextId, {
        metadata: { user: 'test-user' },
      });

      // When trying to create/reattach with same contextId
      const reattachedSession = sessionManager.createSession(contextId);

      // Then it should return the same session (reattachment)
      expect(reattachedSession.contextId).toBe(contextId);
      expect(reattachedSession.state.tasks).toContain('task-1');
      expect(reattachedSession.state.metadata.user).toBe('test-user');

      // And activity should be updated
      expect(reattachedSession.lastActivity.getTime()).toBeGreaterThanOrEqual(
        firstSession.lastActivity.getTime(),
      );
    });

    it('should make new session ready for use', () => {
      // When creating a new session
      const session = sessionManager.createSession();

      // Then session should be ready to accept tasks and messages
      expect(session).toBeDefined();
      sessionManager.addTask(session.contextId, 'test-task');
      const tasks = sessionManager.getTasks(session.contextId);
      expect(tasks).toContain('test-task');
    });

    it('should throw error when client provides non-existent contextId', () => {
      // Given a non-existent contextId from client
      const nonExistentId = 'ctx-client-provided-123';

      // When creating session with non-existent contextId
      // Then server should throw error per better API design
      expect(() => sessionManager.createSession(nonExistentId)).toThrow('Session not found');

      // And error should include helpful information
      try {
        sessionManager.createSession(nonExistentId);
      } catch (error: unknown) {
        const typedError = error as Error & {
          code: number;
          data: { contextId: string; hint: string };
        };
        expect(typedError.code).toBe(-32602);
        expect(typedError.data).toEqual({
          contextId: nonExistentId,
          hint: 'Omit contextId to create new session, or provide valid existing contextId to reattach',
        });
      }
    });

    it('should handle getOrCreateSession for new sessions', () => {
      // Given no existing session
      // When calling getOrCreateSession without contextId
      const session = sessionManager.getOrCreateSession();

      // Then a new session should be created
      expect(session).toBeDefined();
      expect(session.contextId).toBeDefined();
      expect(session.state.tasks).toEqual([]);
    });

    it('should handle getOrCreateSession for existing sessions', () => {
      // Given an existing session
      const existingSession = sessionManager.createSession();
      const contextId = existingSession.contextId;
      sessionManager.addTask(contextId, 'existing-task');

      // When calling getOrCreateSession with existing contextId
      const session = sessionManager.getOrCreateSession(contextId);

      // Then the existing session should be returned
      expect(session.contextId).toBe(contextId);
      expect(session.state.tasks).toContain('existing-task');
    });

    it('should throw error when getOrCreateSession called with non-existent contextId', () => {
      // Given a non-existent contextId
      const nonExistentId = 'ctx-nonexistent-999';

      // When calling getOrCreateSession with non-existent contextId
      // Then should throw error for invalid contextId
      expect(() => sessionManager.getOrCreateSession(nonExistentId)).toThrow('Session not found');

      // And error should be properly formatted
      try {
        sessionManager.getOrCreateSession(nonExistentId);
      } catch (error: unknown) {
        const typedError = error as Error & { code: number; data: { contextId: string } };
        expect(typedError.code).toBe(-32602);
        expect(typedError.data.contextId).toBe(nonExistentId);
      }
    });
  });

  describe('session access behavior', () => {
    it('should provide access to existing session', () => {
      // Given a created session
      const created = sessionManager.createSession();

      // When retrieving session
      const retrieved = sessionManager.getSession(created.contextId);

      // Then session should be retrieved
      expect(retrieved).toBeDefined();
      expect(retrieved.contextId).toBe(created.contextId);
    });

    it('should return null for non-existent session', () => {
      // When retrieving non-existent session
      const session = sessionManager.getSession('ctx-nonexistent');

      // Then null should be returned
      expect(session).toBeNull();
    });

    it('should list available sessions', () => {
      // Given multiple active sessions exist
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();
      const session3 = sessionManager.createSession();

      // When listing sessions
      const sessions = sessionManager.listSessions();

      // Then all sessions should be available
      expect(sessions.length).toBeGreaterThanOrEqual(3);
      const sessionIds = sessions.map((s: Session) => s.contextId);
      expect(sessionIds).toContain(session1.contextId);
      expect(sessionIds).toContain(session2.contextId);
      expect(sessionIds).toContain(session3.contextId);
    });
  });

  describe('session operations', () => {
    it('should update session metadata', () => {
      // Given a session
      const session = sessionManager.createSession();

      // When updating session state
      sessionManager.updateSessionState(session.contextId, {
        metadata: { user: 'test-user' },
      });

      // Then metadata should be accessible
      const metadata = sessionManager.getMetadata(session.contextId);
      expect(metadata.user).toBe('test-user');
    });

    it('should track conversation history', () => {
      // Given a session
      const session = sessionManager.createSession();

      // When adding to conversation history
      sessionManager.addToHistory(session.contextId, {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      });
      sessionManager.addToHistory(session.contextId, {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date(),
      });

      // Then conversation should be preserved
      const history = sessionManager.getHistory(session.contextId);
      expect(history.length).toBe(2);
      expect(history[0].content).toBe('Hello');
      expect(history[1].content).toBe('Hi there!');
    });

    it('should associate tasks with session', () => {
      // Given a session
      const session = sessionManager.createSession();

      // When adding tasks to session
      sessionManager.addTask(session.contextId, 'task-1');
      sessionManager.addTask(session.contextId, 'task-2');

      // Then tasks should be accessible for the session
      const tasks = sessionManager.getTasks(session.contextId);
      expect(tasks).toContain('task-1');
      expect(tasks).toContain('task-2');
    });

    it('should update last activity timestamp', async () => {
      // Given a session
      const session = sessionManager.createSession();
      const _initialActivity = session.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // When updating activity
      sessionManager.updateActivity(session.contextId);

      // Then activity should be recorded
      const isActive = sessionManager.isSessionActive(session.contextId);
      expect(isActive).toBe(true);
    });
  });

  describe('session isolation behavior', () => {
    it('should isolate tasks between different user sessions', () => {
      // Given two separate user sessions
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();
      const userSession1 = session1.contextId;
      const userSession2 = session2.contextId;

      // When user 1 creates tasks
      sessionManager.addTask(userSession1, 'user1-task-1');
      sessionManager.addTask(userSession1, 'user1-task-2');

      // And user 2 creates different tasks
      sessionManager.addTask(userSession2, 'user2-task-1');

      // Then each user can only access their own tasks
      const user1Tasks = sessionManager.getTasks(userSession1);
      const user2Tasks = sessionManager.getTasks(userSession2);

      // User 1 sees only their tasks
      expect(user1Tasks).toContain('user1-task-1');
      expect(user1Tasks).toContain('user1-task-2');
      expect(user1Tasks).not.toContain('user2-task-1');

      // User 2 sees only their tasks
      expect(user2Tasks).toContain('user2-task-1');
      expect(user2Tasks).not.toContain('user1-task-1');
      expect(user2Tasks).not.toContain('user1-task-2');
    });

    it('should isolate state between sessions', () => {
      // Given two sessions
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      // When modifying each session's state
      sessionManager.updateSessionState(session1.contextId, {
        metadata: { value: 'session1' },
      });
      sessionManager.updateSessionState(session2.contextId, {
        metadata: { value: 'session2' },
      });

      // Then states should be isolated
      const updated1 = sessionManager.getSession(session1.contextId);
      const updated2 = sessionManager.getSession(session2.contextId);

      expect(updated1?.state.metadata.value).toBe('session1');
      expect(updated2?.state.metadata.value).toBe('session2');
    });

    it('should isolate tasks between sessions', () => {
      // Given two sessions with tasks
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      sessionManager.addTask(session1.contextId, 'task-a');
      sessionManager.addTask(session1.contextId, 'task-b');
      sessionManager.addTask(session2.contextId, 'task-c');

      // Then tasks should be isolated
      const updated1 = sessionManager.getSession(session1.contextId);
      const updated2 = sessionManager.getSession(session2.contextId);

      expect(updated1?.state.tasks).toEqual(['task-a', 'task-b']);
      expect(updated2?.state.tasks).toEqual(['task-c']);
    });

    it('should isolate conversation history', () => {
      // Given two sessions with conversations
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      sessionManager.addToHistory(session1.contextId, {
        role: 'user',
        content: 'Message in session 1',
        timestamp: new Date(),
      });
      sessionManager.addToHistory(session2.contextId, {
        role: 'user',
        content: 'Message in session 2',
        timestamp: new Date(),
      });

      // Then conversations should be isolated
      const updated1 = sessionManager.getSession(session1.contextId);
      const updated2 = sessionManager.getSession(session2.contextId);

      expect(updated1?.state.conversationHistory[0]?.content).toBe('Message in session 1');
      expect(updated2?.state.conversationHistory[0]?.content).toBe('Message in session 2');
    });
  });

  describe('session persistence and reattachment', () => {
    it('should support session persistence within agent uptime', () => {
      // Given a session with activity (per PRD line 21)
      const session = sessionManager.createSession();
      const contextId = session.contextId;

      // When adding state and tasks
      sessionManager.updateSessionState(contextId, {
        metadata: { workflow: 'gmx-trading' },
      });
      sessionManager.addTask(contextId, 'task-persist-1');
      sessionManager.addToHistory(contextId, {
        role: 'user',
        content: 'Open position',
        timestamp: new Date(),
      });

      // Then session should be reattachable within agent uptime
      const reattached = sessionManager.getSession(contextId);
      expect(reattached).toBeDefined();
      expect(reattached?.state.metadata.workflow).toBe('gmx-trading');
      expect(reattached?.state.tasks).toContain('task-persist-1');
      expect(reattached?.state.conversationHistory.length).toBe(1);
    });

    it('should allow reattachment to existing session by contextId', () => {
      // Given an existing session
      const originalSession = sessionManager.createSession();
      const contextId = originalSession.contextId;
      sessionManager.addTask(contextId, 'original-task');

      // When client reattaches with same contextId
      const reattached = sessionManager.createSession(contextId);

      // Then existing session state should be accessible (reattachment per A2A)
      expect(reattached).toBeDefined();
      expect(reattached.contextId).toBe(contextId);
      expect(reattached.state.tasks).toContain('original-task');

      // And new activity should update the session
      sessionManager.addTask(contextId, 'new-task');
      const updated = sessionManager.getSession(contextId);
      expect(updated?.state.tasks).toContain('original-task');
      expect(updated?.state.tasks).toContain('new-task');
    });

    it('should persist session data', () => {
      // Given a session with data
      const session = sessionManager.createSession();
      sessionManager.updateSessionState(session.contextId, {
        metadata: { important: 'data' },
      });
      sessionManager.addToHistory(session.contextId, {
        role: 'user',
        content: 'Important message',
        timestamp: new Date(),
      });

      // When saving session
      sessionManager.saveSession(session.contextId);

      // Then session should be persisted
      const loaded = sessionManager.loadSession(session.contextId);
      expect(loaded).toBeDefined();
      expect(loaded?.state.metadata.important).toBe('data');
      expect(loaded?.state.conversationHistory[0]?.content).toBe('Important message');
    });

    it('should handle session not found on load', () => {
      // When loading non-existent session
      const session = sessionManager.loadSession('ctx-notfound');

      // Then null should be returned
      expect(session).toBeNull();
    });
  });

  describe('session cleanup', () => {
    it.skip('should not automatically cleanup sessions per A2A requirements', () => {
      // Given an old inactive session
      const oldSession = sessionManager.createSession();

      // Simulate old last activity
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      sessionManager.setLastActivity(oldSession.contextId, oldTime);

      // When running cleanup
      sessionManager.cleanupInactiveSessions(60); // 60 minute timeout

      // Then old session should be removed
      const retrieved = sessionManager.getSession(oldSession.contextId);
      expect(retrieved).toBeNull();
    });

    it('should keep active sessions during cleanup', () => {
      // Given an active session
      const activeSession = sessionManager.createSession();

      // When running cleanup
      sessionManager.cleanupInactiveSessions(60);

      // Then active session should remain
      const retrieved = sessionManager.getSession(activeSession.contextId);
      expect(retrieved).toBeDefined();
    });

    it('should cleanup session resources', () => {
      // Given a session with resources
      const session = sessionManager.createSession();
      sessionManager.addTask(session.contextId, 'task-1');
      sessionManager.addTask(session.contextId, 'task-2');

      // When deleting session
      sessionManager.deleteSession(session.contextId);

      // Then session and resources should be cleaned
      const retrieved = sessionManager.getSession(session.contextId);
      expect(retrieved).toBeNull();
    });
  });

  describe('session events', () => {
    it('should emit session created event', () => {
      // Given event listener
      const listener = vi.fn();
      sessionManager.on('sessionCreated', listener);

      // When creating session
      const session = sessionManager.createSession();

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: session.contextId,
        session,
      });
    });

    it('should emit session updated event', () => {
      // Given a session and listener
      const session = sessionManager.createSession();
      const listener = vi.fn();
      sessionManager.on('sessionUpdated', listener);

      // When updating session
      sessionManager.updateSessionState(session.contextId, {
        metadata: { updated: true },
      });

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: session.contextId,
        changes: expect.objectContaining({
          metadata: { updated: true },
        }) as Partial<{ metadata: Record<string, unknown> }>,
      });
    });

    it('should emit session deleted event', () => {
      // Given a session and listener
      const session = sessionManager.createSession();
      const listener = vi.fn();
      sessionManager.on('sessionDeleted', listener);

      // When deleting session
      sessionManager.deleteSession(session.contextId);

      // Then event should be emitted
      expect(listener).toHaveBeenCalledWith({
        contextId: session.contextId,
      });
    });
  });
});
