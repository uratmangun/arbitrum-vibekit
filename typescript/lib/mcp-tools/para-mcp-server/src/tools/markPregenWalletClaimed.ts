import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { markPregenWalletClaimed } from '../store/pregenWalletStore.js';

const identifierTypeSchema = z
  .enum(['email', 'phone', 'username', 'id', 'custom'])
  .describe('Identifier key used for pregenerated wallet lookup (e.g., email, phone, username, id)');

export const MarkPregenWalletClaimedParams = z.object({
  identifier: z.string().min(1, 'Identifier is required').describe('Unique identifier for pregenerated wallet'),
  identifierType: identifierTypeSchema.default('email'),
  recoverySecret: z.string().optional().describe('Optional recovery secret returned by Para after claiming'),
});

export const markPregenWalletClaimedTool: VibkitToolDefinition<typeof MarkPregenWalletClaimedParams, Task> = {
  name: 'mark-pregen-wallet-claimed',
  description: 'Mark a pregenerated wallet as claimed in the in-memory cache after successful client-side claim.',
  parameters: MarkPregenWalletClaimedParams,
  execute: async (args: z.infer<typeof MarkPregenWalletClaimedParams>) => {
    const updated = markPregenWalletClaimed({
      identifierKey: args.identifierType,
      identifierValue: args.identifier,
      recoverySecret: args.recoverySecret,
    });

    if (!updated) {
      throw new VibkitError(
        'PregenWalletNotFound',
        -32005,
        `No pregenerated wallet found for ${args.identifierType}:${args.identifier}`,
      );
    }

    const payload = {
      walletId: updated.walletId,
      identifierKey: updated.identifierKey,
      identifierValue: updated.identifierValue,
      claimedAt: updated.claimedAt,
    };

    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(payload, null, 2) }],
      'MarkedPregenWalletClaimed',
      'Server-side record updated to indicate this pregenerated wallet has been claimed',
    );

    return createSuccessTask(
      'pregen-wallet',
      [artifact],
      `Marked wallet ${updated.walletId} as claimed for ${updated.identifierKey}:${updated.identifierValue}.`,
    );
  },
};
