# @wickpics/plugin-onchain-safety

**ElizaOS plugin that gives any agent multi-chain token-SAFETY** on **PulseChain, Monad, Base &
BSC** — the long-tail chains GoPlus / De.Fi cover poorly.

Drop it into an agent and it can answer "is this a rug?", "can I exit $X?", and "what just launched,
and is it safe?" — so your agent never touches a rug. Powered by the hosted engine at
[onchain.wick.pics](https://onchain.wick.pics) (`wick-safe/0.3`).

> Scope is deliberately **safety only** — the verdicts we stand behind. Informational on-chain
> analysis, **not financial advice**.

## Actions
| Action | What it answers |
|---|---|
| `ONCHAIN_CHECK_TOKEN_SAFETY` | SAFE…LIKELY_RUG verdict + 0–100 score + evidence (contract risk, liquidity, honeypot transfer-sim, LP-burn) for a `0x…` token. |
| `ONCHAIN_EXIT_SAFETY` | Can you sell $X at acceptable slippage? Size-aware price-impact + safety. |
| `ONCHAIN_FRESH_RUG_RADAR` | The newest pools, each safety-scored the second it appeared. |
| `ONCHAIN_SAFE_TO_INTERACT` | One call → SAFE_TO_INTERACT / CAUTION / DO_NOT_INTERACT (safety + ownership bundled), with reasons. |
| `ONCHAIN_CHECK_OWNERSHIP` | Renounced? upgradeable? what can an active owner still do (mint/blacklist/pause/tax)? |
| `ONCHAIN_WALLET_APPROVALS` | A wallet's active ERC-20 approvals, flagging unlimited grants — the drainer vector. |

## Why it's different
The well-known safety APIs are strong on Ethereum/BSC but thin-to-absent on **PulseChain and
Monad** — exactly the high-rug chains where agents get wrecked. This engine runs its own on-chain
monitoring there (pool-creation watchers, honeypot transfer-simulation against real reserves), so
you get first-class verdicts where the incumbents return "unsupported chain."

## Install
```bash
elizaos plugins add @wickpics/plugin-onchain-safety
# or from source:
# git clone https://github.com/aitools420/eliza-plugin-onchain-safety
```
```typescript
import { onchainSafetyPlugin } from '@wickpics/plugin-onchain-safety';

const agent = { name: 'MyAgent', plugins: [onchainSafetyPlugin] };
```

## Config
- **Free tier — no key needed** (rate-limited). Works out of the box.
- **Paid deep tier** — set `ONCHAIN_API_KEY=wsk_…` (get one at [onchain.wick.pics](https://onchain.wick.pics)).
- **Autonomous x402** — pay-per-call in USDC on Base with no signup; route index at
  `https://onchain.wick.pics/.well-known/x402`.

## Chains
`pulsechain` · `monad` · `base` · `bsc`

MIT © Green Wick / wick.pics
