// Shared plumbing for the checks in ../suites.
//
// Serves the app from the repo root with Node's own http module (no dependency),
// launches headless Chrome through playwright-core, and provides the couple of
// helpers the suites lean on: a page factory that skips the intro modal, and an
// image differ that runs in a canvas because we have no image library.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const ARTIFACTS = join(ROOT, 'test', 'artifacts');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.fgb': 'application/octet-stream',
};

/** Static file server rooted at the repo. Returns { origin, close }. */
export async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      // normalize + prefix check keeps a crafted path from escaping the root
      const path = join(ROOT, normalize(decodeURIComponent(url.pathname)));
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise(r => server.close(r)),
  };
}

export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true });
}

/**
 * A page with the app loaded and settled.
 *
 * Waits for real evidence of a first render — the screen-reader station table
 * gains rows — rather than a flat timeout or networkidle. The map streams tiles
 * and the app polls, so the network never goes idle; and the live API is
 * sometimes slow enough that any fixed wait is either flaky or wasteful.
 */
export async function open(browser, origin, {
  query = '', width = 1440, height = 900, touch = false,
  colorScheme = 'light', wait = 1500, downloads = false, seenIntro = true,
  waitForData = true,
} = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, hasTouch: touch, isMobile: touch,
    colorScheme, acceptDownloads: downloads,
  });
  // The first-run intro modal is a focus trap; skip it unless a test wants it.
  if (seenIntro) {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('mco-explorer-seen-intro', '1'); } catch {}
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`${origin}/index.html${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (waitForData) {
    // The table is rebuilt on every render, so rows mean stations have arrived
    // AND been drawn. Swallow the timeout: a suite asserting on an empty state
    // should report that itself rather than die here.
    await page.waitForFunction(
      () => document.querySelectorAll('#sr-station-table tbody tr').length > 0,
      null, { timeout: 60000, polling: 250 },
    ).catch(() => {});
  }
  await page.waitForTimeout(wait);
  return { ctx, page, errors };
}

/** PNG dimensions straight from the IHDR chunk — no image library needed. */
export function pngInfo(file) {
  const b = readFileSync(file);
  return {
    validPng: b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    bytes: b.length,
  };
}

/**
 * Compare two PNGs by decoding both into a canvas inside Chrome.
 *
 * Counts pixels differing by more than 8 per channel — below that is JPEG-ish
 * rendering noise, not a real change.
 */
export async function imageDiff(analyser, fileA, fileB) {
  const b64 = f => readFileSync(f).toString('base64');
  return analyser.evaluate(async ([a, b]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true };
    const data = im => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const q = c.getContext('2d'); q.drawImage(im, 0, 0);
      return q.getImageData(0, 0, c.width, c.height).data;
    };
    const da = data(ia), db = data(ib);
    let differing = 0, maxDelta = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > 8) { differing++; if (d > maxDelta) maxDelta = d; }
    }
    return { differing, total: da.length / 4, maxDelta,
             pct: +(100 * differing / (da.length / 4)).toFixed(4) };
  }, [b64(fileA), b64(fileB)]);
}

/** Distinct colours sampled along rows — proves something actually rendered. */
export async function imageStructure(analyser, file) {
  const b64 = readFileSync(file).toString('base64');
  return analyser.evaluate(async (src) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const q = c.getContext('2d'); q.drawImage(img, 0, 0);
    const px = (x, y) => { const d = q.getImageData(x, y, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; };
    const rowColours = (y, step = 6) => {
      const s = new Set();
      for (let x = 0; x < img.width; x += step) s.add(px(x, y));
      return s.size;
    };
    let ramp = 0;
    for (let y = Math.round(img.height * 0.85); y < img.height - 4; y += 4) {
      ramp = Math.max(ramp, rowColours(y, 4));
    }
    return { mapColours: rowColours(Math.round(img.height * 0.45)),
             bandColours: rowColours(Math.round(img.height * 0.93)),
             rampColours: ramp };
  }, b64);
}

export async function artifactDir() {
  await mkdir(ARTIFACTS, { recursive: true });
  return ARTIFACTS;
}

/** Minimal assertion collector. Suites push results; run.mjs prints them. */
export function recorder() {
  const results = [];
  return {
    results,
    check(name, ok, detail = '') { results.push({ ok: !!ok, name, detail: String(detail) }); },
    pass(name, detail = '') { results.push({ ok: true, name, detail: String(detail) }); },
    fail(name, detail = '') { results.push({ ok: false, name, detail: String(detail) }); },
  };
}
