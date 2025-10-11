import type { Artifact, Message } from '@a2a-js/sdk';
import { z } from 'zod';

import type { WorkflowPlugin, WorkflowContext, WorkflowYield } from '../types.js';

export const blockchainTransaction: WorkflowPlugin = {
  id: 'blockchain_transaction',
  name: 'Blockchain Transaction',
  description: 'Execute blockchain transactions with 4-artifact pattern',
  version: '1.0.0',
  inputSchema: z.object({
    to: z.string().optional(),
    value: z.string().optional(),
    data: z.string().optional(),
    action: z.string().optional(),
  }),
  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowYield, unknown, unknown> {
    const { parameters } = context;
    const txHash = '0xabc123def456789';

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    // Status: Preparing transaction
    const prepareMessage: Message = {
      kind: 'message',
      messageId: 'status-prepare',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Preparing blockchain transaction' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: prepareMessage,
      },
    };

    // Artifact 1: Transaction Summary with gas estimates
    const txSummary: Artifact = {
      artifactId: 'tx-summary',
      name: 'tx-summary.json',
      description: 'Transaction summary with gas estimates',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            to: parameters?.['to'] as string | undefined,
            value: parameters?.['value'] as string | undefined,
            gasEstimate: '21000',
            gasPrice: '30000000000',
            maxFeePerGas: '35000000000',
            maxPriorityFeePerGas: '2000000000',
            chainId: 1,
            estimatedCostUSD: '2.50',
            maxCostUSD: '3.00',
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: txSummary };

    // Artifact 2: Unsigned Transaction
    const unsignedTx: Artifact = {
      artifactId: 'unsigned-tx',
      name: 'unsigned-tx',
      description: 'Unsigned transaction data for signing',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            to: parameters?.['to'] as string | undefined,
            value: parameters?.['value'] as string | undefined,
            nonce: 1,
            gasLimit: '21000',
            maxFeePerGas: '35000000000',
            maxPriorityFeePerGas: '2000000000',
            chainId: 1,
            data: parameters?.['data'] || '0x',
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: unsignedTx };

    // Artifact 3: Transaction Status Log
    const txStatus: Artifact = {
      artifactId: 'tx-status',
      name: 'tx-status.jsonl',
      description: 'Transaction status updates during broadcast',
      parts: [
        {
          kind: 'text',
          text:
            JSON.stringify({ timestamp: new Date().toISOString(), status: 'prepared' }) +
            '\n' +
            JSON.stringify({ timestamp: new Date().toISOString(), status: 'signing' }) +
            '\n',
        },
      ],
    };
    yield { type: 'artifact', artifact: txStatus };

    // Pause for signature with input schema
    const pauseMessage: Message = {
      kind: 'message',
      messageId: 'pause-signature',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Please sign the transaction' }],
    };

    const userInput = (yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: pauseMessage,
      },
      inputSchema: z.object({
        signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
        confirm: z.boolean().optional(),
      }),
    }) as { signature?: string; confirm?: boolean } | undefined;

    // Continue after receiving signature
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

    // Update status log with broadcast info
    const statusUpdate: Artifact = {
      artifactId: 'tx-status',
      name: 'tx-status.jsonl',
      description: 'Transaction status updates during broadcast',
      parts: [
        {
          kind: 'text',
          text:
            JSON.stringify({
              timestamp: new Date().toISOString(),
              status: 'broadcasting',
              txHash,
              signature: userInput?.signature,
            }) +
            '\n' +
            JSON.stringify({ timestamp: new Date().toISOString(), status: 'pending' }) +
            '\n' +
            JSON.stringify({
              timestamp: new Date().toISOString(),
              status: 'confirmed',
              blockNumber: 12345678,
            }) +
            '\n',
        },
      ],
    };
    yield { type: 'artifact', artifact: statusUpdate };

    // Artifact 4: Transaction Receipt
    const txReceipt: Artifact = {
      artifactId: 'tx-receipt',
      name: 'tx-receipt.json',
      description: 'Final transaction receipt with confirmation',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            transactionHash: txHash,
            blockNumber: 12345678,
            blockHash: '0xdef456abc789123',
            gasUsed: 21000,
            status: 'success',
            confirmations: 12,
            effectiveGasPrice: 30000000000,
            signature: userInput?.signature,
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: txReceipt };

    // Return final result
    return {
      transactionHash: txHash,
      status: 'confirmed',
      blockNumber: 12345678,
      signature: userInput?.signature,
    };
  },
};

export default blockchainTransaction;
