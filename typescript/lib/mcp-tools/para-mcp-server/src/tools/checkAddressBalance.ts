import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { createPublicClient, formatEther, http, type BlockTag } from 'viem';
import { arbitrum, baseSepolia, mainnet } from 'viem/chains';

const networkSchema = z
  .enum(['ethereum', 'arbitrum', 'base-sepolia'])
  .describe('EVM network to query (ethereum mainnet, arbitrum one, base sepolia testnet).');

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/u, 'Address must be a valid 20-byte hex string with 0x prefix.')
  .describe('Checksummed or lowercase EVM account address.');

const blockTagSchema = z
  .enum(['latest', 'pending', 'earliest', 'finalized', 'safe'])
  .optional()
  .describe('Optional block tag to query balance at (defaults to latest).');

export const CheckAddressBalanceParams = z.object({
  address: addressSchema,
  network: networkSchema.default('ethereum'),
  blockTag: blockTagSchema,
});

type CheckAddressBalanceArgs = z.infer<typeof CheckAddressBalanceParams>;

type NetworkKey = CheckAddressBalanceArgs['network'];

const chainByNetwork: Record<NetworkKey, typeof mainnet> = {
  ethereum: mainnet,
  arbitrum,
  'base-sepolia': baseSepolia,
};

function getRpcUrl(chain: typeof mainnet): string {
  const candidate = chain.rpcUrls.default?.http?.[0] ?? chain.rpcUrls.public?.http?.[0];
  if (!candidate) {
    throw new VibkitError(
      'MissingRpcUrl',
      -32061,
      `No RPC URL configured for ${chain.name}. Provide one via chain definition overrides.`,
    );
  }
  return candidate;
}

export const checkAddressBalanceTool: VibkitToolDefinition<typeof CheckAddressBalanceParams, Task> = {
  name: 'check-address-balance',
  description: 'Fetch the current balance for an EVM account on Ethereum, Arbitrum, or Base Sepolia using viem.',
  parameters: CheckAddressBalanceParams,
  execute: async (args: CheckAddressBalanceArgs) => {
    const chain = chainByNetwork[args.network];
    const rpcUrl = getRpcUrl(chain);

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const address = args.address as `0x${string}`;
    const blockTag = (args.blockTag ?? 'latest') as BlockTag;

    let balance: bigint;
    try {
      balance = await client.getBalance({ address, blockTag });
    } catch (error) {
      throw new VibkitError(
        'BalanceFetchFailed',
        -32062,
        `Failed to retrieve balance for ${address} on ${chain.name}: ${(error as Error).message}`,
      );
    }

    const formatted = formatEther(balance);
    const result = {
      address,
      network: args.network,
      chainId: chain.id,
      chainName: chain.name,
      blockTag,
      nativeCurrency: chain.nativeCurrency,
      balanceWei: balance.toString(),
      balanceEther: formatted,
    } as const;

    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(result, null, 2) }],
      'AddressBalance',
      `Balance information for ${address} on ${chain.name}`,
    );

    return createSuccessTask(
      'evm-balance',
      [artifact],
      `Balance for ${address} on ${chain.name}: ${formatted} ${chain.nativeCurrency.symbol}`,
    );
  },
};
