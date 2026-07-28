// Map interaction.
//
// The camera rules are deliberate and easy to regress:
//   - zooming out past the state springs back to the Montana extent;
//   - selecting a station does NOT move the map (the panel floats), except for a
//     targeted nudge when the dot would otherwise sit under the panel;
//   - toggling the sidebar DOES resize the map, because it takes a real column.
import { open, recorder } from '../lib/harness.mjs';

export const name = 'map';

/** Walk a grid hovering for the tooltip; returns screen positions of real dots. */
async function findDots(page, limit = 16) {
  const m = await page.evaluate(() => {
    const r = document.querySelector('.maplibregl-canvas').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  const dots = [];
  outer:
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 70; col++) {
      const x = Math.round(m.l + m.w * (0.06 + col * 0.0132));
      const y = Math.round(m.t + m.h * (0.22 + row * 0.019));
      await page.mouse.move(x, y);
      const id = await page.evaluate(() => {
        const el = document.getElementById('tooltip');
        return el.classList.contains('visible') ? el.querySelector('.tooltip-sub')?.textContent : null;
      });
      if (id && !dots.some(d => d.id === id)) { dots.push({ x, y, id }); if (dots.length >= limit) break outer; }
    }
  }
  return dots;
}

export async function run({ browser, origin }) {
  const t = recorder();

  // Zoom-out spring-back. Sampled through the URL, where the camera parameters
  // vanish at the default extent — so the trail shows it leaving and returning.
  {
    const { ctx, page, errors } = await open(browser, origin);
    await page.evaluate(() => {
      window.__trail = [];
      window.__timer = setInterval(() => {
        const z = location.search.match(/zoom=([0-9.]+)/);
        const v = z ? z[1] : 'EXTENT';
        if (window.__trail[window.__trail.length - 1] !== v) window.__trail.push(v);
      }, 60);
    });
    for (let i = 0; i < 3; i++) { await page.click('.maplibregl-ctrl-zoom-out'); await page.waitForTimeout(900); }
    await page.waitForTimeout(3000);
    const trail = await page.evaluate(() => { clearInterval(window.__timer); return window.__trail; });
    const springs = trail.filter((v, i) => v === 'EXTENT' && trail[i - 1] && trail[i - 1] !== 'EXTENT').length;
    t.check('zoom-out springs back to the Montana extent', springs === 3, `${springs} of 3 — trail ${trail.join(' -> ')}`);
    t.check('zoom-out button stays enabled',
      !(await page.evaluate(() => document.querySelector('.maplibregl-ctrl-zoom-out').disabled)));
    // Nothing should move the camera on its own.
    await page.evaluate(() => { window.__t2 = []; window.__i2 = setInterval(() => window.__t2.push(location.search), 100); });
    await page.waitForTimeout(6000);
    const idle = await page.evaluate(() => { clearInterval(window.__i2); return new Set(window.__t2).size; });
    t.check('camera is still when idle', idle === 1, `${idle} distinct URLs over 6s`);
    t.check('spring-back: no errors', errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // Clicking dot to dot: the aimed-at station opens, every time. Confirms what is
  // under the cursor immediately before clicking, so a camera move mid-run can't
  // make the test lie.
  {
    const { ctx, page, errors } = await open(browser, origin);
    const dots = await findDots(page, 12);
    let attempts = 0, hits = 0;
    const misses = [];
    for (const d of dots) {
      await page.mouse.move(d.x, d.y);
      const under = await page.evaluate(() => {
        const el = document.getElementById('tooltip');
        return el.classList.contains('visible') ? el.querySelector('.tooltip-sub')?.textContent : null;
      });
      if (!under) continue;
      await page.mouse.click(d.x, d.y);
      await page.waitForTimeout(750);
      const shown = await page.evaluate(() => {
        const s = document.querySelector('#station-sheet:not([hidden])');
        return s ? s.querySelector('.pop-sub')?.textContent?.split(' ·')[0] : null;
      });
      attempts++;
      if (shown === under) hits++; else misses.push(`${under} -> ${shown}`);
    }
    t.check('clicking a dot opens that station', attempts > 0 && hits === attempts,
      `${hits}/${attempts}${misses.length ? ' — ' + misses.join('; ') : ''}`);
    // The panel DOES cover the eastern strip while it's open — that is the
    // accepted cost of the map holding still. What matters is that the coverage
    // is predictable: a panel docked flush to one edge, full height, so the
    // hidden dots are always the same band rather than wherever you last clicked.
    const dock = await page.evaluate(() => {
      const s = document.querySelector('#station-sheet:not([hidden])');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const m = document.getElementById('map').getBoundingClientRect();
      return { flushRight: Math.abs(r.right - innerWidth) <= 1,
               fullHeight: Math.abs(r.top - m.top) <= 2 && Math.abs(r.bottom - m.bottom) <= 2 };
    });
    t.check('the panel is docked flush to one edge, so coverage is predictable',
      !!dock && dock.flushRight && dock.fullHeight, JSON.stringify(dock));
    t.check('dot clicking: no errors', errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();
  }

  // Selecting a station must not move the map; toggling the sidebar must.
  {
    const { ctx, page } = await open(browser, origin);
    const cam = () => page.evaluate(() => location.search.match(/lng=[-0-9.]+&lat=[-0-9.]+&zoom=[0-9.]+/)?.[0] || 'EXTENT');
    const width = () => page.evaluate(() => Math.round(document.getElementById('map-container').getBoundingClientRect().width));
    const dots = await findDots(page, 3);
    // Pick a westerly dot so the targeted pan has no reason to fire.
    const west = dots.sort((a, b) => a.x - b.x)[0];
    const before = await cam(), widthBefore = await width();
    await page.mouse.click(west.x, west.y);
    await page.waitForTimeout(2200);
    t.check('selecting a station leaves the camera alone', (await cam()) === before, `${before} -> ${await cam()}`);
    t.check('selecting a station does not resize the map', (await width()) === widthBefore);

    await page.click('#sidebar-toggle');
    await page.waitForTimeout(2600);
    const widthAfter = await width();
    t.check('collapsing the sidebar widens the map', widthAfter > widthBefore, `${widthBefore} -> ${widthAfter}`);
    await ctx.close();
  }

  // The bottom sheet takes half the map on a phone, and dismisses cleanly.
  {
    const { ctx, page } = await open(browser, origin, {
      query: '?station=acemocca', width: 390, height: 844, touch: true,
    });
    await page.evaluate(() => {
      const s = document.getElementById('station-sheet');
      if (s && s.dataset.state === 'peek') document.getElementById('sheet-expand').click();
    });
    await page.waitForTimeout(1400);
    const r = await page.evaluate(() => {
      const s = document.getElementById('station-sheet').getBoundingClientRect();
      return { pct: Math.round(100 * s.height / document.getElementById('map').clientHeight) };
    });
    t.check('phone: the sheet takes half the map', Math.abs(r.pct - 50) <= 2, `${r.pct}%`);

    await page.tap('.sheet-close');
    await page.waitForTimeout(1000);
    const closed = await page.evaluate(() => ({
      hidden: document.getElementById('station-sheet').hidden,
      station: /station=/.test(location.search),
    }));
    t.check('phone: closing clears the panel and the station parameter',
      closed.hidden && !closed.station, JSON.stringify(closed));
    await ctx.close();
  }

  return t.results;
}
