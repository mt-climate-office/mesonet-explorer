# Checks

Headless browser checks for the explorer. Kept in its own package so the app
itself stays dependency-free — nothing in `../index.html` or `../app.js` knows
these exist, and nothing here is served to users.

```sh
cd test
npm install          # once — pulls playwright-core
npm test             # everything (~15 min; it drives a real browser against the live API)
npm test -- layout   # one suite: layout | url | map | export
VERBOSE=1 npm test   # print the measured value for passing checks too
```

The runner starts its own static server on a free port, so nothing needs to be
running first. It exits non-zero on any failure, so it works as a CI gate.

Chrome is used via `channel: 'chrome'` — your installed Chrome, not a downloaded
build, which is why the install is small.

## Suites

**`layout`** — for each of six viewport sizes from 320×568 to 1920×1080: the
detail panel opens and sits inside the viewport, every control in it is actually
on top at its own centre (`elementFromPoint`), nothing is hidden behind a
horizontal scroll, there is no invisible chrome above the map, the variable
picker is on screen, the legend is in the sidebar, and the screen-reader station
table is populated. Plus header height against `mesonet-status` (54px with the
map flush beneath) and mobile header compactness in all three time modes.

**`url`** — a default load leaves the URL bare; each control adds exactly its own
parameter and clears it again; every parameter still works as input and
round-trips to its minimal form; `?kbd=off` survives and actually disables the
shortcut. Then share links: fully specified, and loaded back in a context with
the **opposite** OS colour scheme and empty storage to prove the recipient sees
the sharer's view rather than their own defaults.

**`map`** — zoom-out springs back to the Montana extent (three times, sampled
through the URL, where the camera parameters vanish at the default extent);
the camera is still when idle; clicking a dot opens *that* station; the docked
panel covers no clickable dots; selecting a station does not move or resize the
map while collapsing the sidebar does; and on a phone the sheet takes half the
map and dismisses cleanly.

**`export`** — the PNG export: downloads fire for both themes, valid PNG at
2800×1400, filename carries variable and timestamp, the map, branding card and
colour ramp all rendered, light and dark genuinely differ, five variable and mode
combinations work, and the navbar button as well as the `?export=` hook.

## Two things worth knowing before trusting a result

**Live data moves.** Station values tick between fetches, so two exports are
never byte-equal — a naive comparison shows a few hundred differing pixels and
looks like a regression. The export suite measures a noise floor first, from two
exports of an identical setup, and judges every "should be unchanged" claim
against that. When a result sits near the floor, interleave the runs and check
that the *controls* differ as much as the test does; if they do, it's drift.

**The panel covering dots is by design, not a bug.** While the detail panel is
open it hides the eastern strip of the state — about a third of the stations at
1440x900. That is the accepted cost of the map holding still when you select a
station. The `map` suite checks that the panel is docked flush to one edge at
full height, so the hidden band is *predictable*, rather than asserting nothing
is covered.

**Don't reuse stale coordinates.** Several checks locate station dots by hovering
for the tooltip. Anything that moves the camera — the targeted pan, a sidebar
toggle — invalidates those positions, and a test that clicks them afterwards will
report failures that aren't real. The `map` suite re-confirms what is under the
cursor immediately before each click for exactly this reason.

## Adding a check

A suite exports `name` and `async run({ browser, origin, analyser, log })` and
returns an array of `{ ok, name, detail }`. Use `recorder()` from
`lib/harness.mjs` to collect them, and `open()` to get a page with the intro
modal suppressed and console errors captured. Register the file in `SUITES` in
`run.mjs`.

`open()` waits a flat 15s rather than for network idle: the map streams tiles and
the app polls on a timer, so the network never actually goes idle. If a check is
flaky against a slow API response, raise `wait` — don't reach for `networkidle`.
