import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { findPregenWallet, touchPregenWallet } from '../store/pregenWalletStore.js';
import { getParaServerClient, loadParaModule } from '../utils/paraServer.js';

const walletTypeSchema = z.enum(['EVM', 'SOLANA', 'COSMOS']);

export const SignPregenTransactionParams = z.object({
  identifier: z.string().min(1).describe('Identifier of the pregenerated wallet to use'),
  identifierType: z
    .enum(['email', 'phone', 'username', 'id', 'custom'])
    .default('email')
    .describe('Identifier type used during pregeneration'),
  walletType: walletTypeSchema.default('EVM').describe('Wallet type associated with the pregenerated wallet'),
  chainId: z.string().optional().describe('Optional chain identifier (for EVM chains)'),
  rawTransaction: z
    .string()
    .min(1, 'rawTransaction must be provided')
    .describe('Serialized transaction payload (hex or base64 depending on chain)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Attempt to broadcast the transaction if the Para SDK supports it'),
});

export const signPregenTransactionTool: VibkitToolDefinition<typeof SignPregenTransactionParams, Task> = {
  name: 'sign-pregen-transaction',
  description:
    'Sign or execute a transaction using a cached pregenerated wallet via the Para Server SDK. Supports EVM/Solana/Cosmos where available.',
  parameters: SignPregenTransactionParams,
  execute: async (args: z.infer<typeof SignPregenTransactionParams>) => {
    const entry = findPregenWallet(args.identifierType, args.identifier);
    if (!entry) {
      throw new VibkitError(
        'PregenWalletNotFound',
        -32050,
        `No cached pregenerated wallet for ${args.identifierType}:${args.identifier}`,
      );
    }

    if (!entry.userShareJson || entry.userShareJson === 'Unavailable - wallet already existed before caching') {
      throw new VibkitError(
        'MissingUserShare',
        -32051,
        'Cannot sign transactions because the user share is unavailable. Create the wallet again to obtain a share.',
      );
    }

    const para = await getParaServerClient();
    const module = await loadParaModule();
    const walletType = args.walletType;

    let userShare: unknown;
    try {
      userShare = JSON.parse(entry.userShareJson);
    } catch (error) {
      throw new VibkitError('InvalidUserShare', -32052, `Failed to parse cached user share: ${(error as Error).message}`);
    }

    if (typeof (para as { setUserShare?: (share: unknown) => Promise<void> }).setUserShare === 'function') {
      await (para as { setUserShare: (share: unknown) => Promise<void> }).setUserShare(userShare);
    } else {
      throw new VibkitError(
        'ParaSetUserShareUnsupported',
        -32053,
        'Installed Para SDK does not expose setUserShare. Update to the latest version.',
      );
    }

    const paraAny = para as unknown as Record<string, unknown>;
    const requestPayload: Record<string, unknown> = {
      walletId: entry.walletId,
      rawTransaction: args.rawTransaction,
      chainId: args.chainId,
      broadcast: args.broadcast,
    };

    let executionResult: unknown;

    if (walletType === 'EVM') {
      if (typeof paraAny.signEvmTransaction === 'function') {
        executionResult = await (paraAny.signEvmTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else if (typeof paraAny.executeEvmTransaction === 'function') {
        executionResult = await (paraAny.executeEvmTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else if (typeof paraAny.signTransaction === 'function') {
        executionResult = await (paraAny.signTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else {
        throw new VibkitError(
          'ParaEvmSigningUnsupported',
          -32054,
          'Installed Para SDK does not expose signEvmTransaction/executeEvmTransaction APIs.',
        );
      }
    } else if (walletType === 'SOLANA') {
      if (typeof paraAny.signSolanaTransaction === 'function') {
        executionResult = await (paraAny.signSolanaTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else if (typeof paraAny.executeSolanaTransaction === 'function') {
        executionResult = await (paraAny.executeSolanaTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else {
        throw new VibkitError(
          'ParaSolanaSigningUnsupported',
          -32055,
          'Installed Para SDK does not expose Solana transaction helpers. Update to the latest version.',
        );
      }
    } else if (walletType === 'COSMOS') {
      if (typeof paraAny.executeCosmosTransaction === 'function') {
        executionResult = await (paraAny.executeCosmosTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else if (typeof paraAny.signCosmosTransaction === 'function') {
        executionResult = await (paraAny.signCosmosTransaction as (payload: Record<string, unknown>) => Promise<unknown>)(
          requestPayload,
        );
      } else {
        throw new VibkitError(
          'ParaCosmosSigningUnsupported',
          -32056,
          'Installed Para SDK does not expose Cosmos transaction helpers. Update to the latest version.',
        );
      }
    } else {
      throw new VibkitError('UnsupportedWalletType', -32057, `Wallet type ${walletType} is not supported.`);
    }

    if (typeof (para as { clearUserShare?: () => Promise<void> }).clearUserShare === 'function') {
      await (para as { clearUserShare: () => Promise<void> }).clearUserShare();
    }

    touchPregenWallet({
      identifierKey: entry.identifierKey,
      identifierValue: entry.identifierValue,
      operation: `sign-${walletType.toLowerCase()}`,
    });

    const artifact = createArtifact(
      [
        {
          kind: 'text',
          text: JSON.stringify(
            {
              request: requestPayload,
              executionResult,
              walletType,
            },
            null,
            2,
          ),
        },
      ],
      'PregenTransactionExecution',
      'Result of executing or signing a transaction with a pregenerated wallet',
    );

    return createSuccessTask(
      'pregen-wallet',
      [artifact],
      `Transaction operation for ${walletType} wallet ${entry.walletId} completed successfully.`,
    );
  },
};
