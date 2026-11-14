# Mesonet Explorer

A map of live, hourly and daily weather and soil data from every Montana Mesonet station.

https://mesonet.climate.umt.edu/explorer/

## Run it

```sh
python -m http.server 8000   # then open http://localhost:8000
```

No build step. The app reads the production API.

## Deploy

Pushing `main` deploys. GitHub Pages serves the repo root, and the `handle /explorer*` block in the [`mesonet_app`](https://github.com/mt-climate-office/mesonet_app) Caddyfile proxies it to `mesonet.climate.umt.edu/explorer/`.
The Caddyfile is deployed by hand: `git pull` in the `mesonet_app` checkout on the server, then `docker compose restart caddy`.

## URL parameters

All are optional. The address only carries values that differ from the default. The share button writes every parameter.

| Parameter | Values (default first) | What it does |
|---|---|---|
| `mode` | `latest`, `hourly`, `daily` | Time mode |
| `var` | `air_temp`, or any variable key (`ppt_7`, `soil_vwc_mid`, `eto`) | Variable shown |
| `date` | `YYYY-MM-DD`, default today in Mountain Time | Day for Hourly and Daily |
| `hour` | `0`–`23`, default the last complete hour | Hour for Hourly |
| `units` | `us`, `si` | Units |
| `net` | `hydromet,agrimet` | Networks shown |
| `labels` | `on`, `off` | Value labels on the dots |
| `agg` | the variable's default, `min`, `max`, `avg`, `sum`, `stddev` | Aggregation in Hourly and Daily |
| `scale` | `min,mid,max`, each may be `-` | Color-scale range. A min or max locks it across time steps |
| `ramp` | the variable's default, or a ramp name, `-r` reverses | Color ramp |
| `radar` | off, `on` | NEXRAD radar, Latest only |
| `nodata` | shown, `hide` | Stations with no data |
| `stale` | hidden, `show` | Stations with no report in 2 hours, Latest only |
| `counties` | off, `on` | County lines |
| `watersheds` | off, `on` | HUC6 watersheds |
| `legend` | open on desktop, collapsed on a phone; `open`, `collapsed` | The Legend group |
| `sidebar` | `open`, `closed` | Desktop sidebar |
| `theme` | the OS setting, `light`, `dark`, `high-contrast` | Color theme |
| `kbd` | on, `off` | `off` turns off the `/`, `←` and `→` keys |
| `lng`, `lat`, `zoom` | the Montana extent | Map camera. All three or none |
| `station` | a station id, e.g. `aceabsar` | Opens that station |
| `export` | `light`, `dark` | Downloads a PNG of the map after load |

## Data

- [Montana Mesonet API v2](https://mesonet2.climate.umt.edu/api/docs), `https://mesonet2.climate.umt.edu/api`: `/stations/`, `/observations/grouped/`, `/observations/hourly/`, `/observations/daily/`, `/latest/`, `/derived/`, `/derived/hourly/`, `/derived/daily/`, `/derived/ppt/`, `/derived/change/`, `/photos/` (fallback camera list).
- Station photos: `https://data2.climate.umt.edu/mesonet/photos/` (`schedule/schedule.json`, monthly `manifest/` CSVs, `webp/large/` images).
- Soil parameters: `https://data2.climate.umt.edu/mesonet/soils/soil_params.json`.
- Radar: Iowa Environmental Mesonet NEXRAD WMS, `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi`.
- Boundaries: `data/*.geojson`, made by `data.R` from Census TIGER 2023. `data/mt_hucs.fgb` is a vendored copy of the MCO watershed file.

## Tests

```sh
cd test && npm ci && npm test   # or: npm test -- layout | url | map | export | photos
```

## Kit

`mco-web-style` 1.0.0.
Design rules: mco-web-style/HOUSE-STYLE.md
