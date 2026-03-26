#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');

const options = {
  url:         { type: 'string',  default: 'http://localhost:3000' },
  device:      { type: 'string',  default: 'desktop' },
  quick:       { type: 'boolean', default: false },
  lighthouse:  { type: 'boolean', default: false },
  interactive: { type: 'boolean', default: false },
  // Advanced (standalone usage)
  runs:        { type: 'string',  default: '3' },
  timeout:     { type: 'string',  default: '30000' },
};

const { values } = parseArgs({ options, allowPositionals: false });

const config = {
  url:         values.url,
  device:      ['mobile', 'desktop'].includes(values.device) ? values.device : 'desktop',
  runs:        values.quick ? 1 : parseInt(values.runs, 10),
  lighthouse:  values.lighthouse,
  interactive: values.interactive,
  timeout:     parseInt(values.timeout, 10),
};

async function injectWebVitals(page) {
  const cdnUrl = 'https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js';

  // Try addScriptTag first, then fetch+evaluate as fallback
  let loaded = false;
  try {
    await page.addScriptTag({ url: cdnUrl });
    loaded = await page.evaluate(() => typeof window.webVitals !== 'undefined');
  } catch { /* CSP or network block */ }

  if (!loaded) {
    const response = await fetch(cdnUrl);
    const script = await response.text();
    await page.addScriptTag({ content: script });
    loaded = await page.evaluate(() => typeof window.webVitals !== 'undefined');
  }

  if (!loaded) throw new Error('web-vitals library failed to load');

  // 메트릭 옵저버 등록
  await page.evaluate(() => {
    window.__webVitals = {};
    const { onLCP, onCLS, onFCP, onTTFB, onINP } = window.webVitals;
    onLCP(m  => { window.__webVitals.LCP  = m.value; }, { reportAllChanges: true });
    onCLS(m  => { window.__webVitals.CLS  = m.value; }, { reportAllChanges: true });
    onFCP(m  => { window.__webVitals.FCP  = m.value; });
    onTTFB(m => { window.__webVitals.TTFB = m.value; });
    onINP(m  => { window.__webVitals.INP  = m.value; }, { reportAllChanges: true });
  });
}

async function finalizeMetrics(page) {
  // visibilitychange로 LCP/CLS/INP 확정
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise(r => setTimeout(r, 500));

  return await page.evaluate(() => window.__webVitals);
}

async function autoInteract(page) {
  // Click a few non-form buttons to trigger INP measurement.
  // Intentionally simple — for accurate INP, use --interactive mode.
  const buttons = await page.$$('button:not([type="submit"]):not(form button), [role="button"]');
  let clicked = 0;

  for (const el of buttons) {
    if (clicked >= 5) break;
    const isVisible = await el.isVisible().catch(() => false);
    if (!isVisible) continue;
    try {
      await el.click({ timeout: 2000 });
      clicked++;
      await new Promise(r => setTimeout(r, 300));
    } catch { /* skip */ }
  }
}

const THRESHOLDS = {
  LCP:  { good: 2500,  poor: 4000,  unit: 'ms' },
  CLS:  { good: 0.1,   poor: 0.25,  unit: ''   },
  INP:  { good: 200,   poor: 500,   unit: 'ms' },
  FCP:  { good: 1800,  poor: 3000,  unit: 'ms' },
  TTFB: { good: 800,   poor: 1800,  unit: 'ms' },
};

function rate(name, value) {
  if (value === null || value === undefined) return null;
  const t = THRESHOLDS[name];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function median(arr) {
  const nums = arr.filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

function buildResult(config, rawRuns) {
  const metricNames = ['LCP', 'FCP', 'CLS', 'TTFB', 'INP'];
  const metrics = {};

  for (const name of metricNames) {
    const values = rawRuns.map(run => run[name] ?? null);
    const med = median(values);
    metrics[name] = {
      value: med,
      unit: THRESHOLDS[name].unit,
      rating: rate(name, med),
    };
  }

  return {
    url: config.url,
    device: config.device,
    runs: config.runs,
    timestamp: new Date().toISOString(),
    metrics,
    rawRuns,
    lighthouse: null,
  };
}

async function runLighthouse(url, device) {
  const { execFileSync } = require('node:child_process');
  try {
    const args = [
      'lighthouse', url,
      '--output=json',
      '--quiet',
      '--only-categories=performance',
      '--chrome-flags=--headless=new --no-sandbox',
    ];
    if (device === 'desktop') args.push('--preset=desktop');
    const stdout = execFileSync('npx', args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

    const report = JSON.parse(stdout.toString());
    const perf = report.categories?.performance;
    const audits = report.audits || {};

    const opportunities = Object.values(audits)
      .filter(a => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 5)
      .map(a => ({
        title: a.title,
        description: a.description,
        score: a.score,
        displayValue: a.displayValue || null,
      }));

    return {
      score: perf ? Math.round(perf.score * 100) : null,
      opportunities,
    };
  } catch (err) {
    return { score: null, error: err.message, opportunities: [] };
  }
}

const DEVICE_PROFILES = {
  mobile: {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

async function main(config) {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    chromium = require('playwright-core').chromium;
  }

  const deviceProfile = DEVICE_PROFILES[config.device];
  const rawRuns = [];

  for (let i = 0; i < config.runs; i++) {
    const launchOptions = config.interactive
      ? { headless: false }
      : { headless: false, args: ['--headless=new'] };
    const browser = await chromium.launch(launchOptions);

    try {
      const context = await browser.newContext(deviceProfile);
      const page = await context.newPage();
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

      // web-vitals 주입 + 옵저버 등록
      await injectWebVitals(page);

      // FCP/TTFB/LCP 등 초기 메트릭 수집 대기
      await new Promise(r => setTimeout(r, 3000));

      // 초기 메트릭 스냅샷 (인터랙션 전)
      const preMetrics = await page.evaluate(() => ({ ...window.__webVitals })).catch(() => ({}));

      // 인터랙션 수행 (INP 트리거)
      if (config.interactive) {
        console.error('Interactive mode: 브라우저에서 30초간 자유롭게 조작하세요...');
        await new Promise(r => setTimeout(r, 30000));
      } else {
        await autoInteract(page);
      }
      await new Promise(r => setTimeout(r, 500));

      // visibilitychange로 LCP/CLS/INP 확정 후 메트릭 수집
      let postMetrics;
      try {
        postMetrics = await finalizeMetrics(page);
      } catch {
        postMetrics = await page.evaluate(() => window.__webVitals).catch(() => null);
      }

      // 병합: postMetrics 우선, navigation으로 유실된 항목은 preMetrics로 보완
      const merged = { ...preMetrics };
      if (postMetrics && typeof postMetrics === 'object') {
        for (const key of Object.keys(postMetrics)) {
          if (postMetrics[key] !== null && postMetrics[key] !== undefined) {
            merged[key] = postMetrics[key];
          }
        }
      }
      rawRuns.push(merged);
    } catch {
      // Run failed (navigation, timeout, etc.) — skip this run
      rawRuns.push({});
    } finally {
      await browser.close();
    }
  }

  const result = buildResult(config, rawRuns);

  if (config.lighthouse) {
    result.lighthouse = await runLighthouse(config.url, config.device);
  }

  console.log(JSON.stringify(result, null, 2));
}

main(config).catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
