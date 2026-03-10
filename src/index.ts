/**
 * Polymarket Whale Tracker - Main Entry
 * Runs tracker on interval + optional API server
 */

import 'dotenv/config';
import { runTrackingCycle, refreshTrackedWallets } from './tracker.js';
import { computeLeaderboard } from './leaderboard.js';
import { initDb } from './storage.js';

const POLL_INTERVAL_MS = (Number(process.env.POLL_INTERVAL_SECONDS) || 10) * 1000;
const RUN_API = process.env.RUN_API !== 'false';

async function main(): Promise<void> {
  initDb();

  // Initial discovery of whale wallets if none tracked
  const { getWallets } = await import('./storage.js');
  if (getWallets().length === 0) {
    console.log('Discovering top traders from Polymarket leaderboard...');
    await refreshTrackedWallets();
  }

  // Build initial leaderboard
  await computeLeaderboard();

  // Poll every N seconds (default 10)
  setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Running tracking cycle...`);
    await runTrackingCycle();
    await computeLeaderboard();
  }, POLL_INTERVAL_MS);

  console.log(`Tracker scheduled every ${POLL_INTERVAL_MS / 1000} sec`);

  if (RUN_API) {
    await import('./api-server.js');
  } else {
    // Run one cycle immediately
    await runTrackingCycle();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
