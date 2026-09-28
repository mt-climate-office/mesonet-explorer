// Station photos.
//
// The images come from the archive bucket (data2.climate.umt.edu/mesonet), not
// the API. Latest lists a UTC day per camera direction; Hourly and Daily read
// the station's monthly manifest once and reuse it across the month. Checked
// against Absarokee (aceabsar), which has shot E/N/S/SNOW/W since 2023: a
// legacy 9 AM / 3 PM day, a day from its hourly-patrol trial (11-20 Sept 2026,
// where the manifest's own webp column is blank and the path is derived), and
// today's Latest view.
import { open, recorder } from '../lib/harness.mjs';

export const name = 'photos';

const STATION = 'aceabsar';
const DATE = '2026-09-01';           // legacy patrol: frames at 09:00 and 15:00 MDT only
const HOURLY_DATE = '2026-09-15';    // hourly patrol trial: a frame every hour
const ARCHIVE = 'https://data2.climate.umt.edu/mesonet/photos/webp/large/';

/** Wait for the carousel to settle, then describe it. */
async function carousel(page) {
  await page.waitForFunction(
    () => { const c = document.querySelector('.pop-carousel'); return !c || c.dataset.state !== 'loading'; },
    null, { timeout: 60000, polling: 250 },
  ).catch(() => {});
  // 'ok' means the frames are chosen; the first image is still downloading.
  await page.waitForFunction(
    () => { const c = document.querySelector('.pop-carousel'); const i = c?.querySelector('.pop-carousel-img');
            return !c || c.dataset.state !== 'ok' || (i.complete && i.naturalWidth > 0); },
    null, { timeout: 30000, polling: 100 },
  ).catch(() => {});
  return page.evaluate(() => {
    const c = document.querySelector('.pop-carousel');
    if (!c) return { present: false };
    const img = c.querySelector('.pop-carousel-img');
    const sheet = document.getElementById('sheet-body').getBoundingClientRect();
    const frame = c.querySelector('.pop-carousel-frame').getBoundingClientRect();
    return {
      present: true, state: c.dataset.state,
      src: img.getAttribute('src') || '', loaded: img.complete && img.naturalWidth > 0,
      natural: `${img.naturalWidth}x${img.naturalHeight}`, alt: img.alt,
      caption: c.querySelector('.pop-carousel-dir').textContent,
      counter: c.querySelector('.pop-carousel-counter').textContent,
      total: +(c.querySelector('.pop-carousel-counter').textContent.split('/')[1] || 0),
      buttonsShown: !c.querySelector('.pop-carousel-btn.next').hidden,
      fits: frame.right <= sheet.right + 1 && frame.left >= sheet.left - 1,
    };
  });
}

/** Step through every frame; returns the captions and whether each image drew. */
async function walk(page, total) {
  const seen = [];
  for (let i = 0; i < total; i++) {
    await page.waitForFunction(
      () => { const i = document.querySelector('.pop-carousel-img'); return i && i.complete && i.naturalWidth > 0; },
      null, { timeout: 30000, polling: 100 },
    ).catch(() => {});
    seen.push(await page.evaluate(() => {
      const c = document.querySelector('.pop-carousel');
      const i = c.querySelector('.pop-carousel-img');
      return { caption: c.querySelector('.pop-carousel-dir').textContent, src: i.getAttribute('src'), drew: i.naturalWidth > 0 };
    }));
    if (i < total - 1) await page.click('.pop-carousel-btn.next');
  }
  return seen;
}

const cspErrors = errors => errors.filter(e => /Content Security Policy|ERR_BLOCKED_BY_CSP/.test(e));
const photoErrors = errors => errors.filter(e => /data2\.climate\.umt\.edu/.test(e));

