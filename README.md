# claude-skill-web-vitals

A Claude Code skill that measures Core Web Vitals (LCP, CLS, INP, FCP, TTFB) on local dev servers using Playwright and the [web-vitals](https://github.com/GoogleChrome/web-vitals) library.

## Install

```bash
git clone https://github.com/piggggggggy/claude-skill-web-vitals.git ~/.claude/skills/web-vitals
cd ~/.claude/skills/web-vitals && npm install
```

Playwright chromium is required:

```bash
npx playwright install chromium
```

## Usage

In Claude Code:

```
/web-vitals                          # Measure homepage (desktop, 3 runs)
/web-vitals --device mobile          # Mobile emulation (iPhone 14)
/web-vitals --lighthouse             # Add Lighthouse performance audit
/web-vitals --quick                  # Single run (fast check)
/web-vitals --interactive            # Manual interaction mode (30s)
/web-vitals --paths /,/about         # Measure multiple pages
/web-vitals --device mobile --lighthouse --quick
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--device` | `desktop` | `desktop` (1920x1080) or `mobile` (iPhone 14, 390x844) |
| `--runs` | `3` | Number of measurement runs (median is used) |
| `--quick` | `false` | Single run mode (overrides --runs) |
| `--lighthouse` | `false` | Add Lighthouse Performance score + improvement opportunities |
| `--interactive` | `false` | Opens headed browser for 30s manual interaction (for INP) |
| `--url` | `localhost:3000` | Target URL (auto-detected from package.json) |
| `--timeout` | `30000` | Page load timeout in ms |

## What It Measures

| Metric | Description | Good | Poor |
|--------|-------------|------|------|
| **LCP** | Largest Contentful Paint | ≤2.5s | >4.0s |
| **CLS** | Cumulative Layout Shift | ≤0.1 | >0.25 |
| **INP** | Interaction to Next Paint | ≤200ms | >500ms |
| **FCP** | First Contentful Paint | ≤1.8s | >3.0s |
| **TTFB** | Time to First Byte | ≤800ms | >1800ms |

## Output

**Terminal:** Markdown table with metrics and ratings.

**File:** Auto-saved to `docs/web-vitals/YYYY-MM-DD-HH:mm.md`.

**JSON** (from measure.js directly):

```json
{
  "url": "http://localhost:3000",
  "device": "desktop",
  "runs": 3,
  "timestamp": "2026-03-26T...",
  "metrics": {
    "LCP":  { "value": 1200, "unit": "ms", "rating": "good" },
    "CLS":  { "value": 0.05, "unit": "", "rating": "good" },
    "INP":  { "value": 120, "unit": "ms", "rating": "good" },
    "FCP":  { "value": 800, "unit": "ms", "rating": "good" },
    "TTFB": { "value": 300, "unit": "ms", "rating": "good" }
  },
  "lighthouse": null
}
```

## INP Measurement

INP (Interaction to Next Paint) is fundamentally a Real User Monitoring (RUM) metric. Even Google's Lighthouse uses TBT (Total Blocking Time) as a proxy instead of measuring INP directly.

This tool takes a best-effort approach:

- **Auto mode (default)** — Clicks up to 5 visible buttons to trigger INP. Works well on SPAs with JS event handlers. May return `null` on traditional SSR sites where buttons trigger full page navigation.
- **Interactive mode (`--interactive`)** — Opens a headed browser for 30 seconds of manual interaction. Most accurate for INP measurement.
- **Lighthouse (`--lighthouse`)** — Provides TBT as an INP proxy alongside the performance score.

## How It Works

1. **Project detection** — Reads `package.json` to find the dev server command
2. **Server management** — Auto-detects running server or starts one
3. **Measurement** — Launches Playwright with `--headless=new` (supports INP), injects web-vitals CDN, collects metrics
4. **INP** — Auto-clicks visible buttons to trigger INP; for accurate results use `--interactive`
5. **Aggregation** — Takes median of N runs for each metric
6. **Report** — Outputs to terminal + saves Markdown file

## Standalone Usage

`measure.js` can be run independently without Claude Code:

```bash
node measure.js --url http://localhost:3000 --quick
node measure.js --url http://localhost:3000 --device mobile --lighthouse
```

## Requirements

- Node.js ≥ 18
- Playwright (chromium)

## License

MIT
