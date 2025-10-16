/**
 * E2E test for DeFi Strategy Workflow Lifecycle using A2A Client
 *
 * This test validates the complete client-side lifecycle of a DeFi strategy workflow
 * executed by Agent Node via the A2A protocol, including:
 * - Task creation and streaming events
 * - Pause/resume for input collection
 * - Real delegation signing via Viem with EIP-7702 wallet
 * - Artifact streaming and validation
 * - Status transitions and completion
 *
 * @see /Users/tomdaniel/Desktop/arbitrum-vibekit/.vibecode/test-workflow-lifecycle/prd.md
 */

import type { Server } from 'http';
import { A2AClient } from '@a2a-js/sdk/client';
import type { TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createA2AServer } from '../../src/a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import { serviceConfig } from '../../src/config.js';
import {
  createLifecycleTestConfigWorkspace,
  get7702TestAccount,
  getTestChainId,
  signDelegation,
  extractArtifactData,
  SettingsArtifactSchema,
  DelegationsToSignArtifactSchema,
  SignedDelegationsArtifactSchema,
  TxHistoryEntrySchema,
  PerformanceArtifactSchema,
  TransactionExecutedArtifactSchema,
} from '../utils/lifecycle-test-helpers.js';
import type { z } from 'zod';

/**
 * E2E test suite for workflow lifecycle with A2A streaming
 */
