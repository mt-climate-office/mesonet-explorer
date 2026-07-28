// URL state.
//
// Two contracts pull in opposite directions and both matter:
//   - the address bar omits anything at its default, so a fresh load is bare;
//   - the share button writes everything, so a recipient sees what the sharer saw.
import { open, recorder } from '../lib/harness.mjs';

export const name = 'url';

const STATE = `(() => ({
  search: location.search,
  keys: [...new URLSearchParams(location.search).keys()].sort().join(','),
  mode: document.querySelector('.seg-btn[data-mode][aria-pressed="true"]')?.dataset.mode,
  variable: document.getElementById('variable-select').value,
  date: document.getElementById('date-input').value,
  hour: document.getElementById('hour-readout').textContent,
  units: document.querySelector('[data-units="si"]').getAttribute('aria-pressed') === 'true' ? 'si' : 'us',
  labels: document.getElementById('btn-labels').getAttribute('aria-pressed'),
  theme: document.documentElement.dataset.theme,
  legendCollapsed: document.getElementById('legend').classList.contains('collapsed'),
  sidebarOpen: !document.body.classList.contains('sidebar-closed'),
  station: new URLSearchParams(location.search).get('station'),
  camera: location.search.match(/lng=([-0-9.]+)&lat=([-0-9.]+)&zoom=([0-9.]+)/)?.slice(1).join(','),
}))()`;

export async function run({ browser, origin }) {
  const t = recorder();

  // A default load must leave no query string at all.
  for (const [label, width, height, touch] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
    const { ctx, page, errors } = await open(browser, origin, { width, height, touch });
    const s = await page.evaluate(STATE);
    t.check(`${label}: default load has a bare URL`, s.search === '', s.search || '(empty)');
    t.check(`${label}: no errors`, errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // Each control adds exactly its own parameter, and removes it again.
  {
    const { ctx, page } = await open(browser, origin);
    const keys = () => page.evaluate(() => [...new URLSearchParams(location.search).keys()].sort().join(',') || '(none)');
    const cycle = async (label, selector, expected, settle = 1800) => {
      await page.click(selector); await page.waitForTimeout(settle);
      const on = await keys();
      await page.click(selector); await page.waitForTimeout(settle);
      const off = await keys();
      t.check(`${label}: adds '${expected}' then clears it`, on === expected && off === '(none)', `${on} -> ${off}`);
    };
    await cycle('network chip', '#subnet-filters .chip', 'net');
    await cycle('value labels', '#btn-labels', 'labels');
    await cycle('theme toggle', '#btn-theme', 'theme');
    await cycle('sidebar collapse', '#sidebar-toggle', 'sidebar', 2600);
    // Units are two buttons rather than a toggle.
    await page.click('[data-units="si"]'); await page.waitForTimeout(1800);
    const si = await keys();
    await page.click('[data-units="us"]'); await page.waitForTimeout(1800);
    t.check(`units: adds 'units' then clears it`, si === 'units' && (await keys()) === '(none)', si);
    // Camera: zooming emits the triple, fit-to-extent clears it.
    await page.click('.maplibregl-ctrl-zoom-in'); await page.waitForTimeout(2200);
    const zoomed = await keys();
    await page.click('.maplibregl-ctrl-fit'); await page.waitForTimeout(2600);
    t.check('camera: emits lat/lng/zoom, cleared by fit-to-extent',
      zoomed === 'lat,lng,zoom' && (await keys()) === '(none)', zoomed);
    await ctx.close();
  }

  // Everything still works as input, and round-trips to the minimal form.
  for (const [query, expectKeys] of [
    ['?mode=daily', 'mode'],
    ['?mode=hourly&date=2026-07-01&hour=6', 'date,hour,mode'],
    ['?var=wind_spd&units=si&counties=on', 'counties,units,var'],
    ['?labels=off', 'labels'],
    ['?kbd=off', 'kbd'],
    ['?legend=collapsed&sidebar=closed', 'legend,sidebar'],
  ]) {
    const { ctx, page, errors } = await open(browser, origin, { query });
    const s = await page.evaluate(STATE);
    t.check(`round-trip ${query}`, s.keys === expectKeys, `got '${s.keys}', wanted '${expectKeys}'`);
    t.check(`round-trip ${query}: no errors`, errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // ?kbd=off must survive, and actually disable the shortcut.
  {
    const { ctx, page } = await open(browser, origin, { query: '?kbd=off' });
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ search: location.search, focus: document.activeElement.id || document.activeElement.tagName }));
    t.check('kbd=off survives and disables the shortcut',
      /kbd=off/.test(r.search) && r.focus !== 'search-input', `${r.search}, focus ${r.focus}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, origin);
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
    await page.waitForTimeout(400);
    const focus = await page.evaluate(() => document.activeElement.id);
    t.check('default: / focuses the search box', focus === 'search-input', focus);
    await ctx.close();
  }

  // Share links: fully specified, and faithful to a recipient whose OS theme and
  // stored preferences are the opposite of the sharer's.
  for (const [label, query, senderScheme] of [
    ['default view', '', 'light'],
    ['complex view', '?mode=hourly&var=wind_spd&units=si&station=acemocca&net=hydromet&counties=on&labels=off&legend=collapsed&sidebar=closed', 'dark'],
  ]) {
    const sender = await open(browser, origin, { query, colorScheme: senderScheme });
    await sender.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await sender.page.click('#btn-share');
    await sender.page.waitForTimeout(800);
    const shared = await sender.page.evaluate(() => navigator.clipboard.readText());
    const senderState = await sender.page.evaluate(STATE);
    const sharedKeys = [...new URL(shared).searchParams.keys()];
    t.check(`share (${label}): fully specified`, sharedKeys.length >= 15, `${sharedKeys.length} parameters`);
    t.check(`share (${label}): pins the theme`, sharedKeys.includes('theme'));
    t.check(`share (${label}): pins the camera`, ['lng', 'lat', 'zoom'].every(k => sharedKeys.includes(k)));
    await sender.ctx.close();

    const recipient = await open(browser, origin, {
      query: new URL(shared).search,
      colorScheme: senderScheme === 'dark' ? 'light' : 'dark',   // opposite OS preference
    });
    const got = await recipient.page.evaluate(STATE);
    const fields = ['mode', 'variable', 'date', 'hour', 'units', 'labels', 'theme',
                    'legendCollapsed', 'sidebarOpen', 'station'];
    const mismatched = fields
      .filter(f => JSON.stringify(senderState[f]) !== JSON.stringify(got[f]))
      .map(f => `${f}: ${senderState[f]} vs ${got[f]}`);
    // Camera needs its own comparison for two reasons. It round-trips through
    // 4- and 2-decimal strings, so a restored zoom of 11.00 can report back as
    // 10.99 — a 0.7% scale difference nobody can see. And at the default extent
    // neither URL carries one at all, which means they match, not that they are
    // missing.
    const cam = v => v ? v.split(',').map(Number) : null;
    const a = cam(senderState.camera), b = cam(got.camera);
    if (!a !== !b) {
      mismatched.push(`camera: ${senderState.camera} vs ${got.camera}`);
    } else if (a && b && !(Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001
                           && Math.abs(a[2] - b[2]) < 0.02)) {
      mismatched.push(`camera: ${senderState.camera} vs ${got.camera}`);
    }
    t.check(`share (${label}): recipient sees the sharer's view`, mismatched.length === 0,
      mismatched.length ? mismatched.join('; ') : 'identical');
    await recipient.ctx.close();
  }

  return t.results;
}
