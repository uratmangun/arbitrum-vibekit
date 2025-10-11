import { v7 as uuidv7 } from 'uuid';
import type { WalletClient } from 'viem';

import { EmbeddedWallet } from './embedded.js';

interface WalletConfig {
  privateKey?: string;
  chainId?: number;
}

interface ManagedWallet {
  id: string;
  address: string;
  wallet: EmbeddedWallet;
  createdAt: Date;
  lastUsed: Date;
}

export class WalletManager {
  private wallets: Map<string, ManagedWallet> = new Map();
  private defaultWalletId: string | null = null;

  /**
   * Create a new managed wallet
   */
  createWallet(config: WalletConfig = {}): string {
    const wallet = new EmbeddedWallet();

    // Initialize with private key if provided
    if (config.privateKey) {
      wallet.initialize(config.privateKey);
    } else {
      throw new Error('Private key is required for wallet creation');
    }

    const walletId = this.generateWalletId();
    const managedWallet: ManagedWallet = {
      id: walletId,
      address: wallet.getAddress(),
      wallet,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    this.wallets.set(walletId, managedWallet);

    // Set as default if first wallet
    if (this.wallets.size === 1) {
      this.defaultWalletId = walletId;
    }

    return walletId;
  }

  /**
   * Get wallet by ID
   */
  getWallet(walletId: string): EmbeddedWallet | null {
    const managed = this.wallets.get(walletId);
    if (!managed) {
      return null;
    }

    managed.lastUsed = new Date();
    return managed.wallet;
  }

  /**
   * Get default wallet
   */
  getDefaultWallet(): EmbeddedWallet | null {
    if (!this.defaultWalletId) {
      return null;
    }
    return this.getWallet(this.defaultWalletId);
  }

  /**
   * Set default wallet
   */
  setDefaultWallet(walletId: string): void {
    if (!this.wallets.has(walletId)) {
      throw new Error(`Wallet ${walletId} not found`);
    }
    this.defaultWalletId = walletId;
  }

  /**
   * List all wallets
   */
  listWallets(): Array<{ id: string; address: string; isDefault: boolean }> {
    return Array.from(this.wallets.values()).map((managed) => ({
      id: managed.id,
      address: managed.address,
      isDefault: managed.id === this.defaultWalletId,
    }));
  }

  /**
   * Get wallet by address
   */
  getWalletByAddress(address: string): EmbeddedWallet | null {
    const normalizedAddress = address.toLowerCase();

    for (const managed of Array.from(this.wallets.values())) {
      if (managed.address.toLowerCase() === normalizedAddress) {
        managed.lastUsed = new Date();
        return managed.wallet;
      }
    }

    return null;
  }

  /**
   * Remove wallet
   */
  removeWallet(walletId: string): boolean {
    const deleted = this.wallets.delete(walletId);

    // Update default if needed
    if (deleted && this.defaultWalletId === walletId) {
      const remaining = Array.from(this.wallets.keys());
      this.defaultWalletId = remaining.length > 0 ? remaining[0]! : null;
    }

    return deleted;
  }

  /**
   * Sign transaction with specific wallet
   */
  async signTransaction(
    walletId: string,
    transaction: Parameters<EmbeddedWallet['signTransaction']>[0],
  ): Promise<string> {
    const wallet = this.getWallet(walletId);
    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    return wallet.signTransaction(transaction);
  }

  /**
   * Sign message with specific wallet
   */
  async signMessage(walletId: string, message: string): Promise<string> {
    const wallet = this.getWallet(walletId);
    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    return wallet.signMessage(message);
  }

  /**
   * Get wallet client for specific wallet and chain
   */
  getWalletClient(walletId: string, chainId: number): WalletClient {
    const wallet = this.getWallet(walletId);
    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    return wallet.getWalletClient(chainId);
  }

  /**
   * Clear all wallets
   */
  clearAllWallets(): void {
    this.wallets.clear();
    this.defaultWalletId = null;
  }

  /**
   * Get wallet stats
   */
  getWalletStats(walletId: string): { createdAt: Date; lastUsed: Date } | null {
    const managed = this.wallets.get(walletId);
    if (!managed) {
      return null;
    }

    return {
      createdAt: managed.createdAt,
      lastUsed: managed.lastUsed,
    };
  }

  /**
   * Generate unique wallet ID
   */
  private generateWalletId(): string {
    return `wallet-${uuidv7()}`;
  }
}
