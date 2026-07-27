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

- [ ] **Enable a temporal timelapse.** Users are able to select start and end points (days, hours, timestamp, depending on temporal aggregation. A slider appears allowing people to smoothly move through the time period. Pressing a play button iterates through.
- [ ] **Adjustable staleness threshold.** Let the user change the 3-hour staleness cutoff (e.g. 1 h / 3 h / 6 h / 24 h).

### Deferred from the July 2026 audit

- [ ] **Visible "Table view" toggle.** An on-screen sortable station table (the SR-only table already built each render is the seed).
- [ ] **Export: current view vs. statewide choice.** Export always uses the fixed Montana framing while the button says "current view" — offer both or fix the copy.
- [ ] **12-hour time labels.** Hour readout / legend meta use 24-h ("14:00 MT") while popups use "2:25 PM MDT"; also "MT" doubles as the state abbreviation. Standardize.
- [ ] **Preserve the aggregation choice across variable changes** (it silently resets to each variable's default).
- [ ] **°F/°C toggle wording.** It actually switches *all* units (wind, precip, pressure) — consider labeling "US / Metric" (wording call for Kyle).
- [ ] **Assertive live region for errors.** Error toasts share the polite `#toast` region and can be preempted; add a `role="alert"` channel.
- [ ] **Search: "…and N more" hint.** Results silently cap at 8.
- [ ] **`document.title` should reflect variable/mode** (URL already does).
- [ ] **`pushState` for mode changes** so Back undoes big jumps instead of leaving the site.
- [ ] **Debounce hold-to-repeat fetches.** A held stepper fires a render per 150 ms step; advance the readout instantly, fetch after ~250 ms idle.
- [ ] **GDD base temperature in the label/description** (agronomists need the base to use the number).
- [ ] **Port the contrast-token fixes to mesonet-status** (`--text-dim`, `--ctrl-border`, muted marker stroke — shared MCO design system).
- [ ] **Per-app subdomains.** All `mt-climate-office.github.io` projects share one origin (one localStorage, shared XSS blast radius); custom subdomains would isolate them.

### Surfaced by the July 2026 mobile/overlay overhaul

- [ ] **The carousel re-requests photos on every 5-minute refresh.** `refreshOpenPopup()` rebuilds the body and re-runs `initPhotoCarousel`, so an open popup re-fetches its images every cycle. Cache the frame list per station+time instead.
- [ ] **320 px-wide screens still need 4 control rows in Hourly** (35 % chrome). Below any current device width, so left alone — revisit only if analytics show real traffic.
- [ ] **A landscape phone is inherently cramped.** Chrome is ~38 % of a 390 px-tall viewport even after tightening. A side sheet (right edge) instead of a bottom sheet would leave the map usable; deferred as a bigger change than the overhaul warranted.

---

## Done

- [x] **Zoom-out spring-back restored.** A `setMinZoom` clamp had replaced the
      original `zoomend` re-fit. Wrong twice over: zooming out past the state did
      nothing at all (a wall, not a spring), and MapLibre disables its own
      zoom-out button at `minZoom`, so the − control silently greyed out. A latent
      second bug came with it — `refitIfAtExtent()` used
      `setMinZoom(Math.min(_fitZoom, map.getZoom()))`, which *lowered* the floor to
      wherever you happened to be, so every panel toggle or resize ratcheted the
      limit down. All three `setMinZoom` calls are gone and the animated
      `fitBounds` spring is back, with an epsilon and a `_springingBack` flag so
      the fit's own `zoomend` can't retrigger it. Verified by the zoom trail over
      three button presses: 6.02 → 5.02 → 6.02 → 5.02 → 6.02 → 5.02 → 6.02, with
      no idle drift and zoom-in unaffected. *(July 2026)*
- [x] **Left sidebar takes a column; right panel floats.** The two panels now have
      deliberately opposite behaviour *(July 2026)*:
      *Left sidebar* is a real flex column, so opening or closing it resizes the
      map and re-fits Montana — the one camera change that is wanted, and it only
      happens when you toggle it. Made consistent: a `_selectedStation` guard in
      the resize handler used to suppress the re-fit whenever a station was open,
      so the same toggle behaved differently depending on selection. A sidebar
      toggle is now always treated as deliberate; the guard still protects against
      *incidental* resizes (a mobile URL bar, chrome re-wrapping).
      *Right detail panel* floats over the map and never influences the camera —
      `fitPadding()` is gone in favour of a constant `FIT_PAD`, so selecting a
      station leaves the map dead still and the spring-back always returns to the
      same framing. Verified: `camMovedOnFirstOpen: false`, 14/14 station swaps
      with the camera held on every one.
      *Map controls moved to the top-LEFT.* They were top-right, i.e. underneath
      the right-docked panel — completely unclickable whenever a station was open,
      which a zoom test caught. The left corner is free now the sidebar has its own
      column, so they can simply stay put instead of sliding out of the panel's
      way. The attribution has to stay bottom-right, so it still lifts clear of the
      bottom-docked sheet on compact viewports (it was being buried, which matters
      for CARTO/OSM terms). The sidebar's collapse handle became a vertically
      centred tab on its outer edge so it shares no corner with them.
      **Known trade-off:** holding the map still means the panel covers the eastern
      strip of the state — measured **41 of 115 stations (36%)** at 1440×900 while
      it is open. Unlike the old anchored popup this is predictable (always the
      same strip, never wherever you clicked) and those stations are reachable by
      closing the panel or panning, but it is the price of the camera not moving.
      Reserving the panel's width in the fit permanently would cover both goals at
      the cost of Montana rendering ~30% smaller and sitting off-centre when the
      panel is closed.
- [x] **Sidebar + docked detail panel.** Restructured the layout around two docked
      panels instead of controls scattered over the map *(July 2026)*:
      *Left sidebar* — search, networks, time, variable, aggregation and the
      legend now live in one column, modelled on d3drought.org. It floats over
      the map rather than taking a column of its own, and Montana is re-fitted
      into the strip left clear (`fitPadding()`), so no station hides underneath.
      Resizing the canvas instead would have been worse: Montana is a wide state
      (~1.77:1) and the map's aspect nearly matches it, so a 272px sidebar plus a
      360px panel at 1440px would leave a 740px strip and Montana would be fitted
      by width at roughly half size, with dead bands above and below. Collapsible
      via the edge handle, remembered in `localStorage` and `?sidebar=closed`.
      *Right detail panel* — the anchored MapLibre popup is **gone**, replaced by
      the same panel component the bottom sheet uses, docked to the right edge on
      desktop and the bottom edge on compact viewports. This fixes the reported
      bug directly: with a popup open, **11 of 29 surrounding dots (38%) sat
      underneath it and were completely unclickable** — the click landed on the
      popup, so nothing happened, which read as "clears the popup but won't let me
      pick a new station". Measured after: **0 dots covered, 14/14 station-to-
      station swaps succeed, and the camera holds on all 14.** The only camera
      movement is a single deliberate re-fit the first time the panel opens.
      A ring on the selected dot replaces the popup's tail as the "you are reading
      this one" cue.
      *Search* now opens the panel immediately instead of waiting for the fly-to
      to finish — it used to leave the previous station's data on screen for the
      whole ~4s flight, which read as the search having done nothing.
      *Click tolerance* — a 6px box for mouse input (10px for touch) with a
      distance sort, so a near-miss on a ~10px dot selects it rather than hitting
      empty map and closing the panel.
      *Compact viewports* — a ☰ drawer holds networks, aggregation and the legend,
      while time and variable stay inline in the top bar: they're the two controls
      people change constantly and burying them would cost two taps each.
      *Top bar* slimmed to logo, title, the "as of" stamp and the global actions
      (units, labels, export, share, theme, help).
      Controls live in ONE place in the DOM and are *moved* between the sidebar and
      the top control bar as the breakpoint changes, so every listener,
      `aria-pressed` sync and label association survives.
      Verified: PNG export unchanged (241 differing pixels of 3.92M — less than
      the 679 two runs of the *same* build differ by, i.e. pure live-data drift),
      all 21 URL params round-trip, the SR-only table and live regions still
      rebuild each render, no console errors at seven viewport sizes.

      *Supersedes parts of the entry below:* the anchored-popup work described
      there (its z-index tier, the map-container height clamp, the pinned anchor,
      `keepDetailInView`) no longer exists — the popup it applied to is gone. The
      findings that still hold are the carousel space reservation (which is what
      keeps the panel's height stable) and everything about the mobile layout.

- [x] **Mobile & overlay UX overhaul.** The app was hard to operate on a phone and
      its floating surfaces misbehaved on desktop too. Measured before/after in
      headless Chrome at 320×568 → 1920×1080 *(July 2026)*:
      *Popups landed in a different place every time* — `popupHTML` shipped the
      photo carousel `hidden` and revealed it once the image resolved, a
      full-width 4:3 block that grew the popup ~190 px **after** the user started
      reading and made MapLibre re-anchor it. The frame is now reserved at full
      height from the first paint (`data-state="loading|ok|none"`, never
      `hidden`), `/photos/` metadata is cached synchronously and warmed during
      `boot()` so `popupHTML` knows up front whether a station has a camera.
      With the height final at first paint, MapLibre's anchor is decided once and
      never re-flips. Position is now stable across 8 s, a variable change, and
      the 5-minute auto-refresh, which also preserves scroll position instead of
      yanking a mid-read popup to the top.
      *The legend ate the popup's clicks* — `.maplibregl-popup` ships with no
      z-index, so `#legend` and the vendor `.maplibregl-ctrl-*` containers
      (including the attribution `<details>`) painted over it;
      `elementFromPoint()` over "Also at this site" and "Station dashboard →"
      returned those, not the links. All z-indexes are now documented
      custom-property tiers in one block, with the detail tier above the map
      overlays and below the chrome.
      *Popups were cut off with no way to scroll* — the content had
      `overflow-y: visible; max-height: none` and overflowed the viewport by
      14 px at 390×844 and **217 px** at 844×390. Now clamped from the live map
      container (popups are clipped by `.maplibregl-map`'s `overflow: hidden`, so
      a `dvh` value is the wrong basis) with internal scroll.
      *The camera no longer moves when a station opens.* An earlier pass panned
      the map to fit the popup, which turned out to be the reason clicking
      stations felt unreliable: every open shifted every dot, so the one you were
      aiming at next had moved (a 90-click sweep landed only 2 stations; it's 10
      after removing the pan). Instead the clamp is half the map's height —
      MapLibre anchors the popup on whichever side of the dot has more room, and
      that side is by definition at least half the map, so it always fits with
      the camera untouched. Sheets never panned to begin with once the same
      reasoning was applied.
      *Bottom sheet on phones and short viewports* — one shared `popupHTML` body,
      two presentations behind a live `matchMedia` helper. Opens in the same
      place every time, with a peek state (name / network / value, sized by
      measuring the value block) that gives touch the readout hover gives a
      mouse. Drag up for the rest, swipe down / tap the backdrop / press Escape /
      hit the 44 px close button to dismiss. Escape precedence is untouched — the
      sheet is deliberately not a `<dialog>`, so native dialogs still own Escape.
      *Mobile chrome and the hidden variable picker* — the control bar was 939 px
      wide inside a 390 px viewport (**549 px hidden** behind a horizontal
      scroller; 759 px on a 375 px screen in Hourly), with `#variable-select`
      starting at x=465 — entirely off-screen. The scroller and its `.scroll-fade`
      mask are gone; the variable picker is full-width and always visible, groups
      pair two-to-a-row, and secondary tools collapse into a **⋯** tray. Latest
      mode: 203 px of chrome (24 %) → 153 px (18 %), nothing hidden at any width.
      *Landscape was broken* — an expanded legend reached 367 px inside a 235 px
      map, overflowing the top by 167 px under the control bar. The legend is now
      capped to the map with an internal scroller, hides outright while a station
      sheet is open (shuffling it around the sheet read as it being shoved
      about), and re-evaluates its collapsed default on rotation (it was a one-shot
      `matchMedia` read, so landscape inherited portrait's decision). The peek
      sheet lays out horizontally when short-and-wide: 213 px → 130 px, leaving
      113 px of map instead of 30 px.
      *Touch parity* — touch browsers synthesize a `mousemove` on tap, which fired
      the tooltip and spiderfied the bucket under the finger; suppressed. Taps get
      a 10 px hit-tolerance box with a distance sort (box queries return features
      in layer order, not by distance). Co-located stations are full-width tappable
      rows, the primary route on touch since the spider needs a hover to discover.
      *Camera* — the `zoomend` re-fit that yanked the map is replaced by a native
      `setMinZoom` clamp, and `resize` no longer re-fits on a chrome re-wrap or
      while a station is open.
      *Intro modal* — cut to a lede plus four "Start here" bullets with the
      long-form reference behind disclosures (≈2.8 screens → 1.1), a sticky header
      and a scroll shade, and it no longer auto-opens on top of a `?station=`
      deep link.
      *Also* — `viewport-fit=cover` so the existing `env(safe-area-inset-*)`
      actually resolves on notched phones; one scroll surface in the colour-scale
      editor (was 423 px of ramps in a 198 px window nested inside the dialog's
      own scroller); no stray horizontal scroll on phones — the sheet's sticky
      header used a negative-margin bleed that overflowed the fixed-width box,
      and since a scroll container clips both axes, neither `overflow-x: hidden`
      nor `clip` could suppress it (both coerce to a scroll container when the
      other axis scrolls), so the gutters moved onto the children instead; and
      `pushState` now emits `legend=open` as well as
      `legend=collapsed`, so an expanded legend on a phone survives a shared link.
      Verified: PNG export is **pixel-identical** to before (0 differing pixels of
      3.92 M), all 20 URL params round-trip, the SR-only station table and live
      regions still rebuild each render, `?kbd=off` still works, and no console
      errors at nine viewport sizes in both themes.
- [x] **Legend & color-scale package.** Six items in one pass *(July 2026)*:
      *Half-ramp bug fix* — when a variable's semantic pivot (32 °F, 50 % RH, Δ 0)
      falls outside the day's data, only the matching half of the diverging ramp
      is used, so blue always means "below freezing" (an 87 °F daily max no longer
      renders deep blue). *Clamp labels* — the robust 2nd–98th-percentile trimming
      is now visible as "≤ / ≥" on the legend and export ends, with an explanatory
      tooltip. *Adjustable color scale* — click the legend gradient to open an
      editor: ramp picker (ColorBrewer + Fabio Crameri's Scientific colour maps,
      MIT, doi:10.5281/zenodo.1243862), reverse toggle, custom min/mid/max.
      *Fixed scale* — a pin in the legend header locks the current range across
      dates/hours/refresh; `?scale=min,mid,max` + `?ramp=Name[-r]` make custom
      scales shareable and export-reproducible (cleared on variable/units change).
      *Cyclic wind ramp* — wind direction now uses Crameri's CVD-safe cyclic
      romaO (0° = 360°), legend labeled N…S…N. *Collapsed-legend color key* —
      the gradient and its limits stay visible when the legend is collapsed
      (the mobile default).
- [x] **Vendor the watershed FGB locally.** `data/mt_hucs.fgb` (124 KB) is now
      served same-origin instead of streaming from `data.climate.umt.edu` —
      that host resolves to a private IP on the UMT campus network, where
      Chrome's Local Network Access policy blocks fetches from public pages
      (watersheds silently failed for on-campus users). May migrate to a
      shared host later. Also drops a CSP `connect-src` entry. *(July 2026)*
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
