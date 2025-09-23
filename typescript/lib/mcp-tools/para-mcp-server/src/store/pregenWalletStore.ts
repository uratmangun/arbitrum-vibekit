import { randomUUID } from 'node:crypto';

export type PregenIdentifierKey = string;

export interface StoredPregenWallet {
  recordId: string;
  walletId: string;
  address?: string;
  walletType: string;
  identifierKey: PregenIdentifierKey;
  identifierValue: string;
  userShareJson: string;
  createdAt: string;
  claimedAt?: string;
  recoverySecret?: string;
  lastUsedAt?: string;
  lastOperation?: string;
  rawWallet: unknown;
}

const STORE: StoredPregenWallet[] = [];

export function addPregenWallet(entry: Omit<StoredPregenWallet, 'recordId' | 'createdAt'>): StoredPregenWallet {
  const stored: StoredPregenWallet = {
    ...entry,
    recordId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  STORE.push(stored);
  return stored;
}

export function findPregenWallet(identifierKey: PregenIdentifierKey, identifierValue: string): StoredPregenWallet | undefined {
  return STORE.find((wallet) => wallet.identifierKey === identifierKey && wallet.identifierValue === identifierValue);
}

export function listPregenWallets(): StoredPregenWallet[] {
  return STORE.map((wallet) => ({ ...wallet }));
}

export function markPregenWalletClaimed(params: {
  identifierKey: PregenIdentifierKey;
  identifierValue: string;
  recoverySecret?: string;
}): StoredPregenWallet | undefined {
  const entry = findPregenWallet(params.identifierKey, params.identifierValue);
  if (!entry) {
    return undefined;
  }
  entry.claimedAt = new Date().toISOString();
  entry.recoverySecret = params.recoverySecret;
  entry.lastOperation = 'claim';
  entry.lastUsedAt = entry.claimedAt;
  return { ...entry };
}

export function touchPregenWallet(params: {
  identifierKey: PregenIdentifierKey;
  identifierValue: string;
  operation: string;
}): StoredPregenWallet | undefined {
  const entry = findPregenWallet(params.identifierKey, params.identifierValue);
  if (!entry) {
    return undefined;
  }
  entry.lastOperation = params.operation;
  entry.lastUsedAt = new Date().toISOString();
  return { ...entry };
}
