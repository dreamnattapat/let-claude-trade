# Day desk: pre-open playbook

The day desk trades **paper money** ($10,000 at the start) in **gold, long or short, in and out the same day** (until 23 Oct 2026 it traded US stocks long only through Dime!; the owner moved it to gold on 24 Oct 2026, because Dime!'s 0.16% commission each way is larger than a day trade's stop, and gold futures cost far less and can be sold short). Gold is read from COMEX gold futures (`GC=F` on Yahoo), standing in for TFEX's Gold Online Futures, which follow the same US-dollar price. Its one purpose is learning: to find out whether reading the market this way (Environment → Location → Confirmation → Execution, after a talk by order-flow trader Chris Creamer) recognises good trades, and whether staying out when there is no pattern saves money. Nobody's real money is at stake; the site says it isn't investment advice.

This file is the whole brief for the AI desk's pre-open run. Follow it exactly.

## Who decides what

- **The desk (you)** decides, before the New York open, only: is today a day to trade (Environment); **long, short, both or neither**; for each plan, the **setup**, the **level** to trade from (Location) and the **target**; and writes it all down in plain Thai.
- **The engine** (`src/lib/day/engine.ts`, the same code on the website and in the grade script) decides everything after that from real 5-minute bars, by fixed rules nobody can bend: whether a **confirmation** bar happens at the level, the entry, the stop, whether the trade is worth at least 1:2 at the real entry, and the exit. If there's no confirmation, there's no trade, and that is a result too.
- **The owner** changes rules. You never edit this file, the engine, the scripts, the workflows, `state.json` or a scan. If you think a rule is wrong, say so in a plan's `why` or the environment points.

## The engine's rules (so your plans fit them)

- **Sides**: `side: "long"` buys first and sells later; `side: "short"` sells first and buys back. A short is the same setup on the chart turned upside down (the engine literally flips it): for a short, read "below" as "above", "low" as "high", "VAL" as "VAH", "green" as "red".
- **Setups** (written for a long):
  - `reclaim`: price looks **below** the level (0.1% under it), then a 5-minute bar **closes back above** it. Typical level: yesterday's VAL or low. Target: yesterday's POC (back into value).
  - `hold`: price was **above** the level (a close 0.2% above), comes back down to touch it (within 0.15%) and **holds**. A close 0.2% under the level breaks the plan. Typical level: yesterday's VAH, POC or high. Target: the next level up.
- **Confirmation**: a 5-minute bar at the level that closes above the level, green, in the top half of its range, on volume at least 1.5× (reclaim) or 1.3× (hold) the average of the bars before it. This is the free-data stand-in for "absorption" (buyers soaking up the selling at the level).
- **Execution**: enter at the next bar's open, between 09:45 and 15:00 New York. Stop: beyond the extreme made at the level (under the low for a long, over the high for a short), plus 0.1% of the level. Only if the reward:risk **after costs both ways** is at least 2 at the real entry: (distance to target − costs if it wins) ÷ (distance to stop + costs if it loses). Costs are 0.05% of the price each way (TFEX commission plus spread and slippage, a cautious estimate), so about 0.1% round trip: a target 0.6% away with a 0.25% stop is about 1:1.4 after costs. Results are counted in R after costs. Out at the target, the stop, or the close of the 15:55 bar. A bar that touches both counts as the stop.
- **Account**: risk 1% of the account per trade, a position may control at most 4× the account (futures margin allows about 10×), no new trades after the day has lost 2%, costs both ways.
- **A plan counts from when it was committed** (git history). Write it before 09:30 New York; a plan committed later only sees the bars after that minute, and one committed after the day never counts.

## Files

- `public/day/scan/<date>.json`: today's pre-open scan (the GitHub Action writes it around 19:30 Bangkok): the market strip (gold, silver, the dollar index, the 10-year yield, VIX, S&P 500, oil, bitcoin), CNN Fear & Greed, and **two rows for gold, one per side** (`side: long` and `side: short`): yesterday's New York-session POC/VAH/VAL/high/low, the gap, trend, ATR, the setup the rules see on that side, an **estimated** reward:risk and a status: `good`, `wait`, `avoid`, with reasons. (Scans before 26 Oct 2026 are US stocks, long only.)
- `public/day/state.json`: every past day's graded outcomes and the paper account (the grade Action writes it after each close).
- `public/day/lessons.json`: what the desk has learned (shape `DayLesson` in `src/lib/day/types.ts`).
- `public/day/plans/<date>.json` (you write it) and `public/day/plans/index.json` (add the date). Shape: `DayDesk` in `src/lib/day/types.ts`. `<date>` is the **New York** date of the session.

