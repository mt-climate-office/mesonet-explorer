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
    if (scroller && !el.closest('.mco-sheet-head')) el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !(hit && hit.closest('#station-sheet'));
  }).map(el => el.textContent.trim().slice(0, 18));
  // One bar since kit 0.21.0's compact bar: the phone's second row is gone.
  const nb = q('#navbar'), map = q('#map');
  const mr = map.getBoundingClientRect();
  // On a landscape phone the navbar is the kit's left rail (0.10.0), beside the
  // map rather than above it, so it only counts as chrome above when it spans
  // the width.
  const navAbove = nb.getBoundingClientRect().width >= innerWidth - 1;
  const chrome = navAbove ? Math.round(nb.getBoundingClientRect().height) : 0;
  const panel = sheet && sheet.getBoundingClientRect();
  return {
    dead,
    panelOpen: !!sheet,
    panelInsideViewport: panel ? (panel.top >= -1 && panel.bottom <= innerHeight + 1 &&
                                  panel.left >= -1 && panel.right <= innerWidth + 1) : null,
    // A gap here means something invisible is still taking up space.
    chromeGap: Math.round(mr.top) - chrome,
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
      r.navbarOverflow === 0 && r.sheetOverflow === 0 && r.documentOverflow === 0,
      `nav ${r.navbarOverflow}, sheet ${r.sheetOverflow}, doc ${r.documentOverflow}`);
    t.check(`${label}: variable picker on screen`, r.variableOnScreen);
    // Its section moves into the nav drawer on compact (layoutControls), so the
    // parent is the same section at every size.
    t.check(`${label}: legend lives in its sidebar section`, r.legendParent === 'sb-legend', r.legendParent);
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

  // Control groups: one set of collapsible groups, the same headings in the
  // same order wherever the controls are (the desktop sidebar, the ☰ drawer
  // on a phone, the drawer beside the landscape rail). On a phone Search,
  // Networks, Time and Variable start open and Legend, Overlays and More
  // closed; on desktop all start open, and More is the bar's own controls
  // rather than a group. A group with nothing to show (Variable on a portrait
  // phone in Latest, its picker being the bar's hot control) is hidden.
  const ORDER = ['Search', 'Networks', 'Time', 'Variable', 'Legend', 'Overlays', 'More'];
  const GROUP_VIEWS = [
    // label, w, h, touch, expected visible headings, expected open, drawer must fit
    ['320x568 phone', 320, 568, true, ['Search', 'Networks', 'Time', 'Legend', 'Overlays', 'More'], ['Search', 'Networks', 'Time'], 'controls'],
    ['390x664 phone (browser chrome showing)', 390, 664, true, ['Search', 'Networks', 'Time', 'Legend', 'Overlays', 'More'], ['Search', 'Networks', 'Time'], true],
    ['390x844 phone', 390, 844, true, ['Search', 'Networks', 'Time', 'Legend', 'Overlays', 'More'], ['Search', 'Networks', 'Time'], true],
    ['844x390 phone landscape', 844, 390, true, ['Search', 'Networks', 'Time', 'Variable', 'Legend', 'Overlays', 'More'], ['Search', 'Networks', 'Time', 'Variable'], false],
    ['1440x900 desktop', 1440, 900, false, ['Search', 'Networks', 'Time', 'Variable', 'Legend', 'Overlays'], ['Search', 'Networks', 'Time', 'Variable', 'Legend', 'Overlays'], true],
  ];
  for (const [label, width, height, touch, wantHeads, wantOpen, mustFit] of GROUP_VIEWS) {
    const { ctx, page, errors } = await open(browser, origin, { width, height, touch });
    await page.evaluate(() => {
      const b = document.getElementById('btn-rail');
      if (b.getBoundingClientRect().width > 0) b.click();
    });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const drawer = document.getElementById('nav-drawer');
      const inDrawer = drawer.classList.contains('is-open');
      const panel = inDrawer ? drawer : document.querySelector('#sidebar .sidebar-scroll');
      const heads = [...panel.querySelectorAll('summary.sb-head, #more-head')]
        .filter(el => el.getBoundingClientRect().height > 0);
      const name = el => el.textContent.trim();
      const isOpen = el => el.tagName === 'SUMMARY' ? el.parentElement.open : el.getAttribute('aria-expanded') === 'true';
      const moreInBar = (() => { const m = document.getElementById('more-head'); return m.getBoundingClientRect().height > 0; })();
      return {
        inDrawer,
        heads: heads.map(name),
        open: heads.filter(isOpen).map(name),
        minH: Math.min(...heads.map(el => Math.round(el.getBoundingClientRect().height))),
        client: panel.clientHeight, scroll: panel.scrollHeight,
        // How far the lowest visible heading or control sits below the panel's
        // bottom edge (≤ 0: all of them on screen without scrolling).
        ctrlOverhang: Math.round(Math.max(...[...panel.querySelectorAll('summary, button, select, input')]
          .filter(el => el.checkVisibility ? el.checkVisibility() : el.getBoundingClientRect().height > 0)
          .map(el => el.getBoundingClientRect().bottom)) - panel.getBoundingClientRect().bottom),
        moreInBar: !inDrawer && moreInBar,
        // Every visible group shows at least one control of its own.
        empty: [...panel.querySelectorAll('details.sb-section')].filter(d => !d.hidden &&
          !d.querySelector(':scope > :not(summary):not([hidden])')).map(d => d.id),
      };
    });
    t.check(`${label}: groups in the one order`, JSON.stringify(r.heads) === JSON.stringify(wantHeads) &&
      r.heads.every((h, i, a) => i === 0 || ORDER.indexOf(a[i - 1]) < ORDER.indexOf(h)), r.heads.join(' › '));
    t.check(`${label}: default open groups`, JSON.stringify(r.open) === JSON.stringify(wantOpen), r.open.join(', '));
    t.check(`${label}: group headings at --control-h`, r.minH >= (touch ? 40 : 34), `${r.minH}px`);
    t.check(`${label}: no empty group shown`, r.empty.length === 0, r.empty.join(', ') || 'none');
    if (!r.inDrawer) t.check(`${label}: More stays the bar's own controls`, !r.moreInBar && r.heads.indexOf('More') < 0);
    // At 320x568 the note (status text, the drawer's last line) may sit just
    // below the fold; every heading and control must not.
    if (mustFit === 'controls') t.check(`${label}: every heading and control on screen without scrolling`,
      r.ctrlOverhang <= 0, `${r.scroll}px content in ${r.client}px; lowest control ${r.ctrlOverhang}px past the edge`);
    else if (mustFit) t.check(`${label}: ${r.inDrawer ? 'drawer' : 'sidebar'} fits without scrolling`, r.scroll <= r.client,
      `${r.scroll}px content in ${r.client}px`);
    else t.check(`${label}: ${r.inDrawer ? 'drawer' : 'sidebar'} measured`, r.scroll > 0, `${r.scroll}px content in ${r.client}px`);
    t.check(`${label}: no errors with groups`, errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // The Legend group's heading is the legend's ONE collapse control, and
  // ?legend= drives it at every width (the URL wins over a saved state).
  for (const [label, width, height, touch] of [['390x844 phone', 390, 844, true], ['1440x900 desktop', 1440, 900, false]]) {
    for (const [query, wantOpen] of [['', !touch], ['?legend=collapsed', false], ['?legend=open', true]]) {
      // A saved state that disagrees with the URL, to prove the URL wins.
      const cls = touch ? 'compact' : 'wide';
      const saved = query ? JSON.stringify({ legend: query.endsWith('collapsed') }) : null;
      const { ctx, page, errors } = await open(browser, origin, { query, width, height, touch,
        storage: saved ? { [`mco-explorer-groups-${cls}`]: saved } : undefined });
      const r = await page.evaluate(() => {
        const sec = document.getElementById('sb-legend');
        // Disclosure controls inside the Legend group: its summary, plus any
        // button that says it expands or collapses something.
        const toggles = [...sec.querySelectorAll('summary, [aria-expanded], [aria-controls]')]
          .filter(el => el.closest('#sb-legend') === sec);
        return { open: sec.open, toggles: toggles.map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')),
                 url: location.search };
      });
      t.check(`${label} ${query || '(no query)'}: Legend ${wantOpen ? 'open' : 'collapsed'}`, r.open === wantOpen,
        `open=${r.open} url=${r.url}`);
      if (!query) t.check(`${label}: exactly one collapse control in the Legend group`, r.toggles.length === 1 &&
        r.toggles[0] === 'summary', r.toggles.join(', '));
      t.check(`${label} ${query || '(no query)'}: no errors`, errors.length === 0, errors.join(' | ') || 'none');
      await ctx.close();
    }
  }

  // The note ("Data current as of …") is the sidebar's last block, after
  // Overlays, and stays visible with the Legend group closed.
  {
    const { ctx, page, errors } = await open(browser, origin, { query: '?legend=collapsed', width: 1440, height: 900 });
    const r = await page.evaluate(() => {
      const blocks = [...document.querySelector('#sidebar .sidebar-scroll').children]
        .filter(el => el.getBoundingClientRect().height > 0);
      const note = document.getElementById('legend-meta');
      return { last: blocks.at(-1)?.id, beforeIt: blocks.at(-2)?.id, text: note.textContent.trim(),
               visible: note.getBoundingClientRect().height > 0 };
    });
    t.check('1440: the note is the last block in the sidebar, after Overlays',
      r.last === 'sb-footer' && r.beforeIt === 'sb-overlays', `${r.beforeIt} › ${r.last}`);
    t.check('1440: the note stays visible with the Legend group closed', r.visible && r.text.length > 0, r.text);
    t.check('1440 note: no errors', errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // Mobile header: ONE row in every mode, down to 320px (kit 0.21.0 compact
  // bar: badge · variable · search · ☰, ≤ 64px; the date and hour steppers
  // moved into the drawer with the rest of the Time section).
  for (const mode of ['latest', 'hourly', 'daily']) {
    for (const width of [320, 375, 390]) {
      const { ctx, page } = await open(browser, origin, {
        query: `?mode=${mode}`, width, height: 780, touch: true,
      });
      const r = await page.evaluate(() => {
        const nb = document.getElementById('navbar');
        return { chrome: Math.round(nb.getBoundingClientRect().bottom),
                 overflow: nb.scrollWidth - nb.clientWidth };
      });
      const expected = 64;   // the family's phone-bar ceiling
      t.check(`${width}px ${mode}: header stays compact`,
        r.chrome <= expected && r.overflow === 0, `${r.chrome}px, overflow ${r.overflow}`);
      await ctx.close();
    }
  }

  return t.results;
}
