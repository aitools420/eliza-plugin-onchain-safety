import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from '@elizaos/core';

// ── Hosted backend (onchain.wick.pics, engine wick-safe/0.3) ────────────────
// Free rate-limited tier by default; set ONCHAIN_API_KEY (wsk_…) for the paid
// deep tier. We resolve the key from runtime settings or env so it works in any
// ElizaOS setup. Multi-chain: pulsechain | monad | base | bsc.
const API_BASE = (process.env.ONCHAIN_API_BASE || 'https://onchain.wick.pics').replace(/\/+$/, '');
const CHAINS = ['pulsechain', 'monad', 'base', 'bsc'] as const;

function apiKey(runtime: IAgentRuntime): string {
  try {
    return (runtime.getSetting?.('ONCHAIN_API_KEY') as string) || process.env.ONCHAIN_API_KEY || '';
  } catch {
    return process.env.ONCHAIN_API_KEY || '';
  }
}

async function apiGet(runtime: IAgentRuntime, pathAndQuery: string): Promise<any> {
  const key = apiKey(runtime);
  const res = await fetch(API_BASE + pathAndQuery, {
    headers: key ? { 'x-api-key': key } : {},
  });
  return res.json();
}

// Pull a 0x address + a chain keyword out of the user's message.
function parseChainAddress(text: string): { chain: string; address?: string } {
  const lower = (text || '').toLowerCase();
  const chain = CHAINS.find((c) => lower.includes(c)) || 'pulsechain';
  const m = (text || '').match(/0x[a-fA-F0-9]{40}/);
  return { chain, address: m ? m[0] : undefined };
}

function pretty(obj: any): string {
  try {
    return '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
  } catch {
    return String(obj);
  }
}

// ── Action 1 (flagship / moat): WHAT TICKER — proprietary de-rugged alpha ────
const whatTicker: Action = {
  name: 'ONCHAIN_WHAT_TICKER',
  similes: ['WHAT_TICKER', 'WHAT_SHOULD_I_BUY', 'TOP_ALPHA_PICK', 'WHAT_ARE_WHALES_BUYING'],
  description:
    'Return the single top-ranked token that alpha-wallet clusters are buying right now AND that passes the safety gate — the de-rugged "what should I look at" answer, with the why and alternates. Proprietary smart-money intelligence on PulseChain/Monad/Base/BSC. Use when the user asks what to buy, what is trending, or what alpha wallets are accumulating.',
  validate: async () => true,
  handler: async (runtime, _message, _state, _options, callback) => {
    try {
      const data = await apiGet(runtime, '/api/v1/what-ticker');
      const text = `🎯 Top safe alpha pick (smart-money × safety):\n${pretty(data)}`;
      await callback?.({ text });
      return { success: true, text, values: { ticker: data?.symbol ?? null } };
    } catch (e: any) {
      const text = `Could not fetch the top alpha pick: ${e?.message ?? e}`;
      await callback?.({ text });
      return { success: false, text, error: String(e?.message ?? e) };
    }
  },
  examples: [
    [
      { name: 'user', content: { text: 'what ticker should I be looking at right now?' } },
      { name: 'assistant', content: { text: 'Let me check what alpha wallets are accumulating that also passes safety.', actions: ['ONCHAIN_WHAT_TICKER'] } },
    ],
  ],
};

// ── Action 2 (moat): SMART MONEY SIGNALS ─────────────────────────────────────
const smartMoney: Action = {
  name: 'ONCHAIN_SMART_MONEY',
  similes: ['SMART_MONEY', 'ALPHA_WALLETS', 'WHAT_ARE_SMART_WALLETS_BUYING', 'WHALE_BUYS'],
  description:
    'Tokens that ≥N tier-1 alpha wallets co-bought AND that pass the safety engine — a de-rugged smart-money feed (cohort × safety), confidence-scored. Proprietary on-chain monitoring. Use when the user asks what smart money / whales / alpha wallets are buying.',
  validate: async () => true,
  handler: async (runtime, _m, _s, _o, callback) => {
    try {
      const data = await apiGet(runtime, '/api/v1/smart-money/recent');
      const text = `🐋 Safe smart-money signals (alpha-wallet co-buys, safety-gated):\n${pretty(data)}`;
      await callback?.({ text });
      return { success: true, text };
    } catch (e: any) {
      const text = `Could not fetch smart-money signals: ${e?.message ?? e}`;
      await callback?.({ text });
      return { success: false, text, error: String(e?.message ?? e) };
    }
  },
  examples: [
    [
      { name: 'user', content: { text: 'what are the smart money wallets buying?' } },
      { name: 'assistant', content: { text: 'Pulling the safety-gated smart-money feed.', actions: ['ONCHAIN_SMART_MONEY'] } },
    ],
  ],
};

// ── Action 3 (moat): FRESH RUG RADAR ─────────────────────────────────────────
const freshRug: Action = {
  name: 'ONCHAIN_FRESH_RUG_RADAR',
  similes: ['FRESH_RUG_RADAR', 'NEW_POOLS', 'WHAT_JUST_LAUNCHED', 'NEW_LAUNCHES'],
  description:
    'The most recently created liquidity pools, each safety-scored the moment it appeared (verdict, 0-100 score, seconds-since-creation). New tokens are where the rugs are. Use when the user asks what just launched / new pools / new tokens.',
  validate: async () => true,
  handler: async (runtime, _m, _s, _o, callback) => {
    try {
      const data = await apiGet(runtime, '/api/v1/fresh/recent');
      const text = `🆕 Fresh pools, safety-scored at creation:\n${pretty(data)}`;
      await callback?.({ text });
      return { success: true, text };
    } catch (e: any) {
      const text = `Could not fetch fresh-pool radar: ${e?.message ?? e}`;
      await callback?.({ text });
      return { success: false, text, error: String(e?.message ?? e) };
    }
  },
  examples: [
    [
      { name: 'user', content: { text: 'what tokens just launched?' } },
      { name: 'assistant', content: { text: 'Checking the fresh-pool rug radar.', actions: ['ONCHAIN_FRESH_RUG_RADAR'] } },
    ],
  ],
};

