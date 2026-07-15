# Mesonet Explorer — Change Requests

Working list of requested changes, bugs, and ideas. Add items below and hand this
file (or the repo) to Claude — each entry gets checked off as it lands, with a
short note on what was done.

**Entry format** (loose — a one-liner is fine):

```
- [ ] Short description of the change
      Why / details / links or screenshots if helpful
```

---

## Bugs

- [ ] _(add items here)_

## Changes

- [ ] _(add items here)_

## Ideas / someday

- [ ] **Adjustable color scale.** User is able to select a different color scale and change end/center points, perhaps by clicking the scale to open a modal.
- [ ] **Allow for fixed scale.** When a user moves through different dates/times, they should be able to see data on a fixed scale in order to observe changes through time. *(Audit note: also affects exports — two PNGs of different days carry identical-looking legends with different scales.)*
- [ ] **Enable a temporal timelapse.** Users are able to select start and end points (days, hours, timestamp, depending on temporal aggregation. A slider appears allowing people to smoothly move through the time period. Pressing a play button iterates through.
- [ ] **Adjustable staleness threshold.** Let the user change the 3-hour staleness cutoff (e.g. 1 h / 3 h / 6 h / 24 h).

### Deferred from the July 2026 audit

- [ ] **Visible "Table view" toggle.** An on-screen sortable station table (the SR-only table already built each render is the seed).
- [ ] **Cyclic, colorblind-safe wind-direction ramp.** Spectral maps 0° and 360° (the same direction) to opposite colors and its red↔green ends defeat CVD users; label legend ends "N … N".
- [ ] **Export: current view vs. statewide choice.** Export always uses the fixed Montana framing while the button says "current view" — offer both or fix the copy.
- [ ] **12-hour time labels.** Hour readout / legend meta use 24-h ("14:00 MT") while popups use "2:25 PM MDT"; also "MT" doubles as the state abbreviation. Standardize.
- [ ] **Preserve the aggregation choice across variable changes** (it silently resets to each variable's default).
- [ ] **°F/°C toggle wording.** It actually switches *all* units (wind, precip, pressure) — consider labeling "US / Metric" (wording call for Kyle).
- [ ] **Assertive live region for errors.** Error toasts share the polite `#toast` region and can be preempted; add a `role="alert"` channel.
- [ ] **Search: "…and N more" hint.** Results silently cap at 8.
- [ ] **`document.title` should reflect variable/mode** (URL already does).
- [ ] **`pushState` for mode changes** so Back undoes big jumps instead of leaving the site.
- [ ] **Debounce hold-to-repeat fetches.** A held stepper fires a render per 150 ms step; advance the readout instantly, fetch after ~250 ms idle.
- [ ] **Legend gradient in the collapsed mobile header** so novices see the color key without expanding.
- [ ] **GDD base temperature in the label/description** (agronomists need the base to use the number).
- [ ] **Port the contrast-token fixes to mesonet-status** (`--text-dim`, `--ctrl-border`, muted marker stroke — shared MCO design system).
- [ ] **Per-app subdomains.** All `mt-climate-office.github.io` projects share one origin (one localStorage, shared XSS blast radius); custom subdomains would isolate them.

---

## Done

- [x] **Security, accessibility & usability audit — implementation pass.**
      From the July 2026 three-way audit (Critical + High + cheap Mediums):
      *Security* — `app.js` split out of `index.html` so the new meta CSP can
      pin `script-src` to `'self'`; flatgeobuf pinned to 3.38.0; SRI hashes on
      all three CDN assets; referrer policy; station-id URL encoding and
      localStorage validation hardenings.
      *Keyboard & focus* — date/hour steppers respond to Enter/Space (Hourly
      mode was keyboard-inoperable) and are 24/40 px ‹ › pairs; popups take
      and return focus; co-located stations listed as buttons in the popup;
      focus rings restored on legend rows and inputs; `?kbd=off` disables the
      `/` shortcut.
      *Contrast* — `--text-dim`, new `--ctrl-border`, light-theme marker
      stroke, and dark popup text now meet WCAG AA (ratios verified
      computationally).
      *Feedback* — loading bar visible on phones (the navbar stamp is hidden
      ≤640 px); boot/fetch failures show persistent Retry cards; open popups
      re-render with the map; "N stations hidden (no report in 3 h)" and
      "(partial day, through HH:MM MT)" labels; control-bar edge fade;
      radar setting survives mode switches.
      *Screen readers* — hidden per-render station data table, render/search
      announcements, combobox `aria-selected`, `<main>` landmark, per-photo
      alt text.
      *Content* — "What the terms mean" glossary, one-line variable
      descriptions under the legend title, HydroMet/AgriMet chip tooltips
      (copy is DRAFT — review welcome). *(July 2026)*
- [x] **Tribal lands always on.** Removed from the overlay checkboxes; drawn
      unconditionally like the state outline. *(July 2026)*
- [x] **Add watersheds to overlays.** HUC6 basins stream as FlatGeobuf from
      `data.climate.umt.edu/mesonet/fgb/mt_hucs.fgb` on first enable;
      `?watersheds=on` URL param. *(July 2026)*
- [x] **Photo should change with selection.** Popup photos are now a carousel
      over every camera direction the station reports, time-matched via the
      photos API `dt` param (end of the selected hour in Hourly; 9 AM +
      3 PM frames per direction in Daily). Missing frames show "No photo for
      this time" and are skipped automatically. *(July 2026)*
- [x] **Drop the radar button in menu bar.** The legend checkbox is now the
      only radar toggle. *(July 2026)*
- [x] **Default auto refresh to 5 minutes.** Fixed 5-minute cadence, selector
      removed from the legend (still pauses while the tab is hidden). *(July 2026)*
- [x] **Aggregation function (min, max, avg, sum, stddev) for hourly/daily.**
      Selector sits next to the variable picker and auto-selects each
      variable's own default (average for most, sum for precipitation) — no
      unspecified "Default" entry. `?agg=` URL param for non-default choices.
      Note: the grouped API route ignores `agg_func`, so non-default queries
      hit `/observations/hourly|daily/` per variable. Depth-grouped soil
      variables combine bands client-side (sum/std-dev disabled for those);
      derived variables don't support aggregation and show a disabled dash.
      *(July 2026)*
- [x] **Spider fan-out for co-located stations.** Ported from mesonet-status:
      count badges on stacks, hover/click fan-out with value-colored feet,
      network/category-aware anchor promotion. Replaces the longitude nudge.
      *(July 2026)*
- [x] **Log-ish scale for Soil Water Potential.** SWP color-maps in log₁₀
      space with raw-unit legend labels. *(July 2026)*
- [x] **PNG export (emulating the Mesonet Photo Explorer).** Navbar button
      renders a fixed 1400×700 map off-screen at 2× (output independent of
      the window), with an MCO branding card that includes the variable,
      timestamp, and color-scale legend. `?export=light|dark` headless hook
      for social previews. *(July 2026)*
