/**
 * Paper trading: copy top-trader signals into a virtual portfolio with risk checks
 */

import { getPositions } from './polymarket-api.js';
import {
  getPaperState,
  setPaperBalance,
  addPaperPosition,
  removePaperPosition,
  addPaperTrade,
  addPaperDailyPnl,
  getPaperPositions,
} from './storage.js';
import { runRiskCheck } from './risk.js';
import type { WhaleAlert } from './types.js';

const PAPER_ENABLED = process.env.PAPER_TRADING_ENABLED === 'true';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Try to open a paper position from a whale alert. Runs risk (rules + optional AI), then books the trade. */
export async function tryOpenPaperPosition(alert: WhaleAlert): Promise<{ opened: boolean; reason: string }> {
  if (!PAPER_ENABLED) return { opened: false, reason: 'Paper trading disabled' };

  const { balance, positions, dailyPnl } = getPaperState();
  const dateKey = todayKey();
  const dailyPnlToday = getPaperState().dailyPnl[dateKey] ?? 0;

  const input = {
    wallet: alert.wallet,
    marketTitle: alert.market,
    outcome: alert.outcome,
    size: alert.size,
    avgPrice: alert.avgPrice,
    whaleRoi: alert.roi,
    paperBalance: balance,
    existingExposure: 0, // could sum positions in same conditionId
    openPositionsCount: positions.length,
  };

  const risk = await runRiskCheck(input, balance, dailyPnlToday, positions.length);
  if (!risk.pass) return { opened: false, reason: risk.reason };

  const size = risk.sizeLimit ?? alert.size;
  const entryValue = size;
  if (balance < entryValue) return { opened: false, reason: 'Insufficient paper balance' };

  const conditionId = alert.conditionId || `${alert.wallet}-${alert.market}-${alert.outcome}`.slice(0, 200);
  addPaperPosition({
    conditionId,
    copiedFromWallet: alert.wallet,
    marketTitle: alert.market,
    outcome: alert.outcome,
    entryPrice: alert.avgPrice,
    size,
    entryValue,
    openedAt: alert.timestamp,
  });
  setPaperBalance(balance - entryValue);
  addPaperTrade({
    conditionId,
    copiedFromWallet: alert.wallet,
    marketTitle: alert.market,
    outcome: alert.outcome,
    side: 'OPEN',
    price: alert.avgPrice,
    size,
    value: entryValue,
    timestamp: alert.timestamp,
  });

  return { opened: true, reason: risk.reason };
}

/** Enrich paper positions with current price from the copied wallet (if they still hold). */
async function getCurrentPriceForPosition(
  copiedFromWallet: string,
  marketTitle: string,
  outcome: string
): Promise<number | null> {
  try {
    const positions = await getPositions(copiedFromWallet, { limit: 100 });
    const match = positions.find(
      (p) => (p.title === marketTitle || p.slug?.includes(marketTitle.slice(0, 20))) && p.outcome === outcome
    );
    return match?.curPrice ?? null;
  } catch {
    return null;
  }
}

/** Get paper portfolio with optional mark-to-market (unrealized P&L). */
export async function getPaperPortfolio(markToMarket = false): Promise<{
  enabled: boolean;
  initialBalance: number;
  balance: number;
  totalUnrealizedPnl: number;
  dailyPnl: number;
  positions: Array<{
    conditionId: string;
    copiedFromWallet: string;
    marketTitle: string;
    outcome: string;
    entryPrice: number;
    size: number;
    entryValue: number;
    currentValue?: number;
    unrealizedPnl?: number;
    openedAt: number;
  }>;
  tradesCount: number;
}> {
  const state = getPaperState();
  const { getPaperTrades } = await import('./storage.js');
  const trades = getPaperTrades(1000);

  const positions = [...state.positions];
  let totalUnrealizedPnl = 0;

  if (markToMarket && positions.length > 0) {
    for (const pos of positions) {
      const cur = await getCurrentPriceForPosition(pos.copiedFromWallet, pos.marketTitle, pos.outcome);
      if (cur != null) {
        const currentValue = pos.size * cur;
        const unrealizedPnl = currentValue - pos.entryValue;
        totalUnrealizedPnl += unrealizedPnl;
        (pos as Record<string, unknown>).currentValue = currentValue;
        (pos as Record<string, unknown>).unrealizedPnl = unrealizedPnl;
      }
    }
  }

  const dateKey = todayKey();
  const dailyPnl = state.dailyPnl[dateKey] ?? 0;

  return {
    enabled: PAPER_ENABLED,
    initialBalance: state.initialBalance,
    balance: state.balance,
    totalUnrealizedPnl,
    dailyPnl,
    positions: positions.map((p) => ({
      ...p,
      currentValue: (p as Record<string, unknown>).currentValue as number | undefined,
      unrealizedPnl: (p as Record<string, unknown>).unrealizedPnl as number | undefined,
    })),
    tradesCount: trades.length,
  };
}

export function isPaperTradingEnabled(): boolean {
  return PAPER_ENABLED;
}
