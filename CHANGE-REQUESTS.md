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
- [ ] **Allow for fixed scale.** When a user moves through different dates/times, they should be able to see data on a fixed scale in order to observe changes through time.
- [ ] **Enable a temporal timelapse.** Users are able to select start and end points (days, hours, timestamp, depending on temporal aggregation. A slider appears allowing people to smoothly move through the time period. Pressing a play button iterates through.
- [ ] **Adjustable staleness threshold.** Let the user change the 3-hour staleness cutoff (e.g. 1 h / 3 h / 6 h / 24 h).

---

## Done

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
