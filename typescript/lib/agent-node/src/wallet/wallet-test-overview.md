# Wallet Test Suite Overview

This document provides a comprehensive overview of all tests in the wallet test suite, organized by test file and category.

## wallet-behavior.unit.test.ts

Black-box behavior tests focusing on API contracts and user-visible behavior.

### Wallet Lifecycle

- should initialize wallet from private key and expose address
- should generate new wallet when no key provided [incorrect. should throw error.]
  [remove all locking. features not needed]
- should lock wallet and prevent operations
- should require correct password to unlock
- should throttle repeated failed unlock attempts

### HD Wallet Derivation (BIP-39/32/44) [only private key supported. only EVM wallet private key.]

- should derive correct address from mnemonic following BIP-44
- should derive different addresses for different derivation paths
- should support SLIP-10 for non-secp256k1 curves

### Transaction Signing

- should sign transaction and produce valid signature
- should sign EIP-1559 transactions with maxFeePerGas

### Message Signing (personal_sign)

- should sign personal message with EIP-191 prefix
- should produce consistent signatures for same message

### EIP-712 Typed Data Signing

- should sign EIP-712 typed data matching reference implementation
- should reject typed data with mismatched types

### Multi-chain Support

- should create wallet clients for different chains
- should use same account address across all chains

### Authorization Flow [remove all]

- should require authorization when enabled
- should allow operation after authorization approval
- should emit authorization lifecycle events

### Balance Queries [remove all]

- should query native ETH balance
- should query ERC-20 token balances
- should batch query multiple token balances

### Gas Estimation

- should estimate gas for transactions
- should get current gas price
- should get EIP-1559 fee data

### Concurrent Operations

- should handle concurrent signing operations safely
- should prevent concurrent unlocks corrupting state

### Error Handling

- should reject invalid private keys
- should timeout long-running operations
- should provide clear error messages for locked operations

## wallet-security-invariants.unit.test.ts

Security invariant tests that are frozen across refactors and treated as design constraints.

### [SR-1] No raw keys in public surface or logs

- should not expose private key in public properties
- should not expose mnemonic in public surface [mnemonic not supported. remove]
- should redact secrets from error messages
- should not log sensitive data during operations
- should sanitize wallet in toJSON() if implemented
- should not expose keys in event payloads

### [SR-2] Zeroization on lock [lock feature removed]

- should clear sensitive data from memory on lock
- should invalidate signing capabilities after lock
- should clear password hash on lock

### [SR-3] No plaintext copies in obvious places

- should not store secrets as JavaScript strings
- should use secure buffers for key material
- should not leave key material in temporary variables

### [SR-4] Constant-time comparisons for secrets [password lock feature removed]

- should use constant-time comparison for password verification
- should not leak password length through timing
- should use crypto.timingSafeEqual if available

### [SR-META] Structural security checks

- should not have methods that directly return private keys
- should implement secure random generation for new wallets [does not generate wallets]
- should not leak information through object property enumeration

## wallet-property.unit.test.ts

Property-based tests using fast-check to find edge cases and verify invariants.

### Initialization Properties

- should always produce valid addresses from valid private keys
- should generate unique addresses for different private keys
- should handle private keys with and without 0x prefix consistently

### Message Signing Properties

- should produce consistent signatures for identical messages
- should produce different signatures for different messages
- should handle unicode and special characters in messages
- should handle empty and whitespace messages

### Password Protection Properties [feature removed]

- should never unlock with incorrect passwords
- should handle password changes correctly

### Transaction Signing Properties

- should sign valid transactions with arbitrary values
- should handle edge case transaction values

### EIP-712 Typed Data Properties

- should sign typed data with various field types
- should produce different signatures for different typed data

### Concurrency and State Properties

- should maintain consistent state under concurrent operations
- should handle rapid lock/unlock cycles

### Error Handling Properties

- should provide meaningful errors for invalid inputs
- should never expose sensitive data in error messages

### Determinism and Reproducibility

- should derive same address from same mnemonic across instances [mnemonic not supported]
- should produce deterministic signatures for same input

## wallet-differential.unit.test.ts

Differential tests comparing outputs with reference implementations (viem).

### Address Derivation

- should derive same address as viem for private keys
- should derive same addresses from mnemonics as viem

### Message Signing

- should produce same personal_sign signatures as viem
- should hash messages with EIP-191 prefix like viem

### EIP-712 Typed Data Signing

- should produce same EIP-712 signatures as viem
- should handle complex nested typed data like viem
- should hash typed data domains correctly like viem

### Transaction Signing

- should sign legacy transactions compatible with viem
- should sign EIP-1559 transactions compatible with viem

### Signature Format Validation

- should produce signatures with correct v, r, s components
- should produce malleable signatures that viem can verify

### Edge Cases and Compatibility

- should handle chain ID edge cases like reference implementations
- should handle zero addresses and values correctly
- should maintain precision for large BigInt values

## heap-snapshot.unit.test.ts

CI-only memory analysis tests to verify no secret leakage.

### Memory Leak Prevention

- should not retain private keys in heap after initialization
- should not retain passwords in heap [remove]
- should not retain mnemonic phrases in heap [remove]
- should clear sensitive data from heap after lock

### Memory Patterns Analysis

- should not create multiple copies of secrets in memory
- should not leak secrets through string concatenation
- should not retain secrets in error objects

### Heap Size Monitoring

- should not significantly increase heap size with repeated operations
- should not leak memory when creating multiple wallets

### String Interning and Deduplication

- should not defeat string deduplication for addresses
- should not create unnecessary string copies during signing

## Test Statistics

- **Total test files**: 5
- **Total test suites**: 29
- **Total test cases**: 96
- **Security invariant tests**: 13 (frozen, require security review to change)
- **Property-based tests**: 16 (using fast-check for generative testing)
- **Differential tests**: 13 (comparing against viem reference implementation)
- **Memory analysis tests**: 10 (CI-only, requires --expose-gc flag)

## Test Execution

### Local Development

```bash
# Run all unit tests
pnpm test:unit

# Run specific test file
pnpm test:unit wallet-behavior

# Run with coverage
pnpm test:coverage
```

### CI Environment

```bash
# Include heap snapshot tests
HEAP_SNAPSHOT_TESTS=true pnpm test:unit -- --expose-gc

# Run security invariant tests only
pnpm test:unit wallet-security-invariants
```

## Security Requirements Reference

The security invariant tests validate the following requirements:

- **SR-1**: No raw key material exposed in public API, events, or logs
- **SR-2**: Sensitive data zeroized from memory on wallet lock
- **SR-3**: Secrets stored as Uint8Array/Buffer, never as JavaScript strings
- **SR-4**: Constant-time comparison used for password verification

See `SECURITY_REQUIREMENTS.md` for full details.
