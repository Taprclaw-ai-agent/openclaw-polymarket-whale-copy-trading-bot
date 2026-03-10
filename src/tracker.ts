/**
 * Whale wallet tracker: monitor positions, detect new entries, trigger alerts
 */

import { getPositions, getLeaderboard } from './polymarket-api.js';
import {
  initDb,
  getWallets,
  addWallet,
  savePositionsSnapshot,
  getLastPositions,
  wasAlertSent,
  markAlertSent,
} from './storage.js';
import { broadcastWhaleAlert, sendTelegramNotification } from './alerts.js';
import type { WhaleAlert } from './types.js';

const MIN_ALERT_SIZE = Number(process.env.MIN_ALERT_SIZE) || 5000;
const MIN_ALERT_ROI = Number(process.env.MIN_ALERT_ROI) || 100;

/** Default number of top traders to fetch from Polymarket leaderboard */
const LEADERBOARD_DISCOVER_LIMIT = Number(process.env.LEADERBOARD_DISCOVER_LIMIT) || 50;

/**
 * Discover top trader addresses from Polymarket's official leaderboard.
 * Fetches the leaderboard ranked by PnL (optionally over a time period) and returns wallet addresses.
 */
export async function discoverFromPolymarketLeaderboard(opts?: {
  limit?: number;
  timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
  orderBy?: 'PNL' | 'VOL';
}): Promise<string[]> {
  const limit = opts?.limit ?? LEADERBOARD_DISCOVER_LIMIT;
  const entries = await getLeaderboard({
    category: 'OVERALL',
    timePeriod: opts?.timePeriod ?? 'ALL',
    orderBy: opts?.orderBy ?? 'PNL',
    limit: Math.min(limit, 50), // API max 50 per request
    offset: 0,
  });
  const addresses = entries
    .map((e) => e.proxyWallet?.toLowerCase())
    .filter((addr): addr is string => !!addr && /^0x[a-f0-9]{40}$/.test(addr));
  // If user wants more than 50, paginate (offset 0, 50, 100... up to API max 1000)
  if (limit > 50) {
    for (let offset = 50; offset < limit && offset < 1000; offset += 50) {
      const next = await getLeaderboard({
        category: 'OVERALL',
        timePeriod: opts?.timePeriod ?? 'ALL',
        orderBy: opts?.orderBy ?? 'PNL',
        limit: 50,
        offset,
      });
      for (const e of next) {
        const addr = e.proxyWallet?.toLowerCase();
        if (addr && /^0x[a-f0-9]{40}$/.test(addr) && !addresses.includes(addr)) {
          addresses.push(addr);
        }
      }
    }
  }
  return addresses;
}

/** Add discovered wallets from Polymarket leaderboard to tracking */
export async function refreshTrackedWallets(): Promise<number> {
  const discovered = await discoverFromPolymarketLeaderboard({
    limit: LEADERBOARD_DISCOVER_LIMIT,
    timePeriod: 'DAY', // today's top traders
    orderBy: 'PNL',
  });
  let added = 0;
  const existing = new Set(getWallets().map((w) => w.address.toLowerCase()));

  for (const addr of discovered) {
    if (!existing.has(addr)) {
      addWallet({
        address: addr,
        addedAt: Date.now(),
        source: 'leaderboard',
      });
      existing.add(addr);
      added++;
    }
  }

  if (added > 0) {
    await sendTelegramNotification(
      `📋 **Tracker update**\n\nAdded **${added}** new top traders from today's leaderboard. Total tracked: ${existing.size}.`
    );
  }
  return added;
}

/** Check a single wallet for new whale positions and alert */
async function processWallet(wallet: string): Promise<void> {
  const positions = await getPositions(wallet, {
    limit: 200,
    sortBy: 'PERCENTPNL',
  });

  const lastPositions = getLastPositions(wallet);
  const isFirstRun = lastPositions.size === 0;

  const toSnapshot: Array<{ conditionId: string }> = [];

  for (const p of positions) {
    toSnapshot.push({ conditionId: p.conditionId });

    // New position = not in last snapshot (skip on first run to avoid spam)
    const isNew = !isFirstRun && !lastPositions.has(p.conditionId);
    const sizeOk = (p.initialValue ?? p.currentValue ?? 0) >= MIN_ALERT_SIZE;
    const roiOk = (p.percentPnl ?? 0) >= MIN_ALERT_ROI;

    if (isNew && sizeOk && roiOk && !wasAlertSent(wallet, p.conditionId)) {
      const alert: WhaleAlert = {
        wallet,
        conditionId: p.conditionId,
        roi: p.percentPnl ?? 0,
        market: p.title ?? 'Unknown',
        outcome: p.outcome ?? 'Yes',
        size: p.initialValue ?? p.currentValue ?? 0,
        avgPrice: p.avgPrice ?? 0,
        cashPnl: p.cashPnl ?? 0,
        timestamp: Date.now(),
      };
      await broadcastWhaleAlert(alert);
      if (process.env.PAPER_TRADING_ENABLED === 'true') {
        const { tryOpenPaperPosition } = await import('./paper-trading.js');
        const paper = await tryOpenPaperPosition(alert);
        if (paper.opened) {
          await sendTelegramNotification(
            `📄 **Paper trade**\n\nOpened: ${alert.market.slice(0, 50)}… ${alert.outcome}\nSize: $${alert.size.toFixed(0)}\n${paper.reason}`
          );
        }
      }
      markAlertSent(wallet, p.conditionId);
    }
  }

  if (toSnapshot.length > 0) {
    savePositionsSnapshot(wallet, toSnapshot);
  }
}

/** Run one tracking cycle for all wallets */
export async function runTrackingCycle(): Promise<void> {
  initDb();
  const wallets = getWallets();
  if (wallets.length === 0) {
    console.log('No wallets tracked. Add manually or run discover (POST /api/wallets/discover).');
    return;
  }

  for (const w of wallets) {
    try {
      await processWallet(w.address);
      await new Promise((r) => setTimeout(r, 300)); // rate limit
    } catch (err) {
      console.error(`Tracker error for ${w.address}:`, (err as Error).message);
    }
  }
}