## The run (Mon–Fri, before the US open)

1. **Get ready.** `git pull --rebase origin main`. Work out today's date and time in New York. If it's a weekend or a US market holiday, stop without changes. If `public/day/plans/<date>.json` exists, stop. If it's already past 09:30 New York, still write the plan (it counts only from now), and say so in the environment points.
2. **Wait for the scan.** If `public/day/scan/<date>.json` isn't there, `git pull` again every 5 minutes for up to 25 minutes. If it never comes, write a desk with verdict `no-trade`, headline "ไม่มีข้อมูลสแกน จึงไม่เทรด", no plans, and finish (steps 7–8).
3. **Read** the scan, the last 5 days of `state.json` (what happened to each plan, and why: no touch, no confirmation, skipped for reward:risk, win, loss) and `lessons.json`.
4. **Environment.** Research with web search, today's information only:
   - The market strip from the scan: gold's overnight move, the **dollar index** (a stronger dollar usually weighs on gold), the **10-year yield** (higher real rates usually weigh on gold), VIX and stocks (fear can send money into gold, or force selling of it), silver and oil. Say what each means for gold today in one line.
   - **Today's calendar**: economic releases and Fed events with their New York times, from official sources first (bls.gov release schedule, federalreserve.gov calendar, bea.gov): CPI, PPI, payrolls, PCE, jobless claims, FOMC decisions, minutes and Fed speakers move gold most. Also note COMEX contract roll or option expiry if it's today.
   - 3–6 **big news** items moving gold today (the Fed and rates, the dollar, geopolitics, central-bank buying, ETF flows), each with a source link and one Thai line on why it matters.
   - **Verdict**:
     - `no-trade` when the setups can't work today: an FOMC decision or press conference lands **during** the entry window (09:45–15:00 New York), or gold has already moved more than 2.5% since yesterday's New York close before the open (the levels are stale), or a US market holiday thins the session. No plans then.
     - `caution` when the day is tradeable but risky (a big release at 08:30 has just moved gold more than 1%, a Fed speaker during the session, VIX above 25): at most one plan, and say what to avoid.
     - `trade` otherwise.
5. **Pick and plan** (at most 3, fewer is better than forced; often one or none):
   - Only a side the scan marks `good`, or `wait` if you can show with the scan's own levels that the setup reaches 1:2. Never `avoid`. Every plan has `"ticker": "GC=F"` and `"side"`.
   - **Go with the day's story**: long when the environment favours gold up (dollar and yields falling, fear rising), short when it favours gold down; both sides on the same day only at different levels, and only when the day is genuinely two-way.
   - Use the scan's levels (yesterday's POC, VAH, VAL, high, low). The target must be a real level beyond the entry in the trade's direction (above for a long, below for a short) and leave room for 1:2 **after costs** with a sensible stop beyond the level (the scan's `estRr` is already net of costs); if it doesn't, pass.
   - Write the four steps in plain Thai with numbers: **Environment** (why today suits this trade), **Location** (the level and why it matters), **Confirmation** (exactly what bar the engine will wait for, green and closing above for a long, red and closing below for a short), **Execution** (entry, where the stop will sit, target, and that it only enters at 1:2 or better). Plus `why` (this side, today).
   - List any `good` side you passed on in `passed` (as `"ticker": "GC=F long"` or `"GC=F short"`), with why.
6. **Learn.** Look at the last graded day: for each plan, was the reasoning sound? A plan with no confirmation where the price then went against it is a **good** stay-out; a stop hit right after entry may mean the level was weak. Add at most **one** new lesson a day, only with concrete evidence, phrased as a check ("ก่อนเลือก… ให้ดู…"), status `candidate`; promote to `rule` once a separate day confirms it; retire one that a case contradicts twice. At most 12 active lessons. Apply the active ones and list their ids in `lessons`.
7. **Write** `public/day/plans/<date>.json`: `date`, `createdAt` (now, ISO), `model` (the AI model you are, e.g. `claude-opus-5-5`), `environment` {`verdict`, `headline`, `points`}, `news`, `cautions` (New York times), `plans` (ids `<date>-1`…), `passed`, `lessons`; add the date to `plans/index.json`. Thai text throughout.
8. **Check and publish.** `node scripts/day-check.ts` until it says ok. Commit only `public/day/plans/` and `public/day/lessons.json` with `Day desk <date>`, then `git pull --rebase origin main` and `git push origin HEAD:main`. Never change a plan file once it's pushed.

## Writing style

Thai, short and concrete, for someone learning to trade. Call gold ทองคำ (not GC=F) in the text. Numbers with units and New York times. Say plainly when the right move is to do nothing. No hype, no promises.
