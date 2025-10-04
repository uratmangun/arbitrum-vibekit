# ETH Transfer Tool Guide

## Overview

The `transfer_eth` tool enables ETH transfers from pregenerated wallets using their cached userShare. This tool looks up wallets by identifier (e.g., email like `panda@gmail.com`), retrieves the userShare from the in-memory database, and executes transfers on Base Sepolia or other supported EVM test networks.

## How It Works

1. **Wallet Lookup**: Finds the pregenerated wallet in the in-memory store using the identifier (e.g., `panda@gmail.com`)
2. **UserShare Loading**: Retrieves and parses the cached userShare from the store
3. **Para Authentication**: Uses `para.setUserShare()` to authenticate the wallet
4. **Transfer Execution**: Calls `para.transfer()` to send ETH to the recipient address
5. **Response**: Returns transaction details including hash, explorer link, and confirmation

## Supported Networks

- **base-sepolia** (Chain ID: 84532) - Default
- **ethereum-sepolia** (Chain ID: 11155111)
- **ethereum-holesky** (Chain ID: 17000)
- **arbitrum-sepolia** (Chain ID: 421614)

## API Reference

### Tool Name
`transfer_eth`

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `identifier` | string | Yes | - | Unique identifier for the wallet (e.g., `panda@gmail.com`) |
| `identifierType` | enum | No | `email` | One of: `email`, `phone`, `username`, `id`, `custom` |
| `recipientAddress` | string | Yes | - | Recipient Ethereum address (0x... format) |
| `amount` | string | Yes | - | Amount in ETH (e.g., `"0.001"` = 0.001 ETH, `"0.00001"` = 0.00001 ETH) |
| `network` | enum | No | `base-sepolia` | One of: `base-sepolia`, `ethereum-sepolia`, `ethereum-holesky`, `arbitrum-sepolia` |
| `rpcUrl` | string | No | - | Optional custom RPC URL |

### Success Response

```json
{
  "success": true,
  "transactionHash": "0xabc123...",
  "from": "0x1234...abcd",
  "to": "0x5678...ef90",
  "amountEth": "0.001",
  "amountWei": "1000000000000000",
  "chainId": "84532",
  "network": "base-sepolia",
  "explorerLink": "https://sepolia.basescan.org/tx/0xabc123...",
  "note": "ETH transfer completed successfully. Transaction may take a few moments to confirm on-chain."
}
```

### Error Responses

#### Wallet Not Found (Code: -32001)
```json
{
  "error": "PregenWalletNotFound",
  "code": -32001,
  "message": "No pregenerated wallet found for email:panda@gmail.com",
  "identifierType": "email",
  "identifier": "panda@gmail.com"
}
```

#### UserShare Unavailable (Code: -32008)
```json
{
  "error": "UserShareUnavailable",
  "code": -32008,
  "message": "User share is not available for this pregenerated wallet. Cannot perform transfer.",
  "identifierType": "email",
  "identifier": "panda@gmail.com",
  "walletId": "wallet-id-123"
}
```

#### Transfer Failed (Code: -32010)
```json
{
  "error": "TransferFailed",
  "code": -32010,
  "message": "Failed to transfer ETH: Insufficient funds",
  "identifierType": "email",
  "identifier": "panda@gmail.com",
  "recipientAddress": "0x5678...ef90",
  "amount": "1000000000000000",
  "network": "base-sepolia"
}
```

## Usage Examples

### Via Script

```bash
# Transfer 0.001 ETH on Base Sepolia
pnpm eth:transfer panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.001

# Transfer 0.00001 ETH on Arbitrum Sepolia
pnpm eth:transfer panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.00001 arbitrum-sepolia

# Transfer with custom identifier type
pnpm eth:transfer user123 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.005 base-sepolia username
```

### Via MCP Tool Call

```typescript
const result = await transferEthTool.execute(
  {
    identifier: 'panda@gmail.com',
    identifierType: 'email',
    recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    amount: '0.001', // 0.001 ETH (automatically converted to wei)
    network: 'base-sepolia',
  },
  { custom: {} }
);
```

## Complete Workflow Example

### 1. Create a Pregenerated Wallet

```bash
pnpm pregen:create panda@gmail.com
```

This creates a wallet and caches the userShare in memory.

### 2. Fund the Wallet with Faucet

```bash
pnpm faucet:request 0x<WALLET_ADDRESS> eth base-sepolia
```

Wait for the faucet transaction to confirm (check the explorer link).

### 3. Transfer ETH

```bash
pnpm eth:transfer panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.001
```

This transfers 0.001 ETH from the pregenerated wallet to the recipient. The amount is automatically converted to wei internally.

## Amount Format

The tool accepts amounts in ETH (decimal format), which are automatically converted to wei internally:

| ETH Amount | Wei Value (internal) |
|------------|----------------------|
| `"0.00001"` | `10000000000000` |
| `"0.0001"` | `100000000000000` |
| `"0.001"`  | `1000000000000000` |
| `"0.01"`   | `10000000000000000` |
| `"0.1"`    | `100000000000000000` |
| `"1"`      | `1000000000000000000` |

**Example:**
- To send 0.001 ETH, use: `amount: "0.001"`
- To send 0.00001 ETH, use: `amount: "0.00001"`

## Important Notes

1. **UserShare Required**: The wallet must exist in the in-memory cache with a valid userShare to perform transfers. Wallets that existed before caching will show "Unavailable - wallet already existed before caching".

2. **Sufficient Funds**: Ensure the wallet has enough ETH to cover both the transfer amount and gas fees.

3. **Network Selection**: Always verify you're using the correct network. The chain ID is automatically mapped from the network name.

4. **Transaction Confirmation**: Transactions may take a few seconds to a few minutes to confirm depending on network congestion. Use the explorer link to track progress.

5. **In-Memory Store**: The wallet store is in-memory only. Restarting the server will clear all cached wallets and userShares.

## Error Troubleshooting

### "PregenWalletNotFound"
- **Cause**: Wallet doesn't exist in the in-memory cache
- **Solution**: Create the wallet first using `create_pregen_wallet` or `pnpm pregen:create`

### "UserShareUnavailable"
- **Cause**: The wallet exists but the userShare was not cached (e.g., wallet existed before caching)
- **Solution**: This typically happens when a wallet was created outside the current session. You may need to recreate the wallet or manually load the userShare.

### "TransferFailed: Insufficient funds"
- **Cause**: Wallet doesn't have enough ETH for the transfer + gas fees
- **Solution**: Fund the wallet using the faucet tool or send ETH from another wallet

### "TransferFailed: Invalid address"
- **Cause**: Recipient address is not a valid Ethereum address
- **Solution**: Verify the address format is correct (should start with 0x and be 42 characters total)

## Security Considerations

1. **UserShare Storage**: The userShare is stored in plain text in memory. In production, encrypt userShares before storage.

2. **Environment Variables**: Keep `PARA_API_KEY` secure and never commit it to version control.

3. **Network Selection**: Always double-check the network parameter to avoid sending funds to the wrong chain.

4. **Transaction Verification**: Always verify transaction details before executing large transfers.

## Related Tools

- `create_pregen_wallet`: Create a new pregenerated wallet
- `list_pregen_wallets`: List all cached wallets
- `claim_pregen_wallet`: Retrieve wallet details for claiming
- `request_faucet`: Request testnet funds for a wallet

## References

- [Para Documentation](https://docs.getpara.com/)
- [Para Server SDK](https://docs.getpara.com/v2/server/overview)
- [Para Transfer Method](https://docs.getpara.com/v2/server/guides/pregen)
- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)

