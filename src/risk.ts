/**
 * Risk management: rule-based checks + optional AI agent for copy-trade decisions
 */

import type { RiskCheckInput, RiskDecision } from './types.js';

const MAX_POSITION_PCT = Number(process.env.PAPER_MAX_POSITION_PCT) || 10; // % of balance per position
const MAX_DAILY_LOSS_PCT = Number(process.env.PAPER_MAX_DAILY_LOSS_PCT) || 5;
const MAX_OPEN_POSITIONS = Number(process.env.PAPER_MAX_OPEN_POSITIONS) || 20;
const MIN_WHALE_ROI = Number(process.env.PAPER_MIN_WHALE_ROI) || 50;

/** Rule-based risk checks. Returns null if pass, or a reject reason. */
export function runRuleBasedChecks(
  input: RiskCheckInput,
  paperBalance: number,
  dailyPnl: number,
  openPositionsCount: number
): { pass: boolean; sizeLimit?: number; reason: string } {
  const maxPositionSize = (paperBalance * MAX_POSITION_PCT) / 100;
  if (input.size > maxPositionSize) {
    return {
      pass: true,
      sizeLimit: maxPositionSize,
      reason: `Position capped at ${MAX_POSITION_PCT}% of balance ($${maxPositionSize.toFixed(0)})`,
    };
  }

  if (paperBalance <= 0) {
    return { pass: false, reason: 'Paper balance exhausted' };
  }

  const dailyLossLimit = (input.paperBalance * MAX_DAILY_LOSS_PCT) / 100;
  if (dailyPnl <= -dailyLossLimit) {
    return { pass: false, reason: `Daily loss limit reached (${MAX_DAILY_LOSS_PCT}%)` };
  }

  if (openPositionsCount >= MAX_OPEN_POSITIONS) {
    return { pass: false, reason: `Max open positions (${MAX_OPEN_POSITIONS}) reached` };
  }

  if (input.whaleRoi < MIN_WHALE_ROI) {
    return { pass: false, reason: `Whale ROI ${input.whaleRoi.toFixed(0)}% below min ${MIN_WHALE_ROI}%` };
  }

  return { pass: true, reason: 'Rule checks passed' };
}

/** Call AI agent (OpenAI) for risk decision. Returns approve/reject/reduce with reason. */
export async function askAIAgent(input: RiskCheckInput): Promise<RiskDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { action: 'approve', reason: 'No OPENAI_API_KEY set; defaulting to approve' };
  }

  const prompt = `You are a risk manager for a paper-trading system that copies top Polymarket traders.
Given this potential copy-trade, respond with JSON only: {"action":"approve"|"reject"|"reduce","sizeLimit":number or null,"reason":"short explanation"}.

Context:
- Copying from wallet (top trader): ${input.wallet.slice(0, 10)}...
- Market: ${input.marketTitle.slice(0, 80)}
- Outcome: ${input.outcome}
- Proposed size: $${input.size.toFixed(0)} at avg price ${(input.avgPrice * 100).toFixed(1)}¢
- Whale's ROI on this position: ${input.whaleRoi.toFixed(0)}%
- Current paper balance: $${input.paperBalance.toFixed(0)}
- Existing exposure (this market/outcome): $${input.existingExposure.toFixed(0)}
- Open positions count: ${input.openPositionsCount}

Consider: concentration risk, daily drawdown, position sizing, and whether the whale's edge justifies the size. If you approve, you may suggest a smaller sizeLimit.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RISK_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { action: 'approve', reason: `AI API error: ${err.slice(0, 80)}; defaulting to approve` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { action: 'approve', reason: 'Empty AI response; defaulting to approve' };

    const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(json) as { action?: string; sizeLimit?: number; reason?: string };
    return {
      action: parsed.action === 'reject' ? 'reject' : parsed.action === 'reduce' ? 'reduce' : 'approve',
      sizeLimit: typeof parsed.sizeLimit === 'number' ? parsed.sizeLimit : undefined,
      reason: parsed.reason ?? 'AI approval',
    };
  } catch (err) {
    return { action: 'approve', reason: `AI call failed: ${(err as Error).message}; defaulting to approve` };
  }
}

/** Run full risk check: rules first, then optional AI agent. */
export async function runRiskCheck(
  input: RiskCheckInput,
  paperBalance: number,
  dailyPnl: number,
  openPositionsCount: number
): Promise<{ pass: boolean; sizeLimit?: number; reason: string }> {
  const ruleResult = runRuleBasedChecks(input, paperBalance, dailyPnl, openPositionsCount);
  if (!ruleResult.pass) return ruleResult;

  const useAI = process.env.AI_RISK_AGENT_ENABLED === 'true';
  if (!useAI) {
    return { pass: true, sizeLimit: ruleResult.sizeLimit, reason: ruleResult.reason };
  }

  const aiDecision = await askAIAgent(input);
  if (aiDecision.action === 'reject') {
    return { pass: false, reason: `AI: ${aiDecision.reason}` };
  }
  const sizeLimit = aiDecision.action === 'reduce' && aiDecision.sizeLimit != null
    ? Math.min(aiDecision.sizeLimit, ruleResult.sizeLimit ?? input.size)
    : ruleResult.sizeLimit;
  return {
    pass: true,
    sizeLimit,
    reason: `AI: ${aiDecision.reason}`,
  };
}
