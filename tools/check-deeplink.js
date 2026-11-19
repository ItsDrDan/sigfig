#!/usr/bin/env node
/* Deep-link checks: ?topic=glass opens practice on "Read the glassware" only (with or without ?course=), and the plain URL still
   opens the normal start screen. Runs at a phone size (390×844, touch) and a desktop size; fails on any console error.
   Usage: NODE_PATH=<node_modules with playwright> node tools/check-deeplink.js */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright not found. Run with NODE_PATH pointing at a node_modules that has playwright, e.g.\n  NODE_PATH=/path/to/node_modules node tools/check-deeplink.js'); process.exit(2); }
const path = require('path'), fs = require('fs'), url = require('url');
const ROOT = path.join(__dirname, '..'), GH = path.join(ROOT, '..');
const page0 = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
const SIZES = [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['desktop', { viewport: { width: 1280, height: 900 } }]];
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } };
/* offline and repeatable: itsdrdan.github.io/<repo>/… is served from the sibling local clone when it exists; every other web request gets an empty reply */
async function route(ctx) {
  await ctx.route(/^https?:/, r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'itsdrdan.github.io') { const f = path.join(GH, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f }); }
    return r.fulfill({ status: 200, body: '' });
  });
}
async function run(CASES) {
  const browser = await chromium.launch();
  for (const [size, opts] of SIZES) for (const c of CASES) {
    const ctx = await browser.newContext(opts); await route(ctx);
    const page = await ctx.newPage(), errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(page0 + c.q, { waitUntil: 'load' }); await page.waitForTimeout(400);
    const f0 = fail, tag = size + ' ' + (c.q || '(no parameters)');
    try { await c.check(page, (cond, m) => ok(cond, tag + ': ' + m)); } catch (e) { ok(false, tag + ': ' + e.message); }
    ok(!errs.length, tag + ': console errors: ' + errs.join(' | '));
    console.log((fail > f0 ? '  ' : 'ok') + ' ' + tag);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${n - fail}/${n} deep-link checks passed`); process.exit(fail ? 1 : 0);
}
const glass = async (page, ok) => {
  ok(await page.evaluate(() => state.sel.size === 1 && state.sel.has('glass') && !state.quiz), 'only "Read the glassware" is selected');
  ok(await page.locator('#playArea').isVisible() && await page.locator('#emptyBox').isHidden(), 'practice area is open');
  ok(await page.locator('[data-cat="lab"].on').isVisible() && await page.locator('[data-topic="glass"].on').isVisible(), 'Lab Measurements card and glassware chip are on');
  for (let i = 0; i < 6; i++) {
    ok(await page.evaluate(() => state.q && state.q.topic === 'glass'), 'question ' + (i + 1) + ' is a glassware reading');
    ok(await page.locator('#playArea svg').first().isVisible(), 'question ' + (i + 1) + ' shows a drawing');
    await page.evaluate(() => newQuestion());
  }
};
run([
  { q: '', check: async (page, ok) => {
    ok(await page.evaluate(() => state.course === '3A' && state.sel.size === 0), 'CHEM 3A, nothing selected');
    ok(await page.locator('#emptyBox').isVisible() && await page.locator('#playArea').isHidden(), 'start screen (pick a topic) is showing');
  } },
  { q: '?topic=glass', check: glass },
  { q: '?course=1A&topic=glass', check: async (page, ok) => { await glass(page, ok); ok(await page.evaluate(() => state.course === '1A'), 'course=1A still applies'); } },
  { q: '?topic=glass,digital', check: async (page, ok) => { ok(await page.evaluate(() => state.sel.size === 2 && state.sel.has('glass') && state.sel.has('digital')), 'comma list selects both topics'); } },
  { q: '?topic=nonsense', check: async (page, ok) => { ok(await page.locator('#emptyBox').isVisible(), 'unknown topic is ignored'); } },
]);