describe('DeFi Strategy Workflow Lifecycle (E2E)', () => {
  let server: Server;
  let client: A2AClient;
  let baseUrl: string;
  let agentConfigHandle: AgentConfigHandle;
  let testConfigDir: string;
  let testAccount: ReturnType<typeof get7702TestAccount>;
  let testChainId: number;

  beforeAll(async () => {
    try {
      // Validate environment configuration
      testAccount = get7702TestAccount();
      testChainId = getTestChainId();

      console.log('[E2E] Test wallet address:', testAccount.address);
      console.log('[E2E] Test chain ID:', testChainId);

      // Create config workspace with lifecycle workflow plugin
      testConfigDir = createLifecycleTestConfigWorkspace({
        agentName: 'Lifecycle Test Agent',
        agentUrl: 'http://localhost:3000/a2a',
      });

      console.log('[E2E] Test config dir:', testConfigDir);

      // Initialize agent config from test workspace
      agentConfigHandle = await initFromConfigWorkspace({
        root: testConfigDir,
        dev: false,
      });

      // Create A2A server with config
      server = await createA2AServer({
        serviceConfig,
        agentConfig: agentConfigHandle,
      });

      // Wait for server to be listening
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', () => resolve());
        }
      });

      // Get the actual port
      const address = server.address();
      if (address && typeof address === 'object') {
        baseUrl = `http://localhost:${address.port}`;

        // Verify server is responding
        const cardUrl = `${baseUrl}/.well-known/agent.json`;
        const cardResponse = await fetch(cardUrl);
        if (!cardResponse.ok) {
          throw new Error(
            `Agent card fetch failed: ${cardResponse.status} ${cardResponse.statusText}`,
          );
        }

        // Create A2A client
        client = await A2AClient.fromCardUrl(cardUrl);
        console.log('[E2E] A2A client initialized');
      } else {
        throw new Error('Server address not available');
      }
    } catch (error) {
      console.error('[E2E] Failed to setup test environment:', error);
      throw error;
    }
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Clean up agent config handle
    if (agentConfigHandle) {
      await agentConfigHandle.close();
    }

    // Clean up server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should complete full workflow lifecycle with pause/resume, delegation signing, and artifact streaming', async () => {
    // Given: A workflow dispatch request targeting the lifecycle mock plugin
    const contextId = `ctx-lifecycle-${Date.now()}`;
    const messageId = uuidv4();

    // Track received events
    const statusUpdates: TaskStatusUpdateEvent[] = [];
    const artifactUpdates: TaskArtifactUpdateEvent[] = [];
    let taskId: string | undefined;

    // When: Start the workflow via message/stream
    const streamGenerator = client.sendMessageStream({
      message: {
        kind: 'message',
        messageId,
        contextId,
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Execute the defi-strategy-lifecycle-mock workflow with intent "Test DeFi Strategy"',
          },
        ],
      },
    });

    // Collect events from stream
    let pauseCount = 0;

    for await (const event of streamGenerator) {
      console.log('[E2E] Received event:', event.kind);

      if (event.kind === 'task') {
        // Then: Should receive task event with task id
        taskId = event.id;
        expect(taskId).toBeDefined();
        expect(event.status.state).toBe('submitted');
        console.log('[E2E] Task created:', taskId);
      } else if (event.kind === 'status-update') {
        statusUpdates.push(event);
        console.log('[E2E] Status update:', event.status.state, event.final ? '(final)' : '');

        // Handle pause for input collection
        if (event.status.state === 'input-required' && !event.final) {
          pauseCount++;

          if (pauseCount === 1) {
            // Pause 1: Provide wallet address and amount
            console.log('[E2E] Pause 1: Providing wallet address and amount');

            const resumeMessageId = uuidv4();
            const resumeResponse = await client.sendMessage({
              message: {
                kind: 'message',
                messageId: resumeMessageId,
                contextId,
                role: 'user',
                parts: [
                  {
                    kind: 'data',
                    data: {
                      walletAddress: testAccount.address,
                      amount: '1000',
                    },
                    metadata: { mimeType: 'application/json' },
                  },
                ],
              },
              taskId,
            });

            console.log('[E2E] Resume response:', resumeResponse);
          } else if (pauseCount === 2) {
            // Pause 2: Sign delegations and provide signed data
            console.log('[E2E] Pause 2: Signing delegations');

            // Find the delegations-to-sign artifact
            const delegationsArtifact = artifactUpdates.find(
              (a) => a.artifact.artifactId === 'delegations-to-sign',
            );

            expect(
              delegationsArtifact,
              'Expected delegations-to-sign artifact before second pause',
            ).toBeDefined();

            if (delegationsArtifact) {
              const delegationsData = extractArtifactData<
                z.infer<typeof DelegationsToSignArtifactSchema>
              >(delegationsArtifact.artifact);

              expect(delegationsData).toBeDefined();
              expect(delegationsData?.delegations).toHaveLength(2);

              // Validate delegations schema
              const validatedDelegations = DelegationsToSignArtifactSchema.parse(delegationsData);

              // Sign each delegation
              const signedDelegations = await Promise.all(
                validatedDelegations.delegations.map(async (delegation) => ({
                  id: delegation.id,
                  signedDelegation: await signDelegation(testAccount, delegation),
                })),
              );

              console.log('[E2E] Signed', signedDelegations.length, 'delegations');

              // Resume with signed delegations
              const resumeMessageId = uuidv4();
              const resumeResponse = await client.sendMessage({
                message: {
                  kind: 'message',
                  messageId: resumeMessageId,
                  contextId,
                  role: 'user',
                  parts: [
                    {
                      kind: 'data',
                      data: {
                        delegations: signedDelegations,
                      },
                      metadata: { mimeType: 'application/json' },
                    },
                  ],
                },
                taskId,
              });

              console.log('[E2E] Resume with signatures response:', resumeResponse);
            }
          }
        }

        // Check for completion
        if (event.final && event.status.state === 'completed') {
          console.log('[E2E] Workflow completed');
          break;
        }
      } else if (event.kind === 'artifact-update') {
        artifactUpdates.push(event);
        console.log(
          '[E2E] Artifact update:',
          event.artifact.artifactId,
          event.artifact.name,
          event.append ? '(append)' : '',
          event.lastChunk ? '(last chunk)' : '',
        );
      }
    }

    // Then: Validate task creation and status transitions
    expect(taskId, 'Task ID should be defined').toBeDefined();

    const states = statusUpdates.map((u) => u.status.state);
    expect(states, 'Should include submitted state').toContain('submitted');
    expect(states, 'Should include working state').toContain('working');
    expect(states, 'Should include input-required state for pauses').toContain('input-required');

    // Verify at least 2 pauses occurred
    const inputRequiredCount = states.filter((s) => s === 'input-required').length;
    expect(
      inputRequiredCount,
      'Should have at least 2 input-required pauses',
    ).toBeGreaterThanOrEqual(2);

    // Verify final status
    const finalStatus = statusUpdates.find((u) => u.final);
    expect(finalStatus, 'Should have final status update').toBeDefined();
    expect(finalStatus?.status.state, 'Final state should be completed').toBe('completed');

    // Then: Validate artifact emissions
    const artifactIds = artifactUpdates.map((u) => u.artifact.artifactId);

    // Required artifacts per PRD
    expect(artifactIds, 'Should include strategy-settings artifact').toContain('strategy-settings');
    expect(artifactIds, 'Should include delegations-to-sign artifact').toContain(
      'delegations-to-sign',
    );
    expect(artifactIds, 'Should include signed-delegations artifact').toContain(
      'signed-delegations',
    );
    expect(artifactIds, 'Should include tx-history artifact').toContain('tx-history');
    expect(artifactIds, 'Should include strategy-performance artifact').toContain(
      'strategy-performance',
    );
    expect(artifactIds, 'Should include transaction-executed artifact').toContain(
      'transaction-executed',
    );

    // Then: Validate artifact schemas
    const settingsArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'strategy-settings',
    );
    if (settingsArtifact) {
      const settingsData = extractArtifactData(settingsArtifact.artifact);
      const validated = SettingsArtifactSchema.parse(settingsData);
      expect(validated.walletAddress).toBe(testAccount.address);
      expect(validated.amount).toBe('1000');
      expect(validated.chainId).toBe(testChainId);
    }

    const signedDelegationsArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'signed-delegations',
    );
    if (signedDelegationsArtifact) {
      const signedData = extractArtifactData(signedDelegationsArtifact.artifact);
      const validated = SignedDelegationsArtifactSchema.parse(signedData);
      expect(validated.delegations).toHaveLength(2);
    }

    // Then: Validate streamed updates for TX History and Performance
    const txHistoryUpdates = artifactUpdates.filter((a) => a.artifact.artifactId === 'tx-history');
    expect(
      txHistoryUpdates.length,
      'Should have at least 2 TX history updates (initial + update)',
    ).toBeGreaterThanOrEqual(2);

    // Validate TX history entries
    for (const update of txHistoryUpdates) {
      const txData = extractArtifactData(update.artifact);
      const validated = TxHistoryEntrySchema.parse(txData);
      expect(validated.txHash).toBeDefined();
      expect(validated.status).toMatch(/submitted|pending|confirmed|failed/);
    }

    const performanceUpdates = artifactUpdates.filter(
      (a) => a.artifact.artifactId === 'strategy-performance',
    );
    expect(
      performanceUpdates.length,
      'Should have at least 2 performance updates (initial + update)',
    ).toBeGreaterThanOrEqual(2);

    // Validate performance entries
    for (const update of performanceUpdates) {
      const perfData = extractArtifactData(update.artifact);
      const validated = PerformanceArtifactSchema.parse(perfData);
      expect(validated.totalValue).toBeDefined();
      expect(validated.unrealizedPnL).toBeDefined();
      expect(validated.realizedPnL).toBeDefined();
    }

    const transactionExecutedArtifact = artifactUpdates.find(
      (a) => a.artifact.artifactId === 'transaction-executed',
    );
    if (transactionExecutedArtifact) {
      const txData = extractArtifactData(transactionExecutedArtifact.artifact);
      const validated = TransactionExecutedArtifactSchema.parse(txData);
      expect(validated.status).toBe('success');
      expect(validated.chainId).toBe(testChainId);
    }

    console.log('[E2E] ✅ All validations passed');
    console.log('[E2E] Total status updates:', statusUpdates.length);
    console.log('[E2E] Total artifact updates:', artifactUpdates.length);
    console.log('[E2E] Unique artifacts:', new Set(artifactIds).size);
  }, 120000); // 120s timeout: allows for full lifecycle with pauses
});