// ── Action 4: CHECK TOKEN SAFETY ─────────────────────────────────────────────
const checkSafety: Action = {
  name: 'ONCHAIN_CHECK_TOKEN_SAFETY',
  similes: ['CHECK_TOKEN', 'IS_THIS_A_RUG', 'TOKEN_SAFETY', 'RUG_CHECK', 'HONEYPOT_CHECK'],
  description:
    'Scam/safe verdict for an ERC-20 token on PulseChain, Monad, Base, or BSC: verdict (SAFE…LIKELY_RUG), 0-100 score, and the evidence (contract risk, liquidity, honeypot transfer-sim, LP-burn). Call this BEFORE buying, swapping into, or accepting an unknown token. Trigger when the user provides a 0x token address or asks if a token is safe / a rug / a honeypot.',
  validate: async (_runtime, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const { chain, address } = parseChainAddress(message?.content?.text || '');
    if (!address) {
      const text = 'Give me the token contract address (0x…) and the chain (pulsechain/monad/base/bsc).';
      await callback?.({ text });
      return { success: false, text };
    }
    try {
      const data = await apiGet(runtime, `/api/v1/check?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`);
      const text = `🛡️ Safety verdict for ${address} on ${chain}: ${data?.verdict ?? '?'} (score ${data?.score ?? '?'}/100)\n${pretty(data)}`;
      await callback?.({ text });
      return { success: true, text, values: { verdict: data?.verdict ?? null, score: data?.score ?? null } };
    } catch (e: any) {
      const text = `Safety check failed: ${e?.message ?? e}`;
      await callback?.({ text });
      return { success: false, text, error: String(e?.message ?? e) };
    }
  },
  examples: [
    [
      { name: 'user', content: { text: 'is 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab on pulsechain safe?' } },
      { name: 'assistant', content: { text: 'Running the multi-chain safety verdict.', actions: ['ONCHAIN_CHECK_TOKEN_SAFETY'] } },
    ],
  ],
};

// ── Action 5: EXIT SAFETY (size-aware liquidity) ─────────────────────────────
const exitSafety: Action = {
  name: 'ONCHAIN_EXIT_SAFETY',
  similes: ['EXIT_SAFETY', 'CAN_I_SELL', 'LIQUIDITY_DEPTH', 'SLIPPAGE_CHECK'],
  description:
    'Can you sell $X of a token at acceptable slippage? Size-aware price-impact (on-chain reserves + routed quote) plus the safety verdict. Use when the user asks if they can exit/sell a position of a given size, or about liquidity depth / slippage for a token.',
  validate: async (_runtime, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const text0 = message?.content?.text || '';
    const { chain, address } = parseChainAddress(text0);
    const sizeMatch = text0.match(/\$?\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s?(k|m)?/i);
    let sizeUsd = 1000;
    if (sizeMatch) {
      let n = parseFloat(sizeMatch[1].replace(/,/g, ''));
      const unit = (sizeMatch[2] || '').toLowerCase();
      if (unit === 'k') n *= 1000;
      if (unit === 'm') n *= 1_000_000;
      if (n > 0) sizeUsd = n;
    }
    if (!address) {
      const text = 'Give me the token address (0x…), chain, and the USD size you want to exit.';
      await callback?.({ text });
      return { success: false, text };
    }
    try {
      const data = await apiGet(
        runtime,
        `/api/v1/exit-safety?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(address)}&sizeUsd=${encodeURIComponent(sizeUsd)}`,
      );
      const text = `💧 Exit-safety for $${sizeUsd} of ${address} on ${chain}:\n${pretty(data)}`;
      await callback?.({ text });
      return { success: true, text };
    } catch (e: any) {
      const text = `Exit-safety check failed: ${e?.message ?? e}`;
      await callback?.({ text });
      return { success: false, text, error: String(e?.message ?? e) };
    }
  },
  examples: [
    [
      { name: 'user', content: { text: 'can I sell $5k of 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab on pulsechain?' } },
      { name: 'assistant', content: { text: 'Checking size-aware exit liquidity.', actions: ['ONCHAIN_EXIT_SAFETY'] } },
    ],
  ],
};

export const onchainSafetyPlugin: Plugin = {
  name: 'onchain-safety',
  description:
    'Multi-chain token-safety + de-rugged smart-money alpha for AI agents on PulseChain, Monad, Base & BSC. Rug/honeypot verdicts, size-aware exit-liquidity, fresh-pool rug radar, and what alpha wallets are buying — so an agent never touches a rug and always knows what is safe to look at. Free tier needs no key; x402 pay-per-call available. Powered by onchain.wick.pics.',
  actions: [whatTicker, smartMoney, freshRug, checkSafety, exitSafety],
  providers: [],
  services: [],
  init: async () => {
    // No required config — free tier works out of the box. Optional ONCHAIN_API_KEY unlocks the deep tier.
  },
};

export default onchainSafetyPlugin;
