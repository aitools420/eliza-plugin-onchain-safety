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

// ── SAFE TO INTERACT? (composite — the headline pre-action check) ────────────
const safeToInteract: Action = {
  name: 'ONCHAIN_SAFE_TO_INTERACT',
  similes: ['SAFE_TO_INTERACT', 'SHOULD_I_TOUCH_THIS', 'IS_IT_SAFE_TO_USE', 'CAN_I_INTERACT'],
  description:
    'One call before touching a contract/token: bundles the safety verdict + ownership/privileges into a single recommendation — SAFE_TO_INTERACT / CAUTION / DO_NOT_INTERACT — with reasons. Use before buying, swapping into, approving, or accepting an unknown token.',
  validate: async (_r, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const { chain, address } = parseChainAddress(message?.content?.text || '');
    if (!address) { const text = 'Give me the contract/token address (0x…) and chain.'; await callback?.({ text }); return { success: false, text }; }
    try {
      const data = await apiGet(runtime, `/api/v1/safe-to-interact?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`);
      const text = `🧭 ${address} on ${chain}: ${data?.recommendation ?? '?'}\n${pretty(data)}${DISCLAIMER}`;
      await callback?.({ text });
      return { success: true, text, values: { recommendation: data?.recommendation ?? null } };
    } catch (e: any) { const text = `Safe-to-interact check failed: ${e?.message ?? e}`; await callback?.({ text }); return { success: false, text, error: String(e?.message ?? e) }; }
  },
  examples: [[{ name: 'user', content: { text: 'is it safe to interact with 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab on pulsechain?' } }, { name: 'assistant', content: { text: 'Running the composite safe-to-interact check.', actions: ['ONCHAIN_SAFE_TO_INTERACT'] } }]],
};

// ── CHECK OWNERSHIP / RENOUNCE + PRIVILEGES ──────────────────────────────────
const checkOwnership: Action = {
  name: 'ONCHAIN_CHECK_OWNERSHIP',
  similes: ['CHECK_OWNERSHIP', 'IS_OWNERSHIP_RENOUNCED', 'OWNER_PRIVILEGES', 'RENOUNCED', 'IS_IT_UPGRADEABLE'],
  description:
    'Is a token\'s ownership renounced, is it upgradeable (proxy), and what powers can an active owner still use (mint / blacklist / pause / adjust tax)? Use when asked who controls a token or whether ownership is renounced.',
  validate: async (_r, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const { chain, address } = parseChainAddress(message?.content?.text || '');
    if (!address) { const text = 'Give me the token address (0x…) and chain.'; await callback?.({ text }); return { success: false, text }; }
    try {
      const data = await apiGet(runtime, `/api/v1/ownership?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`);
      const text = `🔑 Ownership for ${address} on ${chain}: ${data?.owner?.status ?? '?'}${data?.renounced ? ' (renounced)' : ''}\n${pretty(data)}${DISCLAIMER}`;
      await callback?.({ text });
      return { success: true, text, values: { renounced: data?.renounced ?? null } };
    } catch (e: any) { const text = `Ownership check failed: ${e?.message ?? e}`; await callback?.({ text }); return { success: false, text, error: String(e?.message ?? e) }; }
  },
  examples: [[{ name: 'user', content: { text: 'is ownership renounced for 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab on pulsechain?' } }, { name: 'assistant', content: { text: 'Checking ownership + privileges.', actions: ['ONCHAIN_CHECK_OWNERSHIP'] } }]],
};

