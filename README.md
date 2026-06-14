# @wickpics/plugin-onchain-safety

**ElizaOS plugin that gives any agent multi-chain token-safety + de-rugged smart-money alpha** on
**PulseChain, Monad, Base & BSC** — the long-tail chains GoPlus / De.Fi cover poorly.

Drop it into an agent and it can answer "is this a rug?", "can I exit $X?", "what just launched?",
and **"what are alpha wallets safely buying right now?"** — so your agent never touches a rug and
always knows what's safe to look at. Powered by the hosted engine at
[onchain.wick.pics](https://onchain.wick.pics) (`wick-safe/0.3`).

## Why it's different
A safety *check* is a commodity. The edge here is the **proprietary data**: a live on-chain
monitoring fleet on PulseChain/Monad (pool-creation watchers, honeypot transfer-simulation against
real reserves, and alpha-wallet cluster tracking) — months of labeled flow you can't reproduce in a
day. So the headline tools are the **smart-money / what-ticker / fresh-rug** feeds, not just the check.

## Actions
| Action | What it answers |
|---|---|
| `ONCHAIN_WHAT_TICKER` | The single top token alpha wallets are buying that ALSO passes safety — with the why + alternates. |
| `ONCHAIN_SMART_MONEY` | Tokens ≥N tier-1 alpha wallets co-bought AND that pass the safety gate, confidence-scored. |
| `ONCHAIN_FRESH_RUG_RADAR` | The newest pools, each safety-scored the second it appeared. |
| `ONCHAIN_CHECK_TOKEN_SAFETY` | SAFE…LIKELY_RUG verdict + 0–100 score + evidence for a `0x…` token. |
| `ONCHAIN_EXIT_SAFETY` | Can you sell $X at acceptable slippage? Size-aware price-impact + safety. |

## Install
```bash
elizaos plugins add @wickpics/plugin-onchain-safety
# or from source:
# git clone https://github.com/aitools420/eliza-plugin-onchain-safety
```

Then add it to your character / agent:
```typescript
import { onchainSafetyPlugin } from '@wickpics/plugin-onchain-safety';

const agent = {
  name: 'MyAgent',
  plugins: [onchainSafetyPlugin],
};
```

## Config
- **Free tier — no key needed** (rate-limited). Works out of the box.
- **Paid deep tier** — set `ONCHAIN_API_KEY=wsk_…` (get one at [onchain.wick.pics](https://onchain.wick.pics))
  for the real-time/fuller feeds.
- **Autonomous x402** — agents can also pay-per-call in USDC on Base with no signup; machine-readable
  route index at `https://onchain.wick.pics/.well-known/x402`.

## Chains
`pulsechain` · `monad` · `base` · `bsc`

MIT © Green Wick / wick.pics
