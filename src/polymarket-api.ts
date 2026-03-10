/**
 * Polymarket API Client
 * Data API + Gamma API - no auth required
 */

import type {
  PolymarketPosition,
  PolymarketTrade,
  PolymarketHolder,
  MetaHolder,
  PolymarketEvent,
  ValueResponse,
  TraderLeaderboardEntry,
} from './types.js';

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

/** Get current positions for a wallet */
export async function getPositions(user: string, opts?: {
  limit?: number;
  sortBy?: string;
}): Promise<PolymarketPosition[]> {
  const params = new URLSearchParams({ user });
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sortBy) params.set('sortBy', opts.sortBy);
  return fetchJson<PolymarketPosition[]>(
    `${DATA_API}/positions?${params}`
  );
}

/** Get closed positions for PnL history */
export async function getClosedPositions(user: string, opts?: {
  limit?: number;
}): Promise<PolymarketPosition[]> {
  const params = new URLSearchParams({ user });
  if (opts?.limit) params.set('limit', String(opts.limit ?? 100));
  return fetchJson<PolymarketPosition[]>(
    `${DATA_API}/closed-positions?${params}`
  );
}

/** Get total portfolio value */
export async function getValue(user: string): Promise<number> {
  const data = await fetchJson<ValueResponse>(`${DATA_API}/value?user=${user}`);
  return data.value ?? 0;
}

/** Get recent trades for a wallet */
export async function getTrades(user: string, opts?: {
  limit?: number;
  side?: 'BUY' | 'SELL';
}): Promise<PolymarketTrade[]> {
  const params = new URLSearchParams({ user });
  if (opts?.limit) params.set('limit', String(opts.limit ?? 50));
  if (opts?.side) params.set('side', opts.side);
  return fetchJson<PolymarketTrade[]>(`${DATA_API}/trades?${params}`);
}

/** Get Polymarket trader leaderboard (top traders by PnL or volume) */
export async function getLeaderboard(opts?: {
  category?: string;
  timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
  orderBy?: 'PNL' | 'VOL';
  limit?: number;
  offset?: number;
}): Promise<TraderLeaderboardEntry[]> {
  const params = new URLSearchParams();
  if (opts?.category) params.set('category', opts.category);
  if (opts?.timePeriod) params.set('timePeriod', opts.timePeriod);
  if (opts?.orderBy) params.set('orderBy', opts.orderBy);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  return fetchJson<TraderLeaderboardEntry[]>(
    `${DATA_API}/v1/leaderboard?${params}`
  );
}

/** Get top holders for markets (discover whale wallets) */
export async function getHolders(marketConditionIds: string[]): Promise<MetaHolder[]> {
  if (marketConditionIds.length === 0) return [];
  const params = new URLSearchParams();
  marketConditionIds.forEach((id) => params.append('market', id));
  params.set('limit', '20');
  return fetchJson<MetaHolder[]>(`${DATA_API}/holders?${params}`);
}

/** Get active events (for discovering high-volume markets) */
export async function getEvents(opts?: {
  limit?: number;
  active?: boolean;
  closed?: boolean;
}): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.active !== undefined) params.set('active', String(opts.active));
  if (opts?.closed !== undefined) params.set('closed', String(opts.closed));
  return fetchJson<PolymarketEvent[]>(`${GAMMA_API}/events?${params}`);
}

/** Extract condition IDs from events for holder discovery */
export function getConditionIdsFromEvents(events: PolymarketEvent[]): string[] {
  const ids: string[] = [];
  for (const e of events) {
    for (const m of e.markets ?? []) {
      if (m.conditionId) ids.push(m.conditionId);
    }
  }
  return ids;
}
