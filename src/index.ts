import type {
  Action,
  IAgentRuntime,
  Plugin,
} from '@elizaos/core';

// ── Hosted backend (onchain.wick.pics, engine wick-safe/0.3) ────────────────
// Token-SAFETY only — the verdicts we are confident in. Free rate-limited tier
// by default; set ONCHAIN_API_KEY (wsk_…) for the paid deep tier. Multi-chain:
// pulsechain | monad | base | bsc.
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

const DISCLAIMER = '\n\n_Informational on-chain safety analysis, not financial advice. Verify before acting._';

// ── CHECK TOKEN SAFETY (flagship — the product we're confident in) ───────────
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
      const text = `🛡️ Safety verdict for ${address} on ${chain}: ${data?.verdict ?? '?'} (score ${data?.score ?? '?'}/100)\n${pretty(data)}${DISCLAIMER}`;
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

// ── EXIT SAFETY (size-aware liquidity — also safety, defensible) ─────────────
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
      const text = `💧 Exit-safety for $${sizeUsd} of ${address} on ${chain}:\n${pretty(data)}${DISCLAIMER}`;
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

// ── FRESH RUG RADAR (safety-scored new pools) ────────────────────────────────
const freshRug: Action = {
  name: 'ONCHAIN_FRESH_RUG_RADAR',
  similes: ['FRESH_RUG_RADAR', 'NEW_POOLS', 'WHAT_JUST_LAUNCHED', 'NEW_LAUNCHES'],
  description:
    'The most recently created liquidity pools, each safety-scored the moment it appeared (verdict, 0-100 score, seconds-since-creation). New tokens are where the rugs are. Use when the user asks what just launched / new pools / new tokens.',
  validate: async () => true,
  handler: async (runtime, _m, _s, _o, callback) => {
    try {
      const data = await apiGet(runtime, '/api/v1/fresh/recent');
      const text = `🆕 Fresh pools, safety-scored at creation:\n${pretty(data)}${DISCLAIMER}`;
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
      { name: 'user', content: { text: 'what tokens just launched on pulsechain?' } },
      { name: 'assistant', content: { text: 'Checking the fresh-pool rug radar.', actions: ['ONCHAIN_FRESH_RUG_RADAR'] } },
    ],
  ],
};

export const onchainSafetyPlugin: Plugin = {
  name: 'onchain-safety',
  description:
    'Multi-chain token-SAFETY for AI agents on PulseChain, Monad, Base & BSC: rug/honeypot verdict with a 0–100 score + evidence (contract risk, liquidity, transfer-sim, LP-burn), size-aware exit-liquidity, and a safety-scored fresh-pool radar — so an agent never touches a rug. Free tier needs no key; x402 pay-per-call available. Powered by onchain.wick.pics. Informational, not financial advice.',
  actions: [checkSafety, exitSafety, freshRug],
  providers: [],
  services: [],
  init: async () => {
    // No required config — free tier works out of the box. Optional ONCHAIN_API_KEY unlocks the deep tier.
  },
};

export default onchainSafetyPlugin;
