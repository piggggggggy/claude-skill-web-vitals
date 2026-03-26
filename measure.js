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
};

const { values } = parseArgs({ options, allowPositionals: false });

const config = {
  url:         values.url,
  runs:        values.quick ? 1 : parseInt(values.runs, 10),
  interactive: values.interactive,
  lighthouse:  values.lighthouse,
  timeout:     parseInt(values.timeout, 10),
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
    const { onLCP, onCLS, onFCP, onTTFB } = window.webVitals;
    onLCP(m  => { window.__webVitals.LCP  = m.value; }, { reportAllChanges: true });
    onCLS(m  => { window.__webVitals.CLS  = m.value; }, { reportAllChanges: true });
    onFCP(m  => { window.__webVitals.FCP  = m.value; });
    onTTFB(m => { window.__webVitals.TTFB = m.value; });
  });

  // 타임아웃까지 대기 후 수집
  await new Promise(r => setTimeout(r, Math.min(timeoutMs, 10000)));

  // 페이지 visibility hidden으로 변경하여 LCP 확정
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise(r => setTimeout(r, 500));

  return await page.evaluate(() => window.__webVitals);
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
  const metricNames = ['LCP', 'FCP', 'CLS', 'TTFB'];
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
    runs: config.runs,
    timestamp: new Date().toISOString(),
    metrics,
    rawRuns,
    lighthouse: null,
  };
}

async function main(config) {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    chromium = require('playwright-core').chromium;
  }

  const rawRuns = [];

  for (let i = 0; i < config.runs; i++) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: config.timeout });

    const metrics = await collectMetrics(page, config.timeout);
    rawRuns.push(metrics);

    await browser.close();
  }

  const result = buildResult(config, rawRuns);
  console.log(JSON.stringify(result, null, 2));
}

main(config).catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
