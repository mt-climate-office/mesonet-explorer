# Mesonet Explorer

Interactive map explorer for [Montana Mesonet](https://climate.umt.edu/mesonet/) station data — the successor to the Leaflet "latest data" map at `mesonet.climate.umt.edu/api/v2/map/latest/`. A service of the [Montana Climate Office](https://climate.umt.edu).

**Live:** https://mt-climate-office.github.io/mesonet-explorer/

## Features

- **Three time modes**
  - **Latest** — most recent observation at every station, auto-refreshed every 5 minutes (paused while the tab is hidden). Stations reporting more than 3 hours ago are hidden as *stale* (toggle them back in the legend).
  - **Hourly** — any date + hour since the network began; hold-to-repeat steppers, midnight wrap.
  - **Daily** — any date; daily aggregates (totals for precipitation, averages otherwise).
- **Aggregation selector** (Hourly/Daily) — min / max / average / sum / std dev for observed variables, next to the variable picker. It auto-selects each variable's own default (average for most, sum for precipitation), so the selection is always explicit.
- **~55 variables**, grouped in the picker: air temperature, RH, pressure, solar, VPD, feels-like / heat index / wind chill / wet bulb / CCI / sea-level pressure, wind speed / gust / direction, precipitation (period + since-midnight/24 h/2/7/14/30/60/90/180 d/YTD windows), snow depth, soil VWC / percent saturation / soil water potential / temperature / bulk EC at three depths, soil-moisture change (Δ VWC over 1/7/14/30 days), frost depth, reference ET, growing degree days, and well level / temperature / EC. The picker adapts to the time mode (precipitation accumulations and Δ VWC in Latest, reference ET in Hourly/Daily, GDD in Daily).
- **Color-scaled markers** with ColorBrewer and [Scientific colour map](https://www.fabiocrameri.ch/colourmaps/) (Crameri) ramps and semantic midpoints (temperatures pivot at freezing, RH at 50 %, Δ VWC at 0), robust 2nd–98th percentile domains (trimmed extremes are marked ≤/≥ in the legend), and a live gradient legend. When a pivot falls outside the day's data (e.g. every station above freezing), only the matching half of the diverging ramp is used, so blue always means below freezing. Wind direction uses the cyclic, CVD-safe romaO ramp (0° and 360° share a color). Soil water potential uses a log₁₀ color scale (it spans several orders of magnitude). **Click the legend gradient** to pick a different ramp or set a custom min/mid/max; the **pin** locks the scale while stepping through time.
- **Co-located stations** (HydroMet + AgriMet pairs) show a count badge and fan out into a hover/click "spider" so both dots are reachable — ported from the [status map](https://github.com/mt-climate-office/mesonet-status). The details panel also lists them as full-width tappable rows, which is the primary route on touch (the spider needs a hover to discover).
- **Station search** — tiered name/ID matching, keyboard navigation, `/` shortcut, flies to the station and opens its detail panel.
- **Station details** — metadata, the current variable's value and timestamp, co-located stations as tappable rows, dashboard + API links, and a **photo carousel** cycling every camera direction, time-matched to the selected hour (or morning + afternoon frames in Daily mode). One panel, two dock edges: the **right** edge of the map on desktop, the **bottom** edge on phones and short viewports. Because it's docked rather than anchored to the dot, it covers no stations — you can click straight from one station to the next and the content swaps in place. The selected dot gets a ring. On compact viewports it opens as a *peek* (name, network, value) and drags up for the rest; swipe down, tap the map, press <kbd>Esc</kbd>, or hit the close button to dismiss.
- **Overlays** — Montana outline and tribal lands (always on), counties, watersheds (HUC6 basins, FlatGeobuf), and live NEXRAD radar (Latest mode only, courtesy of the [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/)).
- **Value labels** on by default, with collision dodging; sub-network chips (HydroMet / AgriMet) with live counts.
- **US / metric units** (°F/°C toggle) applied to values, legend, and the detail panel.
- **PNG export** — one click downloads a branded 2800×1400 map of the current view (fixed Montana framing independent of your window, MCO logo, timestamp, and color scale), emulating the Mesonet Photo Explorer's export.
- **Shareable URLs** — every choice lives in the query string; light/dark theme.
- **Left control sidebar** — search, networks, time, variable, aggregation and the legend in one column, collapsible via the tab on its outer edge. It takes a real column, so toggling it resizes the map and re-fits Montana. The detail panel is deliberately the opposite: it floats, so selecting a station never moves the camera. Zoom and fit-to-extent sit at the map's **top-left**, clear of the panel.
- **Built for phones as well as desks** — below 640 px the sidebar becomes a **☰** drawer (networks, aggregation, legend) while time and variable stay inline in the top bar, and a **⋯** tray holds units, labels, export, share and theme. Nothing hides behind a horizontal scroll. Touch gets a 10 px tap tolerance, 40–44 px targets, and the peek sheet in place of hover.

## URL parameters

Every parameter is optional and every one has a default, so **the default view has
a clean URL with no query string at all**. A parameter appears only once its value
differs from the default, and disappears again when you return to it — so the URL
is always the shortest description of what you're looking at. All of them remain
valid as input whether or not the app would emit them.

Two consequences worth knowing:

- `date`/`hour` default to the newest data available, so a link with no date shows
  the **recipient's** latest day rather than the sender's. That's right for "here
  are current conditions" and wrong for "look at this specific time" — but the
  latter always carries an explicit date, since a past date isn't the default.
- `theme` is emitted only when it differs from the viewer's OS preference. Your own
  choice is remembered in `localStorage` regardless; the parameter exists so a link
  can carry a deliberate one.

The **share button is the exception**: it copies a *fully specified* URL with every
parameter written out, so the recipient sees precisely what the sharer saw —
regardless of their OS theme, their saved preferences, or what "today" happens to
be when they open it. (`kbd` is left out: it's the sharer's input preference, not
part of the view.) The address bar stays minimal either way.

| Param | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `latest` \| `hourly` \| `daily` | `latest` | Time mode |
| `var` | registry key (e.g. `air_temp`, `ppt_7`, `soil_vwc_mid`, `eto`) | `air_temp` | Displayed variable |
| `date` | `YYYY-MM-DD` | today (MT) | Hourly/Daily date, clamped to network history |
| `hour` | `0`–`23` | last complete hour | Hourly mode hour (Mountain Time) |
| `units` | `us` \| `si` | `us` | Unit system |
| `net` | `hydromet`, `agrimet` (space/comma list) | both | Visible sub-networks; omitted from the URL when both are on |
| `labels` | `on` \| `off` | **on** | Value labels on markers |
| `agg` | `min` \| `max` \| `avg` \| `sum` \| `stddev` | variable's default | Aggregation function (Hourly/Daily, observed variables); only non-default choices appear in the URL |
| `scale` | `min,mid,max` (each may be `-`) | automatic | Custom color-scale range/pivot for the current variable; setting min/max locks the scale across time steps |
| `ramp` | ramp name, `-r` suffix = reversed (e.g. `vik`, `batlow-r`) | variable's default | Color ramp override (ColorBrewer + Crameri names) |
| `radar` | `on` | off | NEXRAD overlay (Latest only) |
| `nodata` | `hide` | show | Hide no-data stations |
| `stale` | `show` | hide | Show stale (> 3 h) stations (Latest only) |
| `counties` | `on` | off | County-boundary overlay |
| `watersheds` | `on` | off | HUC6 watershed overlay |
| `legend` | `collapsed` \| `open` | open | Legend state (it lives in the sidebar, so collapsing it no longer buys map back) |
| `sidebar` | `open` \| `closed` | open | Left control sidebar. Desktop only — on compact viewports it's a drawer that always starts closed |
| `theme` | `light` \| `dark` | OS preference | Color theme; emitted only when it differs from the OS preference |
| `kbd` | `off` | on | Disable the `/` search shortcut (WCAG 2.1.4). Round-trips, so it survives a reload |
| `lng`, `lat`, `zoom` | floats | Montana extent | Map camera. All three or none; omitted while the map is at the fitted extent |
| `station` | station ID (e.g. `acemocca`) | — | Deep link: fly to + open the detail panel |
| `export` | `light` \| `dark` | — | Headless hook: forces the theme and auto-downloads a PNG after load |

Example: `?mode=hourly&var=wind_spd&date=2026-07-01&hour=18&units=si&station=acemocca`

A default load, by contrast, leaves the URL bare — no `?` at all.

## Data sources

All station data come live from the **[Montana Mesonet API v2](https://mesonet2.climate.umt.edu/api/docs)** (`mesonet2.climate.umt.edu/api`, CORS-open). The base URL is a single constant (`const API = …`) at the top of the app script in `index.html`:

| Endpoint | Used for |
|---|---|
| `/stations/` | Station metadata (fetched once at boot) |
| `/observations/grouped/` | Core observations, all three modes (`latest=true`, `hour=true`, or `day=true` + `start_time`/`end_time`); one fetch per mode/timestamp serves ~21 variables |
| `/derived/`, `/derived/hourly/`, `/derived/daily/` | Derived variables (feels-like, ET, GDD, saturation, SWP, frost depth, …), per element |
| `/derived/ppt/` | Precipitation accumulation windows (Latest only) |
| `/derived/change/` | Soil-moisture change (Latest only; fetched in station batches — the unfiltered call times out) |
| `/latest/`, `/observations/hourly/`, `/observations/daily/` | VPD and well variables (`elements=` list); also all aggregation (`agg_func=`) queries |
| `/photos/`, `/photos/{station}/{dir}/` | Camera metadata + time-matched station photos (`dt=` param) |

Responses are cached per `(source, units, timestamp)` as promises (deduping in-flight requests); Latest-keyed entries are invalidated by the auto-refresh timer. All timestamps and date logic use `America/Denver`.

### Known API quirks handled client-side

Both fixes key off the unit string parsed from the returned column names, so they become no-ops if the API is fixed:

- **`/observations/grouped/` with `units=si` converts values but not column labels** (e.g. returns `24.06` under `"Air Temperature [°F]"`). The app relabels without converting.
- **`/derived/ppt/` has no `units` parameter** (always U.S. units). The app converts values and relabels.
- **`/observations/grouped/` ignores `agg_func`** (always returns the default aggregation). Aggregation queries therefore go to `/observations/hourly|daily/` with each variable's raw element ids; those endpoints prefix the returned column names ("Maximum Air Temperature @ 2 m"), which the app strips. Depth-band variables combine client-side (min of mins, max of maxes, average of averages) — sum/std-dev are disabled for them.
- `/derived/change/` returns a 504 when queried for the whole network at once; the app batches 40 stations per request.
- `elements=etr` on `/derived/daily/` returns the same column as `eto` (`Reference ET (a=0.23)`), so only `eto` is exposed.

Boundary overlays (`data/*.geojson`) are generated by `data.R` (tigris + rmapshaper, Census TIGER 2023) and shared with the [mesonet-status](https://github.com/mt-climate-office/mesonet-status) map. Watershed boundaries (`data/mt_hucs.fgb`, loaded at first use) are a vendored copy of the MCO CDN's `data.climate.umt.edu/mesonet/fgb/mt_hucs.fgb` — that host resolves to a private IP on the UMT campus network, where Chrome's Local Network Access policy blocks fetches from public pages.

## Tooling

Deliberately zero-build, matching the MCO pattern ([mesonet-status](https://github.com/mt-climate-office/mesonet-status), [snowpack explorer](https://github.com/mt-climate-office/mco-snowpack-explorer)):

- Two files — `index.html` (markup + inline CSS design tokens) and `app.js` (a single ES module, kept external so the Content-Security-Policy can pin scripts to `'self'`). No framework, no bundler, no `package.json`.
- [MapLibre GL JS 5.18.0](https://maplibre.org/) (pinned, unpkg CDN); CARTO Positron / Dark Matter basemaps; [flatgeobuf](https://flatgeobuf.org/) 3.38.0 (pinned, jsDelivr) for the watershed overlay. All three carry SRI hashes (see Security).
- Fonts: Outfit (UI) + Space Mono (numerals/metadata), Google Fonts.
- Dark-first theme tokens with a light theme; `localStorage['mco-theme']` is shared across MCO apps.
- **Every z-index is a token**, declared with its tier in one commented block in `index.html` (`--z-map-overlay` … `--z-toast`). Add to a tier rather than inventing a number — MapLibre's own corner controls sit at z-index 2, so anything floating over the map has to clear that.
- **One breakpoint lives in two places.** `COMPACT_MQ` in `app.js` (`max-width: 640px`, `max-height: 560px`) decides *behaviour* — which edge the detail panel docks to, whether the sidebar is a fixture or a drawer, and where each control group lives. The CSS decides *layout*, and splits the two on purpose: the narrow rules are width-only (`max-width: 640px`), because a short-but-wide window has plenty of room for the full header and must not get the phone layout; short-viewport rules are height-only. Keep the JS query in sync with the two `@media` blocks marked `NARROW LAYOUT` and `SHORT VIEWPORTS`.

## Security

- **CSP** — a `<meta http-equiv="Content-Security-Policy">` tag in `index.html` restricts scripts to `'self'`, the two pinned CDN hosts, and a sha256 hash of the inline theme-flash script, and enumerates every origin the app talks to (`connect-src`/`img-src`/`font-src`/`style-src`). GitHub Pages can't set headers, so the meta form is used; `frame-ancestors` is not enforceable there.
- **SRI** — the MapLibre JS/CSS and flatgeobuf `<script>`/`<link>` tags are version-pinned and carry `integrity` hashes; a tampered CDN response fails to load instead of executing.
- **If you edit the inline theme-flash script** (the small `<script>` block in `<head>`), recompute its CSP hash and update the `sha256-…` token in the CSP meta tag:

  ```sh
  perl -0777 -ne 'print $1 if /<script>(.*?)<\/script>/s' index.html \
    | openssl dgst -sha256 -binary | openssl base64 -A
  ```

  A stale hash blocks the script and the page loads without a theme set (everything else still works). Editing `app.js` needs no hash changes — it's covered by `script-src 'self'`.

## Development

```sh
python -m http.server 8000
# → http://localhost:8000
```

No build step. The app talks to the production API directly.

### Checks

```sh
cd test && npm install && npm test
```

Headless browser checks live in [`test/`](test/) — layout and reachability across
six viewport sizes, URL round-tripping and share links, map camera behaviour, and
the PNG export. They are a separate package so the app itself stays
dependency-free, and the runner starts its own static server, so nothing needs to
be running first. See [`test/README.md`](test/README.md), in particular the two
notes on live-data drift and stale coordinates — the ways these checks mislead
you if you skim the output.

The URL parameters double as a manual harness. Useful deterministic states:

| URL | Checks |
|---|---|
| `?station=acemocca&legend=open` | Station detail — docked bottom below 640 px wide or 560 px tall, docked right above. Assert its rect is inside the viewport, that `elementFromPoint()` over every link returns the panel, and that **no station dot** is covered by it |
| `?sidebar=closed` | Sidebar collapsed; Montana re-fits to the wider strip |
| `?mode=daily` at 390×844 | `#control-bar.scrollWidth === clientWidth` (nothing hidden) and `#variable-select` fully on-screen |
| `?legend=open` at 844×390 | `#legend` fits inside `#map-container` |
| `?export=light` / `?export=dark` | Auto-downloads the PNG 1.5 s after first render — the output should stay pixel-identical across UI changes |
| `?theme=light` | `documentElement.dataset.theme` is set, which also proves the pinned CSP hash still matches the inline theme script |
| `?kbd=off` | `/` does not focus the search box; <kbd>Esc</kbd> still closes panels |

## Deployment

GitHub Pages from the `main` branch root (Settings → Pages → Deploy from branch → `main` / `/`).

## License

MIT © Montana Climate Office
