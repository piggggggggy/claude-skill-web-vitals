#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');

const options = {
  url:         { type: 'string',  default: 'http://localhost:3000' },
  runs:        { type: 'string',  default: '3' },
  interactive: { type: 'boolean', default: false },
  lighthouse:  { type: 'boolean', default: false },
  timeout:     { type: 'string',  default: '30000' },
  quick:       { type: 'boolean', default: false },
  device:      { type: 'string',  default: 'mobile' },
};

const { values } = parseArgs({ options, allowPositionals: false });

const device = ['mobile', 'desktop'].includes(values.device) ? values.device : 'mobile';

const config = {
  url:         values.url,
  runs:        values.quick ? 1 : parseInt(values.runs, 10),
  interactive: values.interactive,
  lighthouse:  values.lighthouse,
  timeout:     parseInt(values.timeout, 10),
  device,
};

async function collectMetrics(page, timeoutMs) {
  // web-vitals CDN 주입
  const cdnUrl = 'https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js';
  try {
    await page.addScriptTag({ url: cdnUrl });
  } catch {
    // CSP 차단 시 인라인 fallback
    const response = await fetch(cdnUrl);
    const script = await response.text();
    await page.evaluate(script);
  }

  // 메트릭 수집 시작
  await page.evaluate(() => {
    window.__webVitals = {};
    const { onLCP, onCLS, onFCP, onTTFB, onINP } = window.webVitals;
    onLCP(m  => { window.__webVitals.LCP  = m.value; }, { reportAllChanges: true });
    onCLS(m  => { window.__webVitals.CLS  = m.value; }, { reportAllChanges: true });
    onFCP(m  => { window.__webVitals.FCP  = m.value; });
    onTTFB(m => { window.__webVitals.TTFB = m.value; });
    onINP(m  => { window.__webVitals.INP  = m.value; }, { reportAllChanges: true });
  });

  // 타임아웃까지 대기 후 수집
  await new Promise(r => setTimeout(r, Math.min(timeoutMs, 10000)));

  // 페이지 visibility hidden으로 변경하여 LCP 확정
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise(r => setTimeout(r, 500));

  return await page.evaluate(() => window.__webVitals);
}

async function autoInteract(page) {
  // Intercept navigations during interaction to preserve metrics
  await page.route('**/*', (route) => {
    if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) {
      // Allow the initial page, block subsequent navigations
      if (route.request().url() !== page.url()) {
        route.abort().catch(() => {});
        return;
      }
    }
    route.continue().catch(() => {});
  });

  const selectors = 'button, a[href], input, select, [role="button"]';
  const elements = await page.$$(selectors);
  const visible = [];

  for (const el of elements) {
    if (visible.length >= 5) break;
    const isVisible = await el.isVisible().catch(() => false);
    if (isVisible) visible.push(el);
  }

  for (const el of visible) {
    try {
      await el.click({ timeout: 2000 });
      await new Promise(r => setTimeout(r, 300));
    } catch {
      // 클릭 실패 시 무시하고 다음 요소
    }
  }

  // Remove route interception
  await page.unroute('**/*').catch(() => {});
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
    const browser = await chromium.launch({
      headless: !config.interactive,
    });
    const context = await browser.newContext(deviceProfile);
    const page = await context.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: config.timeout });

    const preInteractMetrics = await collectMetrics(page, config.timeout);

    if (config.interactive) {
      console.error('Interactive mode: 브라우저에서 30초간 자유롭게 조작하세요...');
      await new Promise(r => setTimeout(r, 30000));
    } else {
      await autoInteract(page);
    }
    await new Promise(r => setTimeout(r, 500));

    // After interaction, page may have navigated (e.g. clicking links),
    // which destroys window.__webVitals. Fall back to pre-interaction metrics.
    const postMetrics = await page.evaluate(() => window.__webVitals).catch(() => null);
    const metrics = (postMetrics && typeof postMetrics === 'object' && Object.keys(postMetrics).length > 0)
      ? postMetrics
      : preInteractMetrics;
    rawRuns.push(metrics);

    await browser.close();
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
