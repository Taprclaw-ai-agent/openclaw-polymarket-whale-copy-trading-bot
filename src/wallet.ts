/**
 * Derive wallet address from private key (for paper trading account identity).
 * Key is never logged or exposed; only the public address is used.
 */

import { Wallet } from 'ethers';

let cachedPaperWalletAddress: string | null = null;

/**
 * Get the Ethereum address for the paper trading account from PAPER_TRADING_PRIVATE_KEY.
 * Returns null if the env var is not set or invalid.
 */
export function getPaperWalletAddress(): string | null {
  if (cachedPaperWalletAddress !== null) return cachedPaperWalletAddress;
  const key = process.env.PAPER_TRADING_PRIVATE_KEY?.trim();
  if (!key) return null;
  try {
    const wallet = new Wallet(key);
    cachedPaperWalletAddress = wallet.address.toLowerCase();
    return cachedPaperWalletAddress;
  } catch {
    return null;
  }
}

/**
 * Check if paper trading private key is configured (and valid).
 */
export function hasPaperTradingKey(): boolean {
  return getPaperWalletAddress() != null;
}
