// Config for mco-web-style's tools/verify/ harness (head, axe-matrix,
// keyboard, lint-css). Nothing here is served; run from a kit checkout:
//
//   cd ../mco-web-style
//   node tools/verify/axe-matrix.mjs --config ../mesonet-explorer/verify.config.mjs
//   node tools/verify/keyboard.mjs   --config ../mesonet-explorer/verify.config.mjs
//
// Every browser script runs Chromium AND WebKit by default.

// Render evidence, not a timer. Rows in the screen-reader station table mean
// the station list AND the observations arrived and render() ran. From kit
// 0.9.0 on, the app also calls MCO.ready() only once MapLibre reports station
// dots actually drawn (queryRenderedFeatures on the dot layers), which is the
// proof the worker (CSP worker-src) is alive: a blocked worker leaves the
// table full and the map empty. Pages without MCO.whenReady (kit < 0.9.0)
// fall back to the table alone, so the same config scores a baseline too.
// A function, never a string: the page's meta CSP has no 'unsafe-eval'.
const drawn = () => {
  const rows = document.querySelectorAll('#sr-station-table tbody tr').length;
  const M = window.MCO;
  if (M && M.whenReady && !window.__verifyWatch) {
    window.__verifyWatch = true;
    M.whenReady().then(() => { window.__verifyReady = true; });
  }
  return rows > 50 && (!(M && M.whenReady) || window.__verifyReady === true);
};

// Hover a grid over the map until the station tooltip names a dot. The
// tooltip comes from queryRenderedFeatures, so a hit proves a GeoJSON layer
// painted (not just the basemap).
async function hoverForDot(page) {
  const m = await page.evaluate(() => {
    const r = document.querySelector('.maplibregl-canvas').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 50; col++) {
      await page.mouse.move(Math.round(m.l + m.w * (0.05 + col * 0.018)), Math.round(m.t + m.h * (0.2 + row * 0.022)));
      const id = await page.evaluate(() => {
        const el = document.querySelector('.mco-tooltip');
        return el && el.classList.contains('visible') ? (el.querySelector('.tooltip-sub') || el).textContent : null;
      });
      if (id) return id;
    }
  }
  return null;
}

export default {
  root: '../mesonet-explorer',
  page: 'index.html',
  // The first-run intro modal is a focus trap; seed its key so every scenario
  // starts on the map (keyboard.mjs closes any dialog anyway).
  storage: { 'mco-explorer-seen-intro': '1' },
  settleMs: 1500,
  scenarios: [
    { name: 'latest', query: '', ready: drawn },
    { name: 'daily', query: '?mode=daily&var=ppt', ready: drawn },
    // A deep-linked station opens the detail panel (right dock on desktop,
    // bottom sheet at 390).
    { name: 'station', query: '?station=acemocca', ready: () => {
      const s = document.getElementById('station-sheet');
      return document.querySelectorAll('#sr-station-table tbody tr').length > 50 && !!s && !s.hidden;
    } },
  ],
  exemptTargets: '',
  allowProblems: [],
  dialogOpener: '.mco-btn-info',
  tabStops: 60,
  shortcuts: [
    // "/" focuses station search (WCAG 2.1.4: ?kbd=off disables it).
    { key: '/', effect: () => document.activeElement && document.activeElement.id === 'search-input' },
  ],
  probes: async ({ open, check }) => {
    {
      const { page, close } = await open('', {});
      const id = await hoverForDot(page);
      check('station dots are drawn on the map (hover finds a dot)', !!id, 'no dot under any of 1500 grid points');
      await close();
    }
    {
      const { page, close } = await open('?mode=daily&var=ppt', {});
      check('?mode=daily&var=ppt round-trips in the URL', await page.evaluate(() => /mode=daily/.test(location.search) && /var=ppt/.test(location.search)));
      await close();
    }
    {
      const { page, close } = await open('?kbd=off', {});
      check('?kbd=off sticks in the URL', await page.evaluate(() => /kbd=off/.test(location.search)));
      await close();
    }
  },
};
