import { describe, it, expect, beforeEach } from 'vitest';

import { EmbeddedWallet } from '../../src/wallet/embedded.js';
import { getTestPrivateKey } from '../utils/wallet-test-helpers.js';

/**
 * Integration tests for Embedded EOA Wallet
 *
 * Tests wallet interactions with external systems via RPC calls:
 * - Gas price fetching
 * - EIP-1559 fee data retrieval
 *
 * These tests use MSW to intercept RPC calls, making them integration tests
 * rather than pure unit tests.
 */
describe('Embedded EOA Wallet - RPC Integration', () => {
  let wallet: EmbeddedWallet;

  beforeEach(() => {
    wallet = new EmbeddedWallet();
    wallet.initialize(getTestPrivateKey());
  });

  describe('gas estimation via RPC', () => {
    it('should get current gas price', async () => {
      // Given an initialized wallet connected to mainnet
      // When fetching current gas price via eth_gasPrice RPC
      const gasPrice = await wallet.getGasPrice();

      // Then valid gas price should be returned from mocked RPC
      expect(typeof gasPrice).toBe('bigint');
      expect(gasPrice).toBeGreaterThan(BigInt(0));
      // MSW mock returns recorded value from eth.merkle.io (0x7b88268 = 129532520 wei ≈ 0.130 gwei)
      expect(gasPrice).toBe(BigInt('0x7b88268'));
    });

    it('should get EIP-1559 fee data', async () => {
      // Given an initialized wallet connected to mainnet
      // When fetching EIP-1559 fee data via eth_getBlockByNumber RPC
      const feeData = await wallet.getFeeData();

      // Then complete fee data should be returned from mocked RPC
      expect(feeData).toBeDefined();
      expect(typeof feeData.maxFeePerGas).toBe('bigint');
      expect(typeof feeData.maxPriorityFeePerGas).toBe('bigint');
      expect(feeData.maxFeePerGas).toBeGreaterThanOrEqual(feeData.maxPriorityFeePerGas);

      // MSW mock returns baseFeePerGas from recorded eth.merkle.io response (0x7b880d0)
      // Implementation adds 2 gwei priority fee
      // maxFeePerGas = baseFee * 2 + maxPriorityFee
      const expectedBaseFee = BigInt('0x7b880d0');
      const expectedPriorityFee = BigInt(2000000000); // 2 gwei from implementation
      const expectedMaxFee = expectedBaseFee * 2n + expectedPriorityFee;

      expect(feeData.maxPriorityFeePerGas).toBe(expectedPriorityFee);
      expect(feeData.maxFeePerGas).toBe(expectedMaxFee);
    });
  });
});
