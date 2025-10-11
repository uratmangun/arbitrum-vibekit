# Wallet Security Requirements

## Overview

This document defines the security requirements for the Embedded EOA Wallet implementation. These requirements are enforced through automated tests and must be maintained across all refactoring efforts.

## Context: JavaScript Security Limitations

It's important to understand that JavaScript/TypeScript running in Node.js has inherent security limitations:

1. **No True Memory Zeroization**: JavaScript's garbage collector prevents guaranteed memory wiping
2. **String Immutability**: Strings are immutable and may persist in memory
3. **No Constant-Time Guarantees**: JIT compilation and GC make timing consistency difficult
4. **Heap Exposure**: The V8 heap snapshot can expose any JavaScript object

Given these constraints, our security requirements represent **best-effort mitigations** rather than cryptographic guarantees.

## Security Requirements (SR)

### SR-1: No Raw Keys in Public Surface or Logs

**Requirement**: Private keys MUST NOT be accessible through:

- Public properties or methods
- JSON serialization (`JSON.stringify`, `toJSON()`)
- Console logs or debug output
- Error messages or stack traces
- Event payloads

**Implementation Guidelines**:

- Store sensitive data in Buffers or Uint8Arrays, not strings
- Implement custom `toJSON()` that excludes sensitive fields
- Sanitize error messages before throwing
- Use debug modes that redact sensitive information

**Test Coverage**: `wallet-security-invariants.unit.test.ts` - SR-1 tests

### SR-2: Memory Cleanup on Disposal

**Requirement**: When a wallet instance is disposed or no longer needed, sensitive data in memory SHOULD be cleared to the extent possible in JavaScript.

**Implementation Guidelines**:

- Override sensitive buffers with zeros: `buffer.fill(0)`
- Clear object properties: `delete this._privateKey`
- Invalidate derived keys and signing capabilities
- Note: Cannot guarantee complete removal due to GC

**Test Coverage**: `wallet-security-invariants.unit.test.ts` - Memory cleanup tests

### SR-3: No Plaintext Copies in Obvious Places

**Requirement**: Sensitive data SHOULD NOT be stored as plain JavaScript strings or in temporary variables that persist.

**Implementation Guidelines**:

- Use `Buffer.from(hexString, 'hex')` instead of storing hex strings
- Avoid string concatenation with secrets
- Don't create multiple copies of keys during operations
- Clear temporary variables after use

**Test Coverage**: `wallet-security-invariants.unit.test.ts` - SR-3 tests

### SR-4: Input Validation

**Requirement**: Private key inputs MUST be validated for correct format and length.

**Implementation Guidelines**:

- Validate private key is 32 bytes (64 hex characters)
- Accept both with and without '0x' prefix
- Reject invalid hex strings
- Throw clear errors for invalid inputs

**Test Coverage**: `wallet-security-invariants.unit.test.ts` - Input validation tests

## Additional Security Considerations

### Input Sanitization

- Validate all private key inputs before processing
- Strip and normalize hex prefixes consistently
- Reject malformed or suspicious inputs

### Private Key Handling

- Accept private keys as hex strings or Buffers
- Store internally as Uint8Array or Buffer
- Never expose raw private key through public API

### Address Derivation

- Derive Ethereum address from private key correctly
- Use keccak256 hash of public key
- Return checksummed addresses

### Memory Management Best Practices

1. **Minimize Secret Lifetime**:
   - Load keys only when needed
   - Clear immediately after use
   - Don't cache decrypted values

2. **Avoid String Operations**:

   ```typescript
   // BAD - Creates string copies
   const key = '0x' + buffer.toString('hex');

   // GOOD - Keep as buffer
   const keyBuffer = buffer;
   ```

3. **Secure Cleanup Pattern**:
   ```typescript
   let sensitiveBuffer: Buffer | null = Buffer.from(...);
   try {
     // Use sensitiveBuffer
   } finally {
     if (sensitiveBuffer) {
       sensitiveBuffer.fill(0);
       sensitiveBuffer = null;
     }
   }
   ```

## Testing Strategy

### Behavior Tests (`wallet-behavior.unit.test.ts`)

- Focus on API contracts and user-visible behavior
- Should survive implementation refactoring
- Cover all normal usage patterns

### Security Invariant Tests (`wallet-security-invariants.unit.test.ts`)

- White-box tests that verify security requirements
- FROZEN - do not modify without security review
- May break during refactoring (that's intentional)

### Heap Snapshot Tests (`heap-snapshot.unit.test.ts`)

- CI-only tests that analyze memory
- Verify secrets don't leak to heap
- Require `--expose-gc` flag

## Compliance Checklist

Before deploying or modifying wallet code:

- [ ] All security invariant tests pass
- [ ] No raw keys exposed in public API
- [ ] Private keys are validated before use
- [ ] Memory cleanup patterns are implemented
- [ ] Error messages are sanitized
- [ ] Input validation is comprehensive
- [ ] Private keys stored as Buffers, not strings
- [ ] Memory cleanup patterns are followed

## Security Incident Response

If a security issue is discovered:

1. Do not commit fixes publicly initially
2. Document the issue with severity assessment
3. Develop and test fix in private branch
4. Update security tests to prevent regression
5. Deploy fix and monitor for exploitation
6. Consider key rotation for affected users

## References

- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1559: Fee market change for ETH 1.0 chain](https://eips.ethereum.org/EIPS/eip-1559)
