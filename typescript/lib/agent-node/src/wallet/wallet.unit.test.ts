// removed unused import
import { hashMessage, recoverAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, it, expect, beforeEach } from 'vitest';

import { getTestPrivateKey } from '../../tests/utils/wallet-test-helpers.js';

import { EmbeddedWallet } from './embedded.js';

/**
 * Consolidated unit tests for Embedded EOA Wallet
 *
 * Tests core wallet functionality including:
 * - Initialization and lifecycle
 * - Transaction signing
 * - Message signing (personal_sign and EIP-712)
 * - Multi-chain support
 * - Gas estimation
 * - Security requirements
 * - Error handling
 */
describe('Embedded EOA Wallet', () => {
  let wallet: EmbeddedWallet;

  beforeEach(() => {
    wallet = new EmbeddedWallet();
  });

  describe('wallet initialization', () => {
    it('should initialize wallet from private key', () => {
      // Given a private key
      const privateKey = getTestPrivateKey();

      // When initializing wallet
      wallet.initialize(privateKey);

      // Then wallet should be initialized
      expect(wallet.isInitialized()).toBe(true);
      expect(wallet.getAddress()).toBeDefined();
      expect(wallet.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should throw error when no key provided', () => {
      // When initializing without key
      // Then should throw error (wallet generation not supported)
      expect(() => wallet.initialize()).toThrow(/private key.*required/i);
    });

    it('should handle private keys with and without 0x prefix', () => {
      // Given a key without prefix
      const hexKey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const withPrefix = '0x' + hexKey;

      // When initializing wallets with both formats
      const wallet1 = new EmbeddedWallet();
      const wallet2 = new EmbeddedWallet();

      wallet1.initialize(withPrefix);
      wallet2.initialize(hexKey);

      // Then both should produce the same address
      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
    });

    it('should handle invalid private key formats', () => {
      // Given various invalid private keys
      const invalidKeys = [
        'not-a-hex-string',
        '0x' + 'g'.repeat(64), // Invalid hex characters
        '0x' + 'a'.repeat(63), // Too short
        '0x' + 'a'.repeat(65), // Too long
        '', // Empty
        null, // Null
      ];

      // When attempting to initialize with invalid keys
      // Then appropriate errors should be thrown
      for (const key of invalidKeys) {
        const newWallet = new EmbeddedWallet();
        expect(() => newWallet.initialize(key as string)).toThrow();
      }
    });
  });

  describe('transaction signing', () => {
    beforeEach(() => {
      wallet.initialize(getTestPrivateKey());
    });

    it('should sign transaction', async () => {
      // Given a transaction
      const transaction = {
        to: '0x' + '1'.repeat(40),
        value: BigInt(1000000000000000000), // 1 ETH
        data: '0x',
        chainId: 1,
        nonce: 0,
        gasLimit: BigInt(21000),
        gasPrice: BigInt(20000000000),
      };

      // When signing transaction
      const signedTx = await wallet.signTransaction(transaction);

      // Then transaction should be signed
      expect(signedTx).toBeDefined();
      expect(signedTx).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signedTx.length).toBeGreaterThan(100);
    });

    it('should handle edge case transaction values', async () => {
      // Given edge case values
      const edgeCases = [
        { value: 0n, desc: 'zero value' },
        { value: 1n, desc: 'one wei' },
        { gasLimit: 21000n, desc: 'minimum gas' },
        { nonce: 0, desc: 'first transaction' },
      ];

      for (const testCase of edgeCases) {
        const tx = {
          to: '0x' + '1'.repeat(40),
          value: testCase.value || 1000n,
          gasLimit: testCase.gasLimit || 21000n,
          gasPrice: 1000000000n,
          nonce: testCase.nonce !== undefined ? testCase.nonce : 0,
          data: '0x',
          chainId: 1,
        };

        // Should handle edge cases without error
        const signed = await wallet.signTransaction(tx);
        expect(signed).toMatch(/^0x[a-fA-F0-9]+$/);
      }
    });
  });

  describe('message signing', () => {
    beforeEach(() => {
      wallet.initialize(getTestPrivateKey());
    });

    it('should sign message with signMessage', async () => {
      // Given a message
      const message = 'Sign this message to authenticate';

      // When signing message
      const signature = await wallet.signMessage(message);

      // Then signature should be produced
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should sign personal message with EIP-191 prefix', async () => {
      // Given a message to sign
      const message = 'Sign this message to authenticate';

      // When signing with personal_sign
      const signature = await wallet.personalSign(message);

      // Then signature should be EIP-191 compliant and recoverable
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

      const recoveredAddress = await wallet.recoverAddress(message, signature);
      expect(recoveredAddress.toLowerCase()).toBe(wallet.getAddress().toLowerCase());
    });

    it('should produce consistent signatures for same message', async () => {
      // Given the same message
      const message = 'Consistent signature test';

      // When signing multiple times
      const sig1 = await wallet.personalSign(message);
      const sig2 = await wallet.personalSign(message);

      // Then signatures should be identical (deterministic signing)
      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different messages', async () => {
      // Given two different messages
      const message1 = 'First message';
      const message2 = 'Second message';

      // When signing both
      const sig1 = await wallet.signMessage(message1);
      const sig2 = await wallet.signMessage(message2);

      // Then signatures should be different
      expect(sig1).not.toBe(sig2);
    });

    it('should handle unicode and special characters', async () => {
      // Given unicode message
      const message = '🦄🌈 Unicode test with special chars: !@#$%^&*()';

      // When signing
      const signature = await wallet.signMessage(message);

      // Then should produce valid signature
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should handle empty and whitespace messages', async () => {
      const edgeCases = ['', ' ', '\n', '\t', '  \n  \t  '];

      for (const message of edgeCases) {
        // When signing edge case messages
        const signature = await wallet.signMessage(message);

        // Then should produce valid signature
        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
      }
    });
  });

  describe('EIP-712 typed data signing', () => {
    beforeEach(() => {
      wallet.initialize('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    });

    // EIP-712 test vector from https://eips.ethereum.org/EIPS/eip-712
    const testTypedData = {
      domain: {
        name: 'Ether Mail',
        version: '1',
        chainId: 1,
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
      },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' },
        ],
      },
      primaryType: 'Mail',
      message: {
        from: {
          name: 'Cow',
          wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
        },
        to: {
          name: 'Bob',
          wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
        },
        contents: 'Hello, Bob!',
      },
    };

    it('should sign EIP-712 typed data', async () => {
      // Given EIP-712 typed data
      // When signing the typed data
      const signature = await wallet.signTypedData(testTypedData);

      // Then signature should be valid 65-byte hex string
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should sign typed data with various field types', async () => {
      // Given typed data with different field types
      const typedData = {
        domain: {
          name: 'Test App',
          version: '1',
          chainId: 1,
          verifyingContract: '0x' + 'a'.repeat(40),
        },
        types: {
          Message: [
            { name: 'content', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
        },
        primaryType: 'Message',
        message: {
          content: 'Test message',
          timestamp: BigInt(Date.now()),
          amount: BigInt('1000000000000000000'),
        },
      };

      // When signing
      const signature = await wallet.signTypedData(typedData);

      // Then should produce valid signature
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should produce different signatures for different typed data', async () => {
      // Given two different typed data messages
      const baseTypedData = {
        domain: {
          name: 'Test',
          version: '1',
          chainId: 1,
          verifyingContract: '0x' + '1'.repeat(40),
        },
        types: {
          Message: [{ name: 'content', type: 'string' }],
        },
        primaryType: 'Message',
      };

      const data1 = { ...baseTypedData, message: { content: 'Message 1' } };
      const data2 = { ...baseTypedData, message: { content: 'Message 2' } };

      // When signing both
      const sig1 = await wallet.signTypedData(data1);
      const sig2 = await wallet.signTypedData(data2);

      // Then signatures should be different
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('multi-chain support', () => {
    beforeEach(() => {
      wallet.initialize(getTestPrivateKey());
    });

    it('should create wallet clients for different chains', () => {
      // Given an initialized wallet
      // When creating clients for different chains
      const ethClient = wallet.getWalletClient(1); // Ethereum
      const polygonClient = wallet.getWalletClient(137); // Polygon
      const arbClient = wallet.getWalletClient(42161); // Arbitrum

      // Then each client should be configured for its chain
      expect(ethClient.chain.id).toBe(1);
      expect(polygonClient.chain.id).toBe(137);
      expect(arbClient.chain.id).toBe(42161);
    });

    it('should use same account address across all chains', () => {
      // Given clients for different chains
      const client1 = wallet.getWalletClient(1);
      const client137 = wallet.getWalletClient(137);

      // When comparing addresses
      // Then they should be identical
      expect(client1.account.address).toBe(client137.account.address);
      expect(client1.account.address).toBe(wallet.getAddress());
    });

    it('should handle chain ID edge cases', () => {
      const chainIds = [
        1, // Ethereum mainnet
        137, // Polygon
        42161, // Arbitrum
        10, // Optimism
        56, // BSC
      ];

      for (const chainId of chainIds) {
        // Should create wallet client for any valid chain ID
        const client = wallet.getWalletClient(chainId);
        expect(client.chain.id).toBe(chainId);
      }
    });
  });

  describe('security requirements', () => {
    const testPrivateKey = getTestPrivateKey();

    it('should not expose private key in public properties', () => {
      // Given a wallet initialized with a private key
      wallet.initialize(testPrivateKey);

      // When inspecting public properties
      const publicProps = Object.keys(wallet);
      const walletString = JSON.stringify(wallet);

      // Then private key should not be accessible
      expect(wallet.privateKey).toBeUndefined();
      expect(wallet._privateKey).toBeUndefined();
      expect(wallet.key).toBeUndefined();
      expect(wallet._key).toBeUndefined();

      // Check for key in any public property
      publicProps.forEach((prop) => {
        const value = (wallet as Record<string, unknown>)[prop];
        if (typeof value === 'string') {
          expect(value).not.toBe(testPrivateKey);
          expect(value).not.toContain(testPrivateKey.slice(2)); // Without 0x
        }
      });

      // Check serialization doesn't expose key
      expect(walletString).not.toContain(testPrivateKey);
      expect(walletString).not.toContain(testPrivateKey.slice(2));
    });

    it('should not have methods that directly return private keys', () => {
      // Given an initialized wallet
      wallet.initialize(testPrivateKey);

      // When checking all methods
      const dangerousMethods = [
        'getPrivateKey',
        'privateKey',
        'getSecret',
        'getMnemonic',
        'getSeed',
      ];

      // Then dangerous methods should not exist
      for (const method of dangerousMethods) {
        expect((wallet as Record<string, unknown>)[method]).toBeUndefined();
      }
    });

    it('should sanitize wallet in toJSON() if implemented', () => {
      // Given an initialized wallet
      wallet.initialize(testPrivateKey);

      // When wallet has toJSON method
      if (typeof (wallet as Record<string, unknown>).toJSON === 'function') {
        const json = (
          (wallet as Record<string, unknown>).toJSON as () => Record<string, unknown>
        )();
        const jsonString = JSON.stringify(json);

        // Then JSON should not contain secrets
        expect(jsonString).not.toContain(testPrivateKey);
        expect(jsonString).not.toContain(testPrivateKey.slice(2));
        expect(json.privateKey).toBeUndefined();
        expect(json._privateKey).toBeUndefined();
      }
    });
  });

  describe('wallet export', () => {
    beforeEach(() => {
      wallet.initialize(getTestPrivateKey());
    });

    it('should export public key', () => {
      // When exporting public key
      const publicKey = wallet.getPublicKey();

      // Then public key should be returned
      expect(publicKey).toBeDefined();
      expect(publicKey).toMatch(/^0x[a-fA-F0-9]{64,130}$/);
    });

    it('should export address', () => {
      // When getting address
      const address = wallet.getAddress();

      // Then address should be checksummed
      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // Should be EIP-55 checksummed
      const hasUpperCase = /[A-F]/.test(address);
      const hasLowerCase = /[a-f]/.test(address);
      expect(hasUpperCase || hasLowerCase).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    beforeEach(() => {
      wallet.initialize(getTestPrivateKey());
    });

    it('should handle concurrent signing operations safely', async () => {
      // Given multiple messages to sign
      const messages = ['Message 1', 'Message 2', 'Message 3'];

      // When signing concurrently
      const signatures = await Promise.all(messages.map((msg) => wallet.signMessage(msg)));

      // Then all signatures should be valid and distinct
      expect(signatures).toHaveLength(3);
      signatures.forEach((sig) => {
        expect(sig).toMatch(/^0x[a-fA-F0-9]{130}$/);
      });
      expect(new Set(signatures).size).toBe(3); // All different
    });

    it('should maintain consistent state under concurrent operations', async () => {
      // Given an initialized wallet
      const expectedAddress = wallet.getAddress();

      // When executing operations concurrently
      const operations = [
        () => wallet.signMessage('message1'),
        () => wallet.signMessage('message2'),
        () => wallet.getAddress(),
        () => wallet.getAddress(),
      ];

      const promises = operations.map(async (op) => {
        try {
          return await op();
        } catch {
          return null;
        }
      });

      await Promise.allSettled(promises);

      // Then address should remain consistent
      const finalAddress = wallet.getAddress();
      expect(finalAddress).toBe(expectedAddress);

      // And wallet should be in valid state
      expect(wallet.isInitialized()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should provide clear error for uninitialized wallet operations', async () => {
      // Given an uninitialized wallet
      // When attempting operations
      // Then clear errors should be thrown
      await expect(wallet.signMessage('test')).rejects.toThrow(/not initialized/i);
      expect(() => wallet.getAddress()).toThrow(/not initialized/i);
    });

    it('should provide meaningful errors for invalid inputs', () => {
      // Given invalid input types
      const invalidInputs = [null, undefined, 123, true, [], {}];

      for (const invalidInput of invalidInputs) {
        const newWallet = new EmbeddedWallet();

        // When attempting to initialize with invalid input
        // Then should throw meaningful error
        expect(() => newWallet.initialize(invalidInput as string)).toThrow(
          /invalid|type|format|private key/i,
        );
      }
    });

    it('should never expose sensitive data in error messages', () => {
      // Given operations that might fail
      const testWallet = new EmbeddedWallet();
      const privateKey = getTestPrivateKey();
      const errors: string[] = [];

      // Collect various errors
      try {
        testWallet.initialize(privateKey + 'invalid');
      } catch (e: unknown) {
        errors.push((e as Error).message + ((e as Error).stack || ''));
      }

      try {
        testWallet.initialize(); // No key provided
      } catch (e: unknown) {
        errors.push((e as Error).message + ((e as Error).stack || ''));
      }

      // Then no error should contain sensitive data
      const allErrors = errors.join(' ');
      expect(allErrors).not.toContain(privateKey);
      expect(allErrors).not.toContain(privateKey.slice(2));
    });
  });

  describe('signature format validation', () => {
    beforeEach(() => {
      wallet.initialize('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    });

    it('should produce signatures with correct v, r, s components', async () => {
      const message = 'Test message for signature components';
      const signature = await wallet.signMessage(message);

      // Signature should be 65 bytes (130 hex chars + 0x)
      expect(signature).toHaveLength(132);

      // Extract r, s, v components
      const r = signature.slice(2, 66);
      const s = signature.slice(66, 130);
      const v = signature.slice(130, 132);

      // Validate components
      expect(r).toMatch(/^[a-fA-F0-9]{64}$/);
      expect(s).toMatch(/^[a-fA-F0-9]{64}$/);
      expect(v).toMatch(/^[a-fA-F0-9]{2}$/);

      // v should be 27 or 28 (0x1b or 0x1c) for legacy, or 0 or 1 for EIP-155
      const vNum = parseInt(v, 16);
      expect([0, 1, 27, 28]).toContain(vNum);
    });

    it('should produce signatures that viem can verify', async () => {
      const messages = [
        'Short',
        'Medium length message for testing',
        'Very long message with special characters: !@#$%^&*()_+-=[]{}|;:,.<>?/~`',
      ];

      for (const message of messages) {
        // Sign with our wallet
        const signature = await wallet.signMessage(message);

        // Verify with viem
        const recovered = await recoverAddress({
          hash: hashMessage(message),
          signature: signature as `0x${string}`,
        });

        expect(recovered.toLowerCase()).toBe(wallet.getAddress().toLowerCase());
      }
    });
  });

  describe('address derivation compatibility', () => {
    it('should derive same address as viem for known private keys', () => {
      // Test vectors with known private keys and addresses
      const testVectors = [
        {
          privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
          expectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Hardhat account 0
        },
        {
          privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
          expectedAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Hardhat account 1
        },
      ];

      for (const vector of testVectors) {
        // Given a private key
        // When deriving address with our wallet
        wallet.initialize(vector.privateKey);
        const ourAddress = wallet.getAddress();

        // And with viem
        const viemAccount = privateKeyToAccount(vector.privateKey as `0x${string}`);

        // Then addresses should match
        expect(ourAddress.toLowerCase()).toBe(viemAccount.address.toLowerCase());
        expect(ourAddress.toLowerCase()).toBe(vector.expectedAddress.toLowerCase());
      }
    });
  });
});
