/**
 * API Server: leaderboard, wallet analytics, subscription management
 * Monetization: subscription required for alerts; API for leaderboard
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { initDb, getWallets, addWallet, removeWallet, getSubscriptions, addSubscription, getLeaderboardCache, resetPaperPortfolio, getPaperTrades } from './storage.js';
import { computeLeaderboard } from './leaderboard.js';
import { getPositions, getValue, getTrades } from './polymarket-api.js';
import { refreshTrackedWallets } from './tracker.js';
import { getPaperPortfolio, isPaperTradingEnabled } from './paper-trading.js';

initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Dashboard static files + SPA fallback for /dashboard/addr/:address
const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard');
app.use('/dashboard', express.static(dashboardPath));
app.get('/dashboard', (_req, res) => res.redirect('/dashboard/'));
app.get('/dashboard/addr/:address', (_req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});
app.get('/', (_req, res) => res.redirect('/dashboard/'));

const PORT = Number(process.env.PORT) || 3001;

// --- Leaderboard (public / gated by subscription) ---
app.get('/api/leaderboard', async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    let entries = getLeaderboardCache();
    if (refresh || entries.length === 0) {
      entries = await computeLeaderboard();
    }
    res.json({ leaderboard: entries });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Wallet analytics ---
app.get('/api/wallet/:address', async (req, res) => {
  const address = req.params.address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  try {
    const [positions, value, trades] = await Promise.all([
      getPositions(address, { limit: 500 }),
      getValue(address),
      getTrades(address, { limit: 50 }),
    ]);
    const totalPnl = positions.reduce((s, p) => s + (p.cashPnl ?? 0), 0);
    const totalInitial = positions.reduce((s, p) => s + (p.initialValue ?? 0), 0);
    const roi = totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0;
    res.json({
      address,
      totalValue: value,
      totalPnl,
      roi,
      positionsCount: positions.length,
      positions: positions,
      recentTrades: trades.length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Tracked wallets (admin) ---
app.get('/api/wallets', (req, res) => {
  res.json({ wallets: getWallets() });
});

app.post('/api/wallets', (req, res) => {
  const { address, alias } = req.body;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  addWallet({ address: address.toLowerCase(), alias, addedAt: Date.now(), source: 'manual' });
  res.json({ ok: true });
});

app.delete('/api/wallets/:address', (req, res) => {
  removeWallet(req.params.address);
  res.json({ ok: true });
});

// --- Discover & add whale wallets ---
app.post('/api/wallets/discover', async (req, res) => {
  try {
    const added = await refreshTrackedWallets();
    res.json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Subscriptions (Telegram channel, Discord webhook) ---
app.get('/api/subscriptions', (req, res) => {
  res.json({ subscriptions: getSubscriptions() });
});

app.post('/api/subscriptions', (req, res) => {
  const { channel, type } = req.body;
  if (!channel || !['telegram', 'discord'].includes(type)) {
    return res.status(400).json({ error: 'channel and type (telegram|discord) required' });
  }
  addSubscription(channel, type);
  res.json({ ok: true });
});

// --- Paper trading ---
app.get('/api/paper/portfolio', async (req, res) => {
  try {
    const markToMarket = req.query.markToMarket === 'true';
    const portfolio = await getPaperPortfolio(markToMarket);
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/paper/trades', (req, res) => {
  const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 500) : 100;
  res.json({ trades: getPaperTrades(limit) });
});

app.post('/api/paper/reset', (req, res) => {
  const initialBalance = Number(req.body?.initialBalance) || 100_000;
  if (initialBalance <= 0 || initialBalance > 1e9) {
    return res.status(400).json({ error: 'initialBalance must be between 1 and 1e9' });
  }
  resetPaperPortfolio(initialBalance);
  res.json({ ok: true, initialBalance });
});

// --- Health ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'polymarket-whale-tracker',
    paperTrading: isPaperTradingEnabled(),
  });
});

app.listen(PORT, () => {
  console.log(`Polymarket Whale Tracker API on http://localhost:${PORT}`);
});
