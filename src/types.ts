// Polymarket API response types

export interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate?: string;
  negativeRisk?: boolean;
}

export interface PolymarketTrade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  pseudonym?: string;
  transactionHash?: string;
}

export interface PolymarketHolder {
  proxyWallet: string;
  amount: number;
  asset: string;
  outcomeIndex: number;
  pseudonym?: string;
  name?: string;
}

export interface MetaHolder {
  token: string;
  holders: PolymarketHolder[];
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
}

export interface ValueResponse {
  value: number;
}

/** Trader entry from Polymarket Data API /v1/leaderboard */
export interface TraderLeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName?: string;
  vol: number;
  pnl: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
}

// Tracker types
export interface TrackedWallet {
  address: string;
  alias?: string;
  addedAt: number;
  source: 'manual' | 'holder_discovery' | 'leaderboard';
}

export interface WhaleAlert {
  wallet: string;
  conditionId: string;
  roi: number;
  market: string;
  outcome: string;
  size: number;
  avgPrice: number;
  cashPnl: number;
  timestamp: number;
}

export interface LeaderboardEntry {
  wallet: string;
  alias?: string;
  totalPnl: number;
  roi: number;
  positionsCount: number;
  totalValue: number;
}

// Paper trading
export interface PaperPosition {
  conditionId: string;
  copiedFromWallet: string;
  marketTitle: string;
  outcome: string;
  entryPrice: number;
  size: number;
  entryValue: number;
  openedAt: number;
  eventSlug?: string;
}

export interface PaperTrade {
  conditionId: string;
  copiedFromWallet: string;
  marketTitle: string;
  outcome: string;
  side: 'OPEN' | 'CLOSE';
  price: number;
  size: number;
  value: number;
  pnl?: number;
  timestamp: number;
}

// AI risk agent
export interface RiskCheckInput {
  wallet: string;
  marketTitle: string;
  outcome: string;
  size: number;
  avgPrice: number;
  whaleRoi: number;
  paperBalance: number;
  existingExposure: number;
  openPositionsCount: number;
}

export interface RiskDecision {
  action: 'approve' | 'reject' | 'reduce';
  sizeLimit?: number;
  reason: string;
}
