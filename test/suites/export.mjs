// PNG export.
//
// The export renders a fixed 1400x700 Montana framing off-screen at 2x with a
// branding card carrying the variable, timestamp and colour scale. Its whole
// point is to be independent of the browser window, which is what most of these
// checks are about.
//
// Live station values tick between fetches, so two exports are never byte-equal.
// Every "should be unchanged" claim is judged against a noise floor measured
// from two exports of an identical setup rather than against zero.
import { join } from 'node:path';
import { open, pngInfo, imageDiff, imageStructure, artifactDir, recorder } from '../lib/harness.mjs';

export const name = 'export';

export async function run({ browser, origin, analyser, log }) {
  const t = recorder();
  const dir = await artifactDir();

  async function exportOnce(tag, { query = '?export=light', width = 1440, height = 900, manual = false } = {}) {
    // No need to wait on data here: the download event is the real signal, and
    // for the manual path the button only needs the page interactive.
    const { ctx, page, errors } = await open(browser, origin, {
      query, width, height, downloads: true,
      waitForData: manual, wait: manual ? 1500 : 500,
    });
    const dl = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
    if (manual) await page.click('#btn-export');
    const d = await dl;
    let file = null;
    if (d) { file = join(dir, `export-${tag}.png`); await d.saveAs(file); }
    const suggested = d ? d.suggestedFilename() : null;
    await ctx.close();
    return { file, suggested, errors };
  }

  log('  measuring the live-data noise floor…');
  const [n1, n2] = [await exportOnce('noise-a'), await exportOnce('noise-b')];
  const noise = (n1.file && n2.file) ? await imageDiff(analyser, n1.file, n2.file) : { differing: 0 };
  const NOISE = Math.max(2000, (noise.differing || 0) * 4);
  log(`  noise floor ${noise.differing ?? '?'} px; treating <= ${NOISE} px as unchanged`);

  // Basic contract, per theme.
  for (const theme of ['light', 'dark']) {
    const r = await exportOnce(`theme-${theme}`, { query: `?export=${theme}` });
    t.check(`${theme}: download fires`, !!r.file, r.file ? 'saved' : 'NO DOWNLOAD');
    if (r.file) {
      const i = pngInfo(r.file);
      t.check(`${theme}: valid PNG`, i.validPng);
      t.check(`${theme}: 2800x1400 (1400x700 @2x)`, i.width === 2800 && i.height === 1400, `${i.width}x${i.height}`);
      t.check(`${theme}: non-trivial file size`, i.bytes > 200000, `${Math.round(i.bytes / 1024)} KB`);
      t.check(`${theme}: filename carries variable + timestamp`,
        /^mesonet-explorer-[a-z0-9_]+-\d{4}-\d{2}-\d{2}T\d{6}\.png$/.test(r.suggested || ''), r.suggested);
      const s = await imageStructure(analyser, r.file);
      t.check(`${theme}: map rendered`, s.mapColours > 8, `${s.mapColours} colours across the map`);
      t.check(`${theme}: branding card present`, s.bandColours > 3, `${s.bandColours} colours in the card`);
      t.check(`${theme}: colour ramp drawn`, s.rampColours > 20, `${s.rampColours} colours in the ramp row`);
    }
    t.check(`${theme}: no errors`, r.errors.length === 0, r.errors.join(' | ') || 'none');
  }

  const light = join(dir, 'export-theme-light.png'), dark = join(dir, 'export-theme-dark.png');
  const themed = await imageDiff(analyser, light, dark).catch(() => null);
  if (themed) t.check('light and dark genuinely differ', themed.pct > 20, `${themed.pct}% of pixels`);

  // Window independence — the reason this suite exists.
  const ref = await exportOnce('window-ref');
  for (const [label, opts] of [
    ['narrow viewport 390x844', { width: 390, height: 844 }],
    ['wide viewport 1920x1080', { width: 1920, height: 1080 }],
    ['sidebar collapsed', { query: '?export=light&sidebar=closed' }],
    ['station panel open', { query: '?export=light&station=acemocca' }],
  ]) {
    const r = await exportOnce('window-' + label.replace(/\W+/g, '-'), opts);
    if (!r.file || !ref.file) { t.fail(`window-independent: ${label}`, 'export failed'); continue; }
    const d = await imageDiff(analyser, ref.file, r.file);
    if (d.sizeMismatch) { t.fail(`window-independent: ${label}`, 'dimensions differ'); continue; }
    t.check(`window-independent: ${label}`, d.differing <= NOISE, `${d.differing} px (floor ${NOISE})`);
  }

  // Variables and modes exercise different fetch and colour-scale paths.
  for (const [label, query] of [
    ['daily precipitation', '?export=light&mode=daily&var=ppt'],
    ['hourly wind direction (compass ramp)', '?export=light&mode=hourly&var=wind_dir'],
    ['soil temperature', '?export=light&var=soil_temp_shallow'],
    ['metric units', '?export=light&units=si'],
    ['custom ramp + locked scale', '?export=light&ramp=Blues-r&scale=0,15,30'],
  ]) {
    const r = await exportOnce('var-' + label.replace(/\W+/g, '-'), { query });
    if (!r.file) { t.fail(`exports: ${label}`, 'NO DOWNLOAD'); continue; }
    const i = pngInfo(r.file), s = await imageStructure(analyser, r.file);
    t.check(`exports: ${label}`,
      i.validPng && i.width === 2800 && i.height === 1400 && s.mapColours > 8,
      `${i.width}x${i.height}, ${s.mapColours} map colours`);
    t.check(`exports: ${label} — no errors`, r.errors.length === 0, r.errors.join(' | ') || 'none');
  }

  // The navbar button is a different code path from the ?export= hook.
  const manual = await exportOnce('manual', { query: '', manual: true });
  t.check('navbar export button works', !!manual.file,
    manual.file ? `${pngInfo(manual.file).width}px wide` : 'NO DOWNLOAD');
  t.check('navbar export button: no errors', manual.errors.length === 0, manual.errors.join(' | ') || 'none');

  return t.results;
}
