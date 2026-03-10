#!/usr/bin/env node
/**
 * CLI for one-off commands
 * Usage: tsx src/cli.ts discover | track | leaderboard
 */

import 'dotenv/config';
import { initDb, getWallets } from './storage.js';
import { refreshTrackedWallets, runTrackingCycle } from './tracker.js';
import { computeLeaderboard } from './leaderboard.js';

initDb();

const cmd = process.argv[2] ?? 'help';

async function main(): Promise<void> {
  switch (cmd) {
    case 'discover':
      const added = await refreshTrackedWallets();
      console.log(`Added ${added} new whale wallets. Total: ${getWallets().length}`);
      break;

    case 'track':
      await runTrackingCycle();
      console.log('Tracking cycle complete.');
      break;

    case 'leaderboard':
      const entries = await computeLeaderboard();
      console.log('\nTop Traders Leaderboard:\n');
      entries.slice(0, 20).forEach((e, i) => {
        const alias = e.alias ? ` (${e.alias})` : '';
        console.log(`${i + 1}. ${e.wallet.slice(0, 10)}...${alias}`);
        console.log(`   PnL: $${e.totalPnl.toFixed(0)} | ROI: ${e.roi.toFixed(0)}% | Positions: ${e.positionsCount}`);
      });
      break;

    case 'help':
    default:
      console.log(`
Polymarket Whale Tracker CLI

  discover   - Find and add whale wallets from top holders
  track      - Run one tracking cycle (check positions, send alerts)
  leaderboard - Compute and show top traders

Examples:
  npm run cli -- discover
  npm run cli -- track
  npm run cli -- leaderboard
`);
  }
}

main().catch(console.error);
