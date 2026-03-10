/**
 * JSON file storage for wallets, positions history, subscriptions, paper trading
 * No native deps - works everywhere
 */

import path from 'path';
import fs from 'fs';
import type { TrackedWallet, PaperPosition, PaperTrade } from './types.js';

const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'whale-tracker.json');

interface DbSchema {
  wallets: TrackedWallet[];
  /** wallet -> [{ snapshotAt, conditionIds }] - keep last 2 runs for diff */
  positionSnapshots: Record<string, Array<{ snapshotAt: number; conditionIds: string[] }>>;
  whaleAlertsSent: Array<{ wallet: string; conditionId: string }>;
  subscriptions: Array<{ channel: string; type: string }>;
  leaderboardCache: Array<{
    wallet: string;
    totalPnl: number;
    roi: number;
    positionsCount: number;
    totalValue: number;
  }>;
  /** Paper trading */
  paperInitialBalance: number;
  paperBalance: number;
  paperPositions: PaperPosition[];
  paperTrades: PaperTrade[];
  /** For daily loss limit: date string (YYYY-MM-DD) -> cumulative PnL that day */
  paperDailyPnl: Record<string, number>;
}

const emptyDb: DbSchema = {
  wallets: [],
  positionSnapshots: {},
  whaleAlertsSent: [],
  subscriptions: [],
  leaderboardCache: [],
  paperInitialBalance: 100000,
  paperBalance: 100000,
  paperPositions: [],
  paperTrades: [],
  paperDailyPnl: {},
};

let db: DbSchema | null = null;

function load(): DbSchema {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DbSchema>;
    db = { ...emptyDb, ...parsed };
    if (db.paperBalance == null) db.paperBalance = db.paperInitialBalance ?? emptyDb.paperInitialBalance;
    if (db.paperPositions == null) db.paperPositions = [];
    if (db.paperTrades == null) db.paperTrades = [];
    if (db.paperDailyPnl == null) db.paperDailyPnl = {};
  } catch {
    db = { ...emptyDb };
  }
  return db;
}

function save(): void {
  if (!db) return;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

export function initDb(): void {
  load();
}

// Wallets
export function addWallet(wallet: TrackedWallet): void {
  const d = load();
  const addr = wallet.address.toLowerCase();
  const idx = d.wallets.findIndex((w) => w.address.toLowerCase() === addr);
  const entry = {
    ...wallet,
    address: addr,
  };
  if (idx >= 0) d.wallets[idx] = entry;
  else d.wallets.push(entry);
  save();
}

export function getWallets(): TrackedWallet[] {
  return [...load().wallets];
}

export function removeWallet(address: string): void {
  const d = load();
  const addr = address.toLowerCase();
  d.wallets = d.wallets.filter((w) => w.address.toLowerCase() !== addr);
  delete d.positionSnapshots[addr];
  d.whaleAlertsSent = d.whaleAlertsSent.filter((a) => a.wallet.toLowerCase() !== addr);
  save();
}

// Position snapshots - keep last 2 runs for new-position detection
export function savePositionsSnapshot(
  wallet: string,
  positions: Array<{ conditionId: string }>
): void {
  const d = load();
  const addr = wallet.toLowerCase();
  const now = Date.now();
  const snaps = d.positionSnapshots[addr] ?? [];
  snaps.push({ snapshotAt: now, conditionIds: positions.map((p) => p.conditionId) });
  d.positionSnapshots[addr] = snaps.slice(-2); // keep only last 2
  save();
}

/** Returns condition IDs from the *previous* run (for detecting new positions) */
export function getLastPositions(wallet: string): Map<string, { conditionId: string }> {
  const d = load();
  const addr = wallet.toLowerCase();
  const snaps = d.positionSnapshots[addr] ?? [];
  if (snaps.length < 2) return new Map(); // first run or only one snapshot
  const prev = snaps[snaps.length - 2]; // second-to-last
  const map = new Map<string, { conditionId: string }>();
  for (const cid of prev.conditionIds) {
    map.set(cid, { conditionId: cid });
  }
  return map;
}

export function wasAlertSent(wallet: string, conditionId: string): boolean {
  const d = load();
  const addr = wallet.toLowerCase();
  return d.whaleAlertsSent.some(
    (a) => a.wallet.toLowerCase() === addr && a.conditionId === conditionId
  );
}

export function markAlertSent(wallet: string, conditionId: string): void {
  const d = load();
  const addr = wallet.toLowerCase();
  if (!d.whaleAlertsSent.some((a) => a.wallet.toLowerCase() === addr && a.conditionId === conditionId)) {
    d.whaleAlertsSent.push({ wallet: addr, conditionId });
  }
  save();
}

// Subscriptions
export function addSubscription(channel: string, type: 'telegram' | 'discord'): void {
  const d = load();
  if (!d.subscriptions.some((s) => s.channel === channel && s.type === type)) {
    d.subscriptions.push({ channel, type });
  }
  save();
}

export function getSubscriptions(): Array<{ channel: string; type: string }> {
  return [...load().subscriptions];
}

// Leaderboard cache
export function updateLeaderboardCache(entries: Array<{
  wallet: string;
  totalPnl: number;
  roi: number;
  positionsCount: number;
  totalValue: number;
}>): void {
  const d = load();
  d.leaderboardCache = entries.map((e) => ({
    ...e,
    wallet: e.wallet.toLowerCase(),
  }));
  save();
}

export function getLeaderboardCache(): Array<{
  wallet: string;
  totalPnl: number;
  roi: number;
  positionsCount: number;
  totalValue: number;
}> {
  return [...load().leaderboardCache];
}

// Paper trading
export function getPaperState(): {
  initialBalance: number;
  balance: number;
  positions: PaperPosition[];
  dailyPnl: Record<string, number>;
} {
  const d = load();
  return {
    initialBalance: d.paperInitialBalance,
    balance: d.paperBalance,
    positions: [...d.paperPositions],
    dailyPnl: { ...d.paperDailyPnl },
  };
}

export function setPaperBalance(balance: number): void {
  const d = load();
  d.paperBalance = balance;
  save();
}

export function addPaperPosition(pos: PaperPosition): void {
  const d = load();
  d.paperPositions.push(pos);
  save();
}

export function removePaperPosition(conditionId: string): void {
  const d = load();
  d.paperPositions = d.paperPositions.filter((p) => p.conditionId !== conditionId);
  save();
}

export function getPaperPositions(): PaperPosition[] {
  return [...load().paperPositions];
}

export function addPaperTrade(trade: PaperTrade): void {
  const d = load();
  d.paperTrades.push(trade);
  save();
}

export function getPaperTrades(limit?: number): PaperTrade[] {
  const list = [...load().paperTrades].reverse();
  return limit ? list.slice(0, limit) : list;
}

export function addPaperDailyPnl(dateKey: string, pnlDelta: number): void {
  const d = load();
  d.paperDailyPnl[dateKey] = (d.paperDailyPnl[dateKey] ?? 0) + pnlDelta;
  save();
}

export function getPaperDailyPnl(dateKey: string): number {
  return load().paperDailyPnl[dateKey] ?? 0;
}

export function resetPaperPortfolio(initialBalance: number): void {
  const d = load();
  d.paperInitialBalance = initialBalance;
  d.paperBalance = initialBalance;
  d.paperPositions = [];
  d.paperTrades = [];
  d.paperDailyPnl = {};
  save();
}
