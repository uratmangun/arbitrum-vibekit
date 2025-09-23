import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createPregenWalletTool } from './tools/createPregenWallet.js';
import { listPregenWalletsTool } from './tools/listPregenWallets.js';
import { signPregenTransactionTool } from './tools/signPregenTransaction.js';
import { claimPregenWalletTool } from './tools/claimPregenWallet.js';
import { markPregenWalletClaimedTool } from './tools/markPregenWalletClaimed.js';

// (no-op) Removed legacy CoinGecko helpers; using local Para tools instead.

export async function createServer() {
    const server = new McpServer({
        name: 'para-mcp-server',
        version: '1.0.0'
    });

    //
    // Tool definitions
    //

    const CreatePregenWalletSchema = createPregenWalletTool.parameters;

    server.tool(
        'create_pregen_wallet',
        createPregenWalletTool.description,
        CreatePregenWalletSchema.shape,
        async (args: z.infer<typeof CreatePregenWalletSchema>) => {
            try {
                const result = await createPregenWalletTool.execute(args as any);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (create_pregen_wallet):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: `Failed to create pregenerated wallet: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    const ListPregenWalletsSchema = listPregenWalletsTool.parameters;

    server.tool(
        'list_pregen_wallets',
        listPregenWalletsTool.description,
        ListPregenWalletsSchema.shape,
        async (_args: z.infer<typeof ListPregenWalletsSchema>) => {
            try {
                const result = await listPregenWalletsTool.execute({} as any);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (list_pregen_wallets):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: `Failed to list pregenerated wallets: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    const ClaimPregenWalletSchema = claimPregenWalletTool.parameters;

    server.tool(
        'claim_pregen_wallet',
        claimPregenWalletTool.description,
        ClaimPregenWalletSchema.shape,
        async (args: z.infer<typeof ClaimPregenWalletSchema>) => {
            try {
                const result = await claimPregenWalletTool.execute(args as any);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (claim_pregen_wallet):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: `Failed to claim pregenerated wallet: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    const MarkPregenWalletClaimedSchema = markPregenWalletClaimedTool.parameters;

    server.tool(
        'mark_pregen_wallet_claimed',
        markPregenWalletClaimedTool.description,
        MarkPregenWalletClaimedSchema.shape,
        async (args: z.infer<typeof MarkPregenWalletClaimedSchema>) => {
            try {
                const result = await markPregenWalletClaimedTool.execute(args as any);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (mark_pregen_wallet_claimed):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: `Failed to mark pregenerated wallet as claimed: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    const SignPregenTransactionSchema = signPregenTransactionTool.parameters;

    server.tool(
        'sign_pregen_transaction',
        signPregenTransactionTool.description,
        SignPregenTransactionSchema.shape,
        async (args: z.infer<typeof SignPregenTransactionSchema>) => {
            try {
                const result = await signPregenTransactionTool.execute(args as any);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (sign_pregen_transaction):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: `Failed to sign/execute transaction: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    return server;
} 