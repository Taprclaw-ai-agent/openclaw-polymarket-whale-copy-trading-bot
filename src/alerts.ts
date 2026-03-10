/**
 * Whale alerts: Telegram + Discord
 * Example format:
 * Wallet: 0x9a4...d1
 * ROI: +480%
 * Bought: Trump wins election YES
 * Size: $38k
 */

import TelegramBot from 'node-telegram-bot-api';
import type { WhaleAlert } from './types.js';
import { getSubscriptions } from './storage.js';

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-3)}`;
}

function formatSize(size: number): string {
  if (size >= 1000) return `$${(size / 1000).toFixed(0)}k`;
  return `$${size.toFixed(0)}`;
}

export function formatWhaleAlert(alert: WhaleAlert): string {
  const roiSign = alert.roi >= 0 ? '+' : '';
  return [
    `🐋 **Whale Alert**`,
    ``,
    `Wallet: \`${shortAddress(alert.wallet)}\``,
    `ROI: ${roiSign}${alert.roi.toFixed(0)}%`,
    ``,
    `Bought: **${alert.market}** ${alert.outcome}`,
    `Size: ${formatSize(alert.size)}`,
    `P&L: $${alert.cashPnl.toFixed(0)}`,
  ].join('\n');
}

// Telegram
let telegramBot: TelegramBot | null = null;

function getTelegramBot(): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!telegramBot) telegramBot = new TelegramBot(token);
  return telegramBot;
}

export async function sendTelegramAlert(channelId: string, text: string): Promise<boolean> {
  const bot = getTelegramBot();
  if (!bot) return false;
  try {
    await bot.sendMessage(channelId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (err) {
    console.error('Telegram send failed:', (err as Error).message);
    return false;
  }
}

/** Send a plain notification to your Telegram channel (any change updates) */
export async function sendTelegramNotification(message: string): Promise<boolean> {
  const subs = getSubscriptions();
  const channel = process.env.TELEGRAM_CHANNEL_ID;
  let sent = false;
  for (const sub of subs) {
    if (sub.type === 'telegram') {
      const ok = await sendTelegramAlert(sub.channel, message);
      if (ok) sent = true;
    }
  }
  if (!sent && channel) {
    sent = await sendTelegramAlert(channel, message);
  }
  return sent;
}

// Discord
export async function sendDiscordAlert(webhookUrl: string, alert: WhaleAlert): Promise<boolean> {
  const roiSign = alert.roi >= 0 ? '+' : '';
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: '🐋 Whale Alert',
            color: alert.roi >= 0 ? 0x00ff00 : 0xff0000,
            fields: [
              { name: 'Wallet', value: `\`${shortAddress(alert.wallet)}\``, inline: true },
              { name: 'ROI', value: `${roiSign}${alert.roi.toFixed(0)}%`, inline: true },
              { name: 'Position', value: `${alert.market} **${alert.outcome}**` },
              { name: 'Size', value: formatSize(alert.size), inline: true },
              { name: 'P&L', value: `$${alert.cashPnl.toFixed(0)}`, inline: true },
            ],
            timestamp: new Date(alert.timestamp).toISOString(),
          },
        ],
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Discord webhook failed:', (err as Error).message);
    return false;
  }
}

export async function broadcastWhaleAlert(alert: WhaleAlert): Promise<void> {
  const subs = getSubscriptions();
  const text = formatWhaleAlert(alert);

  for (const sub of subs) {
    if (sub.type === 'telegram') {
      await sendTelegramAlert(sub.channel, text);
    } else if (sub.type === 'discord') {
      await sendDiscordAlert(sub.channel, alert);
    }
  }

  // Fallback: use Telegram env var if no subscriptions
  if (subs.length === 0) {
    const channel = process.env.TELEGRAM_CHANNEL_ID;
    if (channel) await sendTelegramAlert(channel, text);
  }
}
