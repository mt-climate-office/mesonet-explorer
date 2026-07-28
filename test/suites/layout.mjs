// Layout and reachability.
//
// These are the checks that caught the most real bugs during the sidebar work:
// controls hidden behind a horizontal scroll, a detail panel whose links were
// covered by another element, a header that silently grew an empty 14px strip.
import { open, recorder } from '../lib/harness.mjs';

export const name = 'layout';

// Anything the user must be able to hit must actually be on top at its own centre.
const REACHABILITY = `(() => {
  const q = s => document.querySelector(s);
  const sheet = q('#station-sheet:not([hidden])');
  const scroller = q('#sheet-body');
  const targets = sheet ? [...sheet.querySelectorAll('.pop-links a,.pop-sibling-link,.sheet-close')] : [];
  const dead = targets.filter(el => {
    const first = el.getBoundingClientRect();
    if (!(first.width > 0 && first.height > 0)) return false;
    // Content below a scrollport's fold is legitimately not hittable.
    if (scroller && !el.closest('.pop-head')) el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !(hit && hit.closest('#station-sheet'));
  }).map(el => el.textContent.trim().slice(0, 18));
  const nb = q('#navbar'), cb = q('#control-bar'), map = q('#map');
  const mr = map.getBoundingClientRect();
  const chrome = Math.round(nb.getBoundingClientRect().height) + (cb.hidden ? 0 : Math.round(cb.getBoundingClientRect().height));
  const panel = sheet && sheet.getBoundingClientRect();
  return {
    dead,
    panelOpen: !!sheet,
    panelInsideViewport: panel ? (panel.top >= -1 && panel.bottom <= innerHeight + 1 &&
                                  panel.left >= -1 && panel.right <= innerWidth + 1) : null,
    // A gap here means something invisible is still taking up space.
    chromeGap: Math.round(mr.top) - chrome,
    controlBarOverflow: cb.hidden ? 0 : cb.scrollWidth - cb.clientWidth,
    navbarOverflow: nb.scrollWidth - nb.clientWidth,
    sheetOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    documentOverflow: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    variableOnScreen: (() => { const v = q('#variable-select').getBoundingClientRect();
      return v.left >= 0 && v.right <= innerWidth; })(),
    legendParent: q('#legend').parentElement.id,
    srTableRows: document.querySelectorAll('#sr-station-table tbody tr').length,
    themeApplied: !!document.documentElement.dataset.theme,
  };
})()`;

const VIEWPORTS = [
  ['320x568 phone (small)', 320, 568, true],
  ['390x844 phone', 390, 844, true],
  ['844x390 phone landscape', 844, 390, true],
  ['768x1024 tablet', 768, 1024, true],
  ['1440x900 desktop', 1440, 900, false],
  ['1920x1080 desktop (large)', 1920, 1080, false],
];

export async function run({ browser, origin }) {
  const t = recorder();

  for (const [label, width, height, touch] of VIEWPORTS) {
    const { ctx, page, errors } = await open(browser, origin, {
      query: '?station=acemocca', width, height, touch,
    });
    // Expand the peek sheet so its links are in play.
    await page.evaluate(() => {
      const s = document.getElementById('station-sheet');
      if (s && !s.hidden && s.dataset.state === 'peek') document.getElementById('sheet-expand').click();
    });
    await page.waitForTimeout(1400);
    const r = await page.evaluate(REACHABILITY);

    t.check(`${label}: detail panel opens`, r.panelOpen);
    t.check(`${label}: panel inside the viewport`, r.panelInsideViewport !== false);
    t.check(`${label}: every panel control is clickable`, r.dead.length === 0, r.dead.join(', ') || 'none dead');
    t.check(`${label}: no invisible chrome`, r.chromeGap === 0, `${r.chromeGap}px gap above the map`);
    t.check(`${label}: nothing hidden behind a scroll`,
      r.controlBarOverflow === 0 && r.navbarOverflow === 0 && r.sheetOverflow === 0 && r.documentOverflow === 0,
      `bar ${r.controlBarOverflow}, nav ${r.navbarOverflow}, sheet ${r.sheetOverflow}, doc ${r.documentOverflow}`);
    t.check(`${label}: variable picker on screen`, r.variableOnScreen);
    t.check(`${label}: legend lives in the sidebar`, r.legendParent === 'sb-legend', r.legendParent);
    t.check(`${label}: screen-reader table populated`, r.srTableRows > 100, `${r.srTableRows} rows`);
    // Proves the inline theme script ran, i.e. the pinned CSP hash still matches.
    t.check(`${label}: inline theme script ran (CSP hash valid)`, r.themeApplied);
    t.check(`${label}: no errors`, errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // Header height must track mesonet-status: navbar only, map flush beneath it.
  for (const width of [1100, 1280, 1440, 1512]) {
    const { ctx, page } = await open(browser, origin, { width, height: 900 });
    const r = await page.evaluate(() => {
      const nb = document.getElementById('navbar').getBoundingClientRect();
      const map = document.getElementById('map').getBoundingClientRect();
      return { navH: Math.round(nb.height), mapTop: Math.round(map.top) };
    });
    t.check(`${width}px: header 54px with the map flush beneath`,
      r.navH === 54 && r.mapTop === 54, `navbar ${r.navH}, map starts at ${r.mapTop}`);
    await ctx.close();
  }

  // Mobile header: one row in Latest, two in Hourly and Daily, down to 320px.
  for (const mode of ['latest', 'hourly', 'daily']) {
    for (const width of [320, 375, 390]) {
      const { ctx, page } = await open(browser, origin, {
        query: `?mode=${mode}`, width, height: 780, touch: true,
      });
      const r = await page.evaluate(() => {
        const nb = document.getElementById('navbar'), cb = document.getElementById('control-bar');
        return { chrome: Math.round(cb.hidden ? nb.getBoundingClientRect().bottom
                                              : cb.getBoundingClientRect().bottom),
                 overflow: (cb.hidden ? 0 : cb.scrollWidth - cb.clientWidth) + (nb.scrollWidth - nb.clientWidth) };
      });
      const expected = mode === 'latest' ? 60 : 115;   // one row vs two, with slack
      t.check(`${width}px ${mode}: header stays compact`,
        r.chrome <= expected && r.overflow === 0, `${r.chrome}px, overflow ${r.overflow}`);
      await ctx.close();
    }
  }

  return t.results;
}
