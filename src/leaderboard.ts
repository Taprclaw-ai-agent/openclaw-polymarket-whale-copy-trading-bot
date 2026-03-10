/**
 * Leaderboard: rank wallets by PnL / ROI
 */

import { getPositions, getValue } from './polymarket-api.js';
import { getWallets, updateLeaderboardCache } from './storage.js';
import type { LeaderboardEntry } from './types.js';

export async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const wallets = getWallets();
  const entries: LeaderboardEntry[] = [];

  for (const w of wallets) {
    try {
      const [positions, totalValue] = await Promise.all([
        getPositions(w.address, { limit: 500 }),
        getValue(w.address),
      ]);

      const totalPnl = positions.reduce((sum, p) => sum + (p.cashPnl ?? 0), 0);
      const totalInitial = positions.reduce((sum, p) => sum + (p.initialValue ?? 0), 0);
      const roi = totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0;

      entries.push({
        wallet: w.address,
        alias: w.alias,
        totalPnl,
        roi,
        positionsCount: positions.length,
        totalValue,
      });
    } catch (err) {
      console.warn(`Failed to fetch wallet ${w.address}:`, (err as Error).message);
    }
  }

  entries.sort((a, b) => b.totalPnl - a.totalPnl);
  updateLeaderboardCache(entries);

  return entries;
}