export async function run({ browser, origin }) {
  const t = recorder();

  // Latest: the newest frame per direction from the past day.
  {
    const { ctx, page, errors } = await open(browser, origin, { query: `?station=${STATION}` });
    const c = await carousel(page);
    t.check('latest: carousel settles with a photo', c.present && c.state === 'ok', JSON.stringify(c) + ' errors: ' + errors.join(' | '));
    t.check('latest: image comes from the archive bucket', c.src.startsWith(`${ARCHIVE}${STATION}/${STATION}_`), c.src);
    t.check('latest: first image drew', c.loaded, c.natural);
    t.check('latest: one frame per live direction (5)', c.total === 5, c.counter);
    t.check('latest: caption names the direction and the capture time',
      /^[A-Za-z ]+ · (?:[A-Z][a-z]{2} \d{1,2}, )?\d{1,2}:\d{2} [AP]M$/.test(c.caption), c.caption);
    t.check('latest: alt text describes the frame', /^Station camera: .+, photo 1 of \d+$/.test(c.alt), c.alt);
    const seen = await walk(page, c.total);
    t.check('latest: every frame draws and is a distinct image',
      seen.every(s => s.drew) && new Set(seen.map(s => s.src)).size === seen.length,
      seen.map(s => `${s.caption} ${s.drew ? 'ok' : 'FAILED'}`).join(' | '));
    t.check('latest: no CSP violations', cspErrors(errors).length === 0, cspErrors(errors).join('; '));
    t.check('latest: no failed photo requests', photoErrors(errors).length === 0, photoErrors(errors).join('; '));
    await ctx.close();
  }

  // Daily on a legacy-patrol day: the 9 AM and 3 PM frames for each direction.
  {
    const { ctx, page, errors } = await open(browser, origin, { query: `?mode=daily&date=${DATE}&station=${STATION}` });
    const c = await carousel(page);
    t.check('daily: carousel settles with a photo', c.present && c.state === 'ok', JSON.stringify(c) + ' errors: ' + errors.join(' | '));
    t.check('daily: two frames per direction (10)', c.total === 10, c.counter);
    const seen = await walk(page, c.total);
    const times = seen.map(s => s.caption.split(' · ')[1]);
    t.check('daily: frames alternate 9:00 AM / 3:00 PM',
      times.every((v, i) => v === (i % 2 ? '3:00 PM' : '9:00 AM')), times.join(', '));
    t.check('daily: frames carry the requested UTC slots (15Z / 21Z)',
      seen.every((s, i) => s.src.includes(`_20260901T${i % 2 ? '21' : '15'}0000Z.webp`)), seen.map(s => s.src.split('/').pop()).join(', '));
    t.check('daily: every frame draws', seen.every(s => s.drew), seen.filter(s => !s.drew).map(s => s.caption).join(', '));
    t.check('daily: no failed photo requests', photoErrors(errors).length === 0, photoErrors(errors).join('; '));
    await ctx.close();
  }

  // Hourly: the frame nearest the end of the selected hour, from that day.
  // 8 PM on a 9 AM / 3 PM camera resolves to 3 PM; 8 AM resolves to 9 AM.
  for (const [hour, want, slot] of [[20, '3:00 PM', '21'], [8, '9:00 AM', '15']]) {
    const { ctx, page, errors } = await open(browser, origin, { query: `?mode=hourly&date=${DATE}&hour=${hour}&station=${STATION}` });
    const c = await carousel(page);
    t.check(`hourly ${hour}:00: carousel settles with a photo`, c.present && c.state === 'ok', JSON.stringify(c) + ' errors: ' + errors.join(' | '));
    t.check(`hourly ${hour}:00: one frame per direction (5)`, c.total === 5, c.counter);
    t.check(`hourly ${hour}:00: nearest frame is ${want}`, c.caption.endsWith(` · ${want}`) && c.src.includes(`T${slot}0000Z`), `${c.caption} — ${c.src.split('/').pop()}`);
    t.check(`hourly ${hour}:00: image drew`, c.loaded, c.natural);
    t.check(`hourly ${hour}:00: no failed photo requests`, photoErrors(errors).length === 0, photoErrors(errors).join('; '));
    await ctx.close();
  }

  // A day from the hourly trial: 8 PM resolves to the 9 PM frame (nearest the
  // hour's end), and Daily still lands exactly on 9 AM and 3 PM. These frames
  // have no `webp_large` in the manifest, so this also proves the derived path.
  {
    const { ctx, page, errors } = await open(browser, origin, { query: `?mode=hourly&date=${HOURLY_DATE}&hour=20&station=${STATION}` });
    const c = await carousel(page);
    t.check('hourly-trial day 20:00: carousel settles with a photo', c.present && c.state === 'ok', JSON.stringify(c));
    t.check('hourly-trial day 20:00: nearest frame is 9:00 PM (slot 03Z next UTC day)',
      c.caption.endsWith(' · 9:00 PM') && c.src.includes('_20260916T030000Z.webp'), `${c.caption} — ${c.src.split('/').pop()}`);
    t.check('hourly-trial day 20:00: one frame per direction (5)', c.total === 5, c.counter);
    const seen = await walk(page, c.total);
    t.check('hourly-trial day 20:00: every derived-path frame draws', seen.every(s => s.drew), seen.map(s => `${s.caption} ${s.drew ? 'ok' : 'FAILED'}`).join(' | '));
    t.check('hourly-trial day 20:00: no failed photo requests', photoErrors(errors).length === 0, photoErrors(errors).join('; '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, origin, { query: `?mode=daily&date=${HOURLY_DATE}&station=${STATION}` });
    const c = await carousel(page);
    const seen = await walk(page, c.total);
    const times = seen.map(s => s.caption.split(' · ')[1]);
    t.check('hourly-trial day, Daily: still exactly 9:00 AM / 3:00 PM per direction',
      c.total === 10 && times.every((v, i) => v === (i % 2 ? '3:00 PM' : '9:00 AM')), `${c.counter}: ${times.join(', ')}`);
    await ctx.close();
  }

  // Scrubbing through a month is one manifest fetch, not one per day.
  {
    const { ctx, page } = await open(browser, origin, { query: `?mode=daily&date=${DATE}&station=${STATION}` });
    const hits = [];
    page.on('request', r => { if (r.url().includes('/photos/manifest/')) hits.push(r.url().split('/').pop()); });
    await carousel(page);
    const before = hits.length;
    for (let i = 0; i < 3; i++) {
      await page.click('#btn-date-next');
      await page.waitForTimeout(400);
      await carousel(page);
    }
    const c = await carousel(page);
    t.check('scrubbing three days ahead re-fetches no manifest', hits.length === before && before === 0,
      `${hits.length} manifest requests after the first open (${hits.join(', ') || 'none'})`);
    t.check('scrubbed day still shows its frames', c.state === 'ok' && c.total === 10 && c.src.includes('_20260904T'), `${c.counter} ${c.src.split('/').pop()}`);
    await ctx.close();
  }

  // A camera the archive knows but the API's registry doesn't. Picked live so
  // the check outlives the current gap (Mizpah and eight others, Sept 2026);
  // if the API catches up, Mizpah itself must still show its block.
  {
    const pick = await (async () => {
      try {
        const [sched, api] = await Promise.all([
          fetch('https://data2.climate.umt.edu/mesonet/photos/schedule/schedule.json').then(r => r.json()),
          fetch('https://mesonet2.climate.umt.edu/api/photos/?type=json').then(r => r.json()),
        ]);
        const known = new Set(api.map(r => r['Station ID']));
        return Object.keys(sched.stations).find(id => !known.has(id) && id !== 'acealbio') || null;
      } catch { return null; }
    })();
    const station = pick || 'acemizpa';
    const { ctx, page, errors } = await open(browser, origin, { query: `?station=${station}` });
    const c = await carousel(page);
    t.check(`camera missing from the API registry (${station}): photo block present`, c.present, JSON.stringify(c) + ' errors: ' + errors.join(' | '));
    t.check(`camera missing from the API registry (${station}): a frame drew`, c.state === 'ok' && c.loaded, `${c.state} ${c.caption} ${c.natural}`);
    await ctx.close();
  }

  // Before the camera existed there is no frame to reserve space for.
  {
    const { ctx, page } = await open(browser, origin, { query: `?mode=daily&date=2022-07-01&station=${STATION}` });
    const c = await carousel(page);
    t.check('daily before the camera was installed: no photo block', !c.present, JSON.stringify(c));
    await ctx.close();
  }

  // Phone: the frame sits inside the sheet once expanded.
  {
    const { ctx, page, errors } = await open(browser, origin, { query: `?station=${STATION}`, width: 390, height: 844, touch: true });
    await page.evaluate(() => {
      const s = document.getElementById('station-sheet');
      if (s && s.dataset.state === 'peek') document.getElementById('sheet-expand').click();
    });
    await page.waitForTimeout(600);
    const c = await carousel(page);
    t.check('phone: carousel settles with a photo', c.present && c.state === 'ok' && c.loaded, JSON.stringify(c));
    t.check('phone: frame fits inside the sheet', c.fits, JSON.stringify(c));
    t.check('phone: no CSP violations', cspErrors(errors).length === 0, cspErrors(errors).join('; '));
    await ctx.close();
  }

  return t.results;
}
