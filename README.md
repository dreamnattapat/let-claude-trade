# Let Claude cook (trade-lab)

A paper-money lab for two investing experiments, run by AI and scored against real market data:

1. **Day desk** (`/`): every US trading day the AI desk reads the market (CNN Fear & Greed, VIX, the indexes, the news and the calendar), scans a fixed list of liquid US stocks against yesterday's value area, and writes at most three long-only plans in four steps: **Environment, Location, Confirmation, Execution**. A fixed engine then watches the real 5-minute bars: no confirmation bar at the level, no trade. Everything is graded after the close.
2. **Team Lynch** (`/lynch`): seven AI agents investing weekly the way Peter Lynch did, in four themes, against the S&P 500. It started in [ส่องพอร์ต Dime](https://github.com/dreamnattapat/songport-dime) and moved here with its whole git history (the order postmarks depend on it).

Nothing here is real money or investment advice.

## How it works

| When (Bangkok) | What | Where |
| --- | --- | --- |
| Mon–Fri 19:30 | Pre-open scan: market strip, Fear & Greed, value areas of the universe | GitHub Action `day.yml` → `scripts/day-scan.ts` → `public/day/scan/<date>.json` |
| Mon–Fri ~20:05 | AI desk writes the day's plans | scheduled Claude task, `day/PLAYBOOK.md` → `public/day/plans/<date>.json` |
| During the session | The website plays today's plans live through 5-minute bars | `src/lib/day/engine.ts` in the browser |
| Tue–Sat 04:30 | Grade every plan, run the paper account | `day.yml` → `scripts/day-grade.ts` → `public/day/state.json` |
| Tue–Sat 04:30 | Team Lynch fills at the close | `dream.yml` → `scripts/dream-update.ts` → `public/dream/state.json` |
| Mon 18:00, Sat 09:00 | Team Lynch meeting and retro | scheduled Claude tasks, `dream/PLAYBOOK.md` |

Checks: `node scripts/day-check.ts` and `node scripts/dream-check.ts` (both run in the Actions too).

## Develop

```sh
npm install
npm run dev      # Vite on :5173, proxying /api/chart to Yahoo and /api/fng to CNN
npm test
npm run build
```

Deployed as a Cloudflare Worker (`wrangler.jsonc`): static files from `dist/`, plus `worker/index.ts` for `/api/chart/*` (Yahoo Finance) and `/api/fng` (CNN Fear & Greed). Cloudflare builds it from this repo on every push to `main`.
