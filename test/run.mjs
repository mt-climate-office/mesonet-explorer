// Runs the suites in ./suites and prints a report.
//
//   npm test              all suites
//   npm test -- layout    one suite (also: export, url, map)
//
// Starts its own static server on a free port, so nothing needs to be running
// first. Exits non-zero if anything failed, which makes it usable as a CI gate.
import { serve, launch } from './lib/harness.mjs';

const SUITES = ['layout', 'url', 'map', 'export'];
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
const names = wanted.length ? wanted : SUITES;

for (const n of names) {
  if (!SUITES.includes(n)) {
    console.error(`Unknown suite '${n}'. Available: ${SUITES.join(', ')}`);
    process.exit(2);
  }
}

const server = await serve();
const browser = await launch();
// One page kept aside for canvas work (image decoding and diffing).
const analyser = await (await browser.newContext()).newPage();

const started = Date.now();
const all = [];
let hardFailure = null;

for (const n of names) {
  const suite = await import(`./suites/${n}.mjs`);
  console.log(`\n${suite.name}`);
  const log = (m) => console.log(m);
  try {
    const results = await suite.run({ browser, origin: server.origin, analyser, log });
    for (const r of results) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
      if (r.detail && (!r.ok || process.env.VERBOSE)) console.log(`        ${r.detail}`);
    }
    all.push(...results.map(r => ({ ...r, suite: n })));
  } catch (err) {
    console.log(`  ERROR  suite crashed: ${err.message}`);
    hardFailure = err;
    all.push({ ok: false, suite: n, name: 'suite completed', detail: err.message });
  }
}

await browser.close();
await server.close();

const failed = all.filter(r => !r.ok);
const secs = Math.round((Date.now() - started) / 1000);
console.log('\n' + '-'.repeat(70));
if (failed.length) {
  console.log('Failures:');
  for (const f of failed) console.log(`  [${f.suite}] ${f.name}\n      ${f.detail}`);
}
console.log(`${all.length - failed.length}/${all.length} passed in ${secs}s`);
if (hardFailure) console.log(`\nA suite threw: ${hardFailure.stack?.split('\n')[0]}`);
process.exit(failed.length ? 1 : 0);
