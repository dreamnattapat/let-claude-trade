# Let Claude Trade (trade-lab)

A paper-money investing experiment run by AI and scored against real market data:

**Swing Cook / Team Lynch** (`/`, also `/lynch`): seven AI agents investing weekly the way Peter Lynch did, in four themes, against the S&P 500. It started in [ส่องพอร์ต Dime](https://github.com/dreamnattapat/songport-dime) and moved here with its whole git history (the order postmarks depend on it).

A day-trading desk ("Day Cook") ran here briefly in October 2026. Backtests (branch `backtest`) found no rule that beat costs, on US stocks or gold, so it was removed on 24 Oct 2026; its code is in the git history.

Nothing here is real money or investment advice.

## How it works

| When (Bangkok) | What | Where |
| --- | --- | --- |
| Tue–Sat 04:30 | Team Lynch fills at the close | `dream.yml` → `scripts/dream-update.ts` → `public/dream/state.json` |
| Mon 18:00, Sat 09:00 | Team Lynch meeting and retro | scheduled Claude tasks, `dream/PLAYBOOK.md` |

Check: `node scripts/dream-check.ts` (runs in the Action too).

## Develop

```sh
npm install
npm run dev      # Vite on :5173, proxying /api/chart to Yahoo
npm test
npm run build
```

Deployed as a Cloudflare Worker (`wrangler.jsonc`): static files from `dist/`, plus `worker/index.ts` for `/api/chart/*` (Yahoo Finance). Cloudflare builds it from this repo on every push to `main`.