// ── WALLET APPROVAL SCANNER ──────────────────────────────────────────────────
const walletApprovals: Action = {
  name: 'ONCHAIN_WALLET_APPROVALS',
  similes: ['WALLET_APPROVALS', 'CHECK_APPROVALS', 'WHAT_CAN_DRAIN_MY_WALLET', 'TOKEN_ALLOWANCES', 'REVOKE_CHECK'],
  description:
    'Enumerate a wallet\'s active ERC-20 approvals (allowances granted to spender contracts) and flag the unlimited ones — the classic wallet-drainer vector. Use when asked what could drain a wallet, or to audit a wallet\'s approvals. Scans a recent block window.',
  validate: async (_r, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const { chain, address } = parseChainAddress(message?.content?.text || '');
    if (!address) { const text = 'Give me the wallet address (0x…) and chain to scan.'; await callback?.({ text }); return { success: false, text }; }
    try {
      const data = await apiGet(runtime, `/api/v1/approvals?chain=${encodeURIComponent(chain)}&owner=${encodeURIComponent(address)}`);
      const text = `🔓 Approvals for ${address} on ${chain}: ${data?.activeApprovals ?? '?'} active, ${data?.unlimitedApprovals ?? '?'} unlimited\n${pretty(data)}${DISCLAIMER}`;
      await callback?.({ text });
      return { success: true, text, values: { unlimitedApprovals: data?.unlimitedApprovals ?? null } };
    } catch (e: any) { const text = `Approval scan failed: ${e?.message ?? e}`; await callback?.({ text }); return { success: false, text, error: String(e?.message ?? e) }; }
  },
  examples: [[{ name: 'user', content: { text: 'what approvals does 0x... have on base that could drain it?' } }, { name: 'assistant', content: { text: 'Scanning active token approvals.', actions: ['ONCHAIN_WALLET_APPROVALS'] } }]],
};

// ── ADDRESS-POISONING SCANNER ────────────────────────────────────────────────
const walletPoisonCheck: Action = {
  name: 'ONCHAIN_WALLET_POISON_CHECK',
  similes: ['ADDRESS_POISONING', 'POISON_CHECK', 'LOOKALIKE_ADDRESS', 'DUST_ATTACK', 'SAFE_TO_SEND'],
  description:
    'Scan a wallet\'s recent incoming transfers for address-poisoning attacks — dust/zero-value transfers from lookalike addresses (first-4+last-4 chars matching a real counterparty) seeded to trick a copy-paste of the wrong address. Use before sending to a "recently used" address.',
  validate: async (_r, message) => /0x[a-fA-F0-9]{40}/.test(message?.content?.text || ''),
  handler: async (runtime, message, _s, _o, callback) => {
    const { chain, address } = parseChainAddress(message?.content?.text || '');
    if (!address) { const text = 'Give me the wallet address (0x…) and chain to scan.'; await callback?.({ text }); return { success: false, text }; }
    try {
      const data = await apiGet(runtime, `/api/v1/poison-check?chain=${encodeURIComponent(chain)}&owner=${encodeURIComponent(address)}`);
      const text = `🎯 Poison scan for ${address} on ${chain}: ${data?.poisoningSuspects ?? data?.suspects ?? '?'} suspect(s)\n${pretty(data)}${DISCLAIMER}`;
      await callback?.({ text });
      return { success: true, text, values: { poisoningSuspects: data?.poisoningSuspects ?? data?.suspects ?? null } };
    } catch (e: any) { const text = `Poison scan failed: ${e?.message ?? e}`; await callback?.({ text }); return { success: false, text, error: String(e?.message ?? e) }; }
  },
  examples: [[{ name: 'user', content: { text: 'before I send to that address, is 0x... poisoned on base?' } }, { name: 'assistant', content: { text: 'Scanning for lookalike address-poisoning.', actions: ['ONCHAIN_WALLET_POISON_CHECK'] } }]],
};

export const onchainSafetyPlugin: Plugin = {
  name: 'onchain-safety',
  description:
    'Multi-chain token-SAFETY for AI agents on PulseChain, Monad, Base & BSC: a "safe to interact?" verdict, rug/honeypot scoring + evidence, ownership/renounce + privilege checks, size-aware exit-liquidity, wallet approval (drainer) scanning, address-poisoning (lookalike) detection, and a fresh-pool rug radar — so an agent never touches a rug, a drainer, or a poisoned address. Deterministic, no AI. Free tier needs no key; x402 pay-per-call available. Powered by onchain.wick.pics. Informational, not financial advice.',
  actions: [safeToInteract, checkSafety, checkOwnership, walletApprovals, walletPoisonCheck, exitSafety, freshRug],
  providers: [],
  services: [],
  init: async () => {
    // No required config — free tier works out of the box. Optional ONCHAIN_API_KEY unlocks the deep tier.
  },
};

export default onchainSafetyPlugin;
