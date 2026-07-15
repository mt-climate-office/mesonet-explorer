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
- **Color-scaled markers** with ColorBrewer ramps and semantic midpoints (temperatures pivot at freezing, RH at 50 %, Δ VWC at 0), robust 2nd–98th percentile domains, and a live gradient legend. Soil water potential uses a log₁₀ color scale (it spans several orders of magnitude).
- **Co-located stations** (HydroMet + AgriMet pairs) show a count badge and fan out into a hover/click "spider" so both dots are reachable — ported from the [status map](https://github.com/mt-climate-office/mesonet-status).
- **Station search** — tiered name/ID matching, keyboard navigation, `/` shortcut, flies to and opens the station popup.
- **Popups** — station metadata, the current variable's value and timestamp, dashboard + API links, and a **photo carousel** cycling every camera direction, time-matched to the selected hour (or morning + afternoon frames in Daily mode).
- **Overlays** — Montana outline and tribal lands (always on), counties, watersheds (HUC6 basins, streamed as FlatGeobuf from the MCO CDN), and live NEXRAD radar (Latest mode only, courtesy of the [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/)).
- **Toggleable value labels** with collision dodging; sub-network chips (HydroMet / AgriMet) with live counts.
- **US / metric units** (°F/°C toggle) applied to values, legend, and popups.
- **PNG export** — one click downloads a branded 2800×1400 map of the current view (fixed Montana framing independent of your window, MCO logo, timestamp, and color scale), emulating the Mesonet Photo Explorer's export.
- **Shareable URLs** — every choice lives in the query string; light/dark theme; responsive down to phones.

## URL parameters

| Param | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `latest` \| `hourly` \| `daily` | `latest` | Time mode |
| `var` | registry key (e.g. `air_temp`, `ppt_7`, `soil_vwc_mid`, `eto`) | `air_temp` | Displayed variable |
| `date` | `YYYY-MM-DD` | today (MT) | Hourly/Daily date, clamped to network history |
| `hour` | `0`–`23` | last complete hour | Hourly mode hour (Mountain Time) |
| `units` | `us` \| `si` | `us` | Unit system |
| `net` | `hydromet`, `agrimet` (space/comma list) | both | Visible sub-networks |
| `labels` | `on` | off | Value labels on markers |
| `agg` | `min` \| `max` \| `avg` \| `sum` \| `stddev` | variable's default | Aggregation function (Hourly/Daily, observed variables); only non-default choices appear in the URL |
| `radar` | `on` | off | NEXRAD overlay (Latest only) |
| `nodata` | `hide` | show | Hide no-data stations |
| `stale` | `show` | hide | Show stale (> 3 h) stations (Latest only) |
| `counties` | `on` | off | County-boundary overlay |
| `watersheds` | `on` | off | HUC6 watershed overlay |
| `legend` | `collapsed` \| `open` | open (collapsed ≤ 640 px) | Legend state |
| `theme` | `light` \| `dark` | OS preference | Color theme |
| `lng`, `lat`, `zoom` | floats | Montana extent | Map camera |
| `station` | station ID (e.g. `acemocca`) | — | Deep link: fly to + open popup |
| `export` | `light` \| `dark` | — | Headless hook: forces the theme and auto-downloads a PNG after load |

Example: `?mode=hourly&var=wind_spd&date=2026-07-01&hour=18&units=si&station=acemocca`

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
| `/photos/`, `/photos/{station}/{dir}/` | Camera metadata + time-matched popup photos (`dt=` param) |

Responses are cached per `(source, units, timestamp)` as promises (deduping in-flight requests); Latest-keyed entries are invalidated by the auto-refresh timer. All timestamps and date logic use `America/Denver`.

### Known API quirks handled client-side

Both fixes key off the unit string parsed from the returned column names, so they become no-ops if the API is fixed:

- **`/observations/grouped/` with `units=si` converts values but not column labels** (e.g. returns `24.06` under `"Air Temperature [°F]"`). The app relabels without converting.
- **`/derived/ppt/` has no `units` parameter** (always U.S. units). The app converts values and relabels.
- **`/observations/grouped/` ignores `agg_func`** (always returns the default aggregation). Aggregation queries therefore go to `/observations/hourly|daily/` with each variable's raw element ids; those endpoints prefix the returned column names ("Maximum Air Temperature @ 2 m"), which the app strips. Depth-band variables combine client-side (min of mins, max of maxes, average of averages) — sum/std-dev are disabled for them.
- `/derived/change/` returns a 504 when queried for the whole network at once; the app batches 40 stations per request.
- `elements=etr` on `/derived/daily/` returns the same column as `eto` (`Reference ET (a=0.23)`), so only `eto` is exposed.

Boundary overlays (`data/*.geojson`) are generated by `data.R` (tigris + rmapshaper, Census TIGER 2023) and shared with the [mesonet-status](https://github.com/mt-climate-office/mesonet-status) map. Watershed boundaries stream from `data.climate.umt.edu/mesonet/fgb/mt_hucs.fgb` at first use.

## Tooling

Deliberately zero-build, matching the MCO pattern ([mesonet-status](https://github.com/mt-climate-office/mesonet-status), [snowpack explorer](https://github.com/mt-climate-office/mco-snowpack-explorer)):

- One `index.html` — inline CSS design tokens + a single ES-module script. No framework, no bundler, no `package.json`.
- [MapLibre GL JS 5.18.0](https://maplibre.org/) (pinned, unpkg CDN); CARTO Positron / Dark Matter basemaps; [flatgeobuf](https://flatgeobuf.org/) 3.x for the watershed overlay.
- Fonts: Outfit (UI) + Space Mono (numerals/metadata), Google Fonts.
- Dark-first theme tokens with a light theme; `localStorage['mco-theme']` is shared across MCO apps.

## Development

```sh
python -m http.server 8000
# → http://localhost:8000
```

No build step. The app talks to the production API directly.

## Deployment

GitHub Pages from the `main` branch root (Settings → Pages → Deploy from branch → `main` / `/`).

## License

MIT © Montana Climate Office
