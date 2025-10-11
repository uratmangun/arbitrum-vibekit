import type { Artifact, Message } from '@a2a-js/sdk';
import { z } from 'zod';

import type { WorkflowPlugin, WorkflowContext, WorkflowYield } from '../types.js';

export const vaultDeposit: WorkflowPlugin = {
  id: 'vault_deposit',
  name: 'Vault Deposit',
  description: 'Deposit into a vault',
  version: '1.0.0',
  inputSchema: z.object({
    vaultId: z.string().min(1),
    amount: z.string().min(1),
  }),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowYield, unknown, unknown> {
    const { parameters } = context;

    const statusMessage: Message = {
      kind: 'message',
      messageId: 'status-prepare',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Preparing vault deposit' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: statusMessage,
      },
    };

    // Emit preview artifact
    const preview: Artifact = {
      artifactId: 'tx-preview.json',
      name: 'tx-preview.json',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            to: 'vault',
            vaultId: parameters?.['vaultId'] as string | undefined,
            amount: parameters?.['amount'] as string | undefined,
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: preview };

    // Pause for auth with zod schema
    const pauseMessage: Message = {
      kind: 'message',
      messageId: 'pause-auth',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Please sign the transaction and provide txHash' }],
    };

    // The yield expression returns the input sent when the generator is resumed
    const input = (yield {
      type: 'pause',
      status: {
        state: 'auth-required',
        message: pauseMessage,
      },
      inputSchema: z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
    }) as { txHash?: string } | undefined;

    const broadcastMessage: Message = {
      kind: 'message',
      messageId: 'status-broadcast',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Broadcasting transaction' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: broadcastMessage,
      },
    };

    return {
      txHash: input?.txHash,
      vaultId: parameters?.['vaultId'] as string | undefined,
      amount: parameters?.['amount'] as string | undefined,
    };
  },
};

export default vaultDeposit;
