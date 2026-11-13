  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const API = 'https://mesonet2.climate.umt.edu/api';
  const DASH_URL  = (s) => `https://mesonet.climate.umt.edu/dash/${encodeURIComponent(s)}/`;
  const TZ = 'America/Denver';

  // Kit defaults (MCO.map.MT_FIT_BOUNDS / .FIT_OPTS), aliased for the direct
  // fitBounds/cameraForBounds calls below.
  const MT_FIT_BOUNDS = MCO.map.MT_FIT_BOUNDS;
  // Main-map fits go through fitOpts(), which widens the padding on whichever
  // side a panel is floating over. The PNG export builds its own map with a flat
  // padding of 24 — its framing is deliberately independent of the window.
  const FIT_OPTS      = { padding: 24, animate: false };

  // Stale is >= 2 h family-wide (HOUSE-STYLE, 0.21.0): mesonet-status's rule.
  const STALE_MS          = 2 * 60 * 60 * 1000;   // latest mode: hide obs 2 h old or older
  const REFRESH_MS        = 5 * 60 * 1000;        // latest-mode auto-refresh cadence
  const SEARCH_FLY_ZOOM   = 11;
  const SEARCH_FLY_SPEED  = 1.4;
  const LABEL_MINZOOM     = 5;
  const NULL_COLOR        = '#9aa3b3';
  const EARLIEST_DATE     = '2016-01-01';   // refined from station install dates at boot

  const RADAR_TILES = (ts) =>
    'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi' +
    '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=nexrad-n0r&STYLES=' +
    '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256' +
    `&BBOX={bbox-epsg-3857}&_ts=${ts}`;

  // ── Color ramps (hex stops, low → high) ──────────────────────────────────
  // The approved ramps come from the kit's MCO.palette (0.9.0, HOUSE-STYLE §6);
  // the eight shared names were byte-identical here. The Crameri maps the kit
  // doesn't carry stay local (data-encoding, CVD-safe):
  // Crameri, F. (2018). Scientific colour maps. Zenodo.
  // doi:10.5281/zenodo.1243862 — MIT license. https://www.fabiocrameri.ch/colourmaps/
  // Spectral is gone: banned by §6 (red→green, not colorblind-safe). A shared
  // ?ramp=spectral link opens on RdBu, with a toast saying so.
  const KIT_RAMPS = ['RdBu', 'BrBG', 'YlGnBu', 'YlOrRd', 'Blues', 'PuRd', 'batlow', 'romaO'];
  const RAMPS = {
    ...Object.fromEntries(KIT_RAMPS.map(n => [n, [...MCO.palette.RAMPS[n]]])),
    // Crameri: sequential, diverging (odd stop count, neutral centre), cyclic.
    lajolla:  ['#191900','#31220e','#512d1e','#7d3b35','#b34947','#d9604e','#e38050','#e99d53','#f0bd57','#f9e384','#fffecb'],
    davos:    ['#00054a','#102a6f','#234a8c','#3a679b','#547d9c','#6c8e93','#849e89','#a4b68a','#d4dba8','#f5f5d7','#fefefe'],
    bamako:   ['#003b47','#0d4340','#1b4c37','#2e582b','#47681c','#637a0a','#818800','#a2930d','#c6ae39','#e5cb75','#ffe5ad'],
    vik:      ['#001261','#023a7b','#116496','#5496b7','#a7c9da','#ece5e0','#e1b8a0','#cd8961','#b75a26','#852206','#590008'],
    roma:     ['#7e1700','#984e14','#ac7726','#c1a343','#d2d484','#c0eac3','#89dad7','#4db3cf','#2d88be','#1e5fac','#033198'],
    broc:     ['#2c1a4c','#284174','#3f6b99','#7697b7','#b3c5d7','#ebeeec','#dcdbb8','#b6b67c','#81814c','#505023','#262600'],
    cork:     ['#2c194c','#284275','#3d6b98','#6f92b3','#adc1d4','#e6edec','#b7cfb7','#7ba77a','#438142','#195615','#0f2903'],
    vikO:     ['#4f1a3d','#3f2c5b','#334b7f','#4575a1','#759ebc','#aebdc8','#d5beb3','#d7a387','#c57c56','#a34d2d','#7c271e','#611627','#4f1a3d'],
  };
  // Editor picker grouping + display names.
  const RAMP_GROUPS = [
    { label: 'ColorBrewer', ramps: ['RdBu','BrBG','YlGnBu','YlOrRd','Blues','PuRd'] },
    { label: 'Scientific colour maps (Crameri)',
      ramps: ['batlow','lajolla','davos','bamako','vik','roma','broc','cork','romaO','vikO'] },
  ];

  // ── Unit handling (self-healing SI fallbacks) ────────────────────────────
  // Two v2 API quirks, both keyed off the unit string parsed from the
  // returned column name so they become no-ops if the API is fixed:
  //  - /observations/grouped/ with units=si converts the VALUES but leaves
  //    the column LABELS in U.S. units → relabel only, never convert.
  //  - /derived/ppt/ has no units parameter and always returns U.S. units
  //    → convert values AND relabel.
  // /latest, /observations/(hourly|daily), and /derived/* handle units
  // correctly and need no client-side action.
  const US_TO_SI = {
    '°F':   { unit: '°C',   f: v => (v - 32) / 1.8 },
    'in':   { unit: 'mm',   f: v => v * 25.4 },
    'in/h': { unit: 'mm/h', f: v => v * 25.4 },
    'mi/h': { unit: 'm/s',  f: v => v * 0.44704 },
    'mbar': { unit: 'kPa',  f: v => v * 0.1 },
  };
  // Per-variable overrides where the API's SI unit differs from the table above.
  const SI_OVERRIDES = {
    snow_depth: { from: 'in', unit: 'cm', f: v => v * 2.54 },
  };
  // Per-variable U.S. display units where the API's U.S. unit is not the one
  // U.S. readers expect: barometric pressure in inHg, not mbar (1 inHg =
  // 33.8639 mbar), and VPD in kPa, as agronomy and growers use it. Keyed off
  // the returned unit, so a no-op if the API changes.
  const US_OVERRIDES = {
    baro: { from: 'mbar', unit: 'inHg', f: v => v / 33.8638866667 },
    vpd:  { from: 'mbar', unit: 'kPa',  f: v => v * 0.1 },
  };
  // The U.S. display override for `entry`'s returned `unit`, or null.
  const usOverride = (entry, units, unit) => {
    const ov = units !== 'si' && entry.usKey ? US_OVERRIDES[entry.usKey] : null;
    return ov && unit === ov.from ? ov : null;
  };

  // /observations/hourly|daily rename columns per agg_func
  // ("Maximum Air Temperature @ 2 m [°F]"); map both directions here.
  const AGG_PREFIX = { min: 'Minimum ', max: 'Maximum ', avg: 'Average ',
                       sum: 'Total ',   stddev: 'Standard Deviation ' };
  const AGG_LABEL  = { min: 'min', max: 'max', avg: 'average', sum: 'sum', stddev: 'std dev' };

  // Semantic color-scale midpoints, keyed by the *displayed* unit so they
  // stay correct in either unit system.
  const MID_FREEZE = { '°F': 32, '°C': 0 };
  const MID_RH     = { '%': 50 };
  const MID_ZERO_F = { '°F': 0, '°C': 0 };

  // ── Variable registry ────────────────────────────────────────────────────
  // source:
  //   'obs'    → /observations/grouped/ (one fetch serves all obs variables)
  //   'derived'→ /derived[/hourly|/daily]/?elements=<element>&grouped=true
  //   'pptwin' → /derived/ppt/ (latest only; all precip windows in one call)
  //   'extra'  → /latest or /observations/(hourly|daily) with elements= list
  //   'change' → /derived/change/ (latest only; deferred, station-batched)
  //   'soil'   → per-depth VWC + mesonet-soils lab fits, computed client-side
  //              (calc 'sat' | 'swp'; the API retired both in Oct 2026)
  // col: display-name prefix of the wide column (before any "(...)"/unit suffix)
  // modes: which time modes support the variable
  // scale: {ramp, rev, mid, log} — mid keyed by displayed unit; log → color-map in log10 space
  // fmt: 'p2' = 2 decimals; default auto (integers when range > 5, else 1 dp)
  // siKey / usKey: per-variable unit override (SI_OVERRIDES / US_OVERRIDES)
  // els: raw element ids for aggregation fetches (/observations/hourly|daily
  //      renames columns per agg_func, so agg queries go per-entry). Order =
  //      coalesce preference for alternative sensors (2 m before 8 ft).
  // band: true → els are depth bands combined client-side (min/max/avg only;
  //      sum & stddev are not combinable across bands and get disabled).
  const ALL_MODES = ['latest', 'hourly', 'daily'];
  const REGISTRY = [
    // Atmosphere
    { key:'air_temp',   label:'Air Temperature',        group:'Atmosphere', col:'Air Temperature',       source:'obs',    els:['air_temp_0200','air_temp_0244'], modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'rh',         label:'Relative Humidity',      group:'Atmosphere', col:'Relative Humidity',     source:'obs',    els:['rh'], modes:ALL_MODES, scale:{ramp:'BrBG', mid:MID_RH} },
    { key:'sol_rad',    label:'Solar Radiation',        group:'Atmosphere', col:'Solar Radiation',       source:'obs',    els:['sol_rad'], modes:ALL_MODES, scale:{ramp:'YlOrRd'} },
    { key:'vpd',        label:'Vapor Pressure Deficit', group:'Atmosphere', col:'Vapor Pressure Deficit',source:'derived', element:'vpd', modes:ALL_MODES, scale:{ramp:'YlOrRd'}, fmt:'p2', usKey:'vpd' },
    { key:'feels_like', label:'Feels-Like Temperature', group:'Atmosphere', col:'Feels Like Temperature',source:'derived', element:'feels_like', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'heat_index', label:'Heat Index',             group:'Atmosphere', col:'Heat Index',            source:'derived', element:'heat_index', modes:ALL_MODES, scale:{ramp:'YlOrRd'} },
    { key:'wind_chill', label:'Wind Chill',             group:'Atmosphere', col:'Wind Chill',            source:'derived', element:'wind_chill', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'wet_bulb',   label:'Wet Bulb Temperature',   group:'Atmosphere', col:'Wet Bulb Temperature',  source:'derived', element:'wet_bulb',   modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'cci',        label:'Comprehensive Climate Index', group:'Atmosphere', col:'Comprehensive Climate Index', source:'derived', element:'cci', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    // NWS-style sea-level pressure (API `mslp`, 2026-11-02). It replaces both
    // station pressure (a map of it is mostly a map of elevation) and the API's
    // legacy `slp`, a temperature-free offset. Named the way U.S. readers know
    // it; the earlier 'slp' key still resolves (VAR_ALIASES).
    { key:'bp',         label:'Barometric Pressure',    group:'Atmosphere', col:'Sea Level Pressure',    source:'derived', element:'mslp', modes:ALL_MODES, scale:{ramp:'PuRd'}, fmt:'p2', usKey:'baro' },

    // Wind
    { key:'wind_spd', label:'Wind Speed',     group:'Wind', col:'Wind Speed',     source:'obs', els:['wind_spd_1000','wind_spd_0244'], modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'windgust', label:'Wind Gust',      group:'Wind', col:'Gust Speed',     source:'obs', els:['windgust_1000','windgust_0244'], modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'wind_dir', label:'Wind Direction', group:'Wind', col:'Wind Direction', source:'obs', els:['wind_dir_1000','wind_dir_0244'], modes:ALL_MODES, scale:{ramp:'romaO', domain:[0,360], endLabels:['N','N'], midLabel:'S'}, fmt:'compass' },

    // Precipitation
    { key:'ppt',          label:'Precipitation',   group:'Precipitation', col:'Precipitation',   source:'obs', els:['ppt'], agg:'sum', modes:ALL_MODES, scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_max_rate', label:'Max Precip Rate', group:'Precipitation', col:'Max Precip Rate', source:'obs', els:['ppt_max_rate'], modes:ALL_MODES, scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'snow_depth',   label:'Snow Depth',      group:'Precipitation', col:'Snow Depth',      source:'obs', els:['snow_depth'], modes:ALL_MODES, scale:{ramp:'Blues'}, fmt:'p2', siKey:'snow_depth' },
    // Precip accumulation windows (latest only — /derived/ppt/)
    { key:'ppt_midnight', label:'Precip Since Midnight',  group:'Precipitation', col:'Precipitation Since Midnight', source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_24h',      label:'24-hour Precipitation',  group:'Precipitation', col:'24-hour Precipitation',  source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_2',        label:'2-day Precipitation',    group:'Precipitation', col:'2-day Precipitation',    source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_7',        label:'7-day Precipitation',    group:'Precipitation', col:'7-day Precipitation',    source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_14',       label:'14-day Precipitation',   group:'Precipitation', col:'14-day Precipitation',   source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_30',       label:'30-day Precipitation',   group:'Precipitation', col:'30-day Precipitation',   source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_60',       label:'60-day Precipitation',   group:'Precipitation', col:'60-day Precipitation',   source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_90',       label:'90-day Precipitation',   group:'Precipitation', col:'90-day Precipitation',   source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_180',      label:'180-day Precipitation',  group:'Precipitation', col:'180-day Precipitation',  source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },
    { key:'ppt_ytd',      label:'Year-to-Date Precipitation', group:'Precipitation', col:'Year to Date Precipitation', source:'pptwin', modes:['latest'], scale:{ramp:'BrBG'}, fmt:'p2' },

    // Soil moisture
    { key:'soil_vwc_shallow', label:'Soil VWC — Shallow (0–4 in)',   group:'Soil Moisture', col:'Shallow Soil VWC',   source:'obs', els:['soil_vwc_0005','soil_vwc_0010'], band:true, modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'soil_vwc_mid',     label:'Soil VWC — Mid (8–20 in)',      group:'Soil Moisture', col:'Mid-depth Soil VWC', source:'obs', els:['soil_vwc_0020','soil_vwc_0050'], band:true, modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'soil_vwc_deep',    label:'Soil VWC — Deep (28–40 in)',    group:'Soil Moisture', col:'Deep Soil VWC',      source:'obs', els:['soil_vwc_0070','soil_vwc_0076','soil_vwc_0091','soil_vwc_0100'], band:true, modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'sat_shallow', label:'Percent Saturation — Shallow', group:'Soil Moisture', col:'Shallow Percent Saturation',   source:'soil', calc:'sat', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'sat_mid',     label:'Percent Saturation — Mid',     group:'Soil Moisture', col:'Mid Depth Percent Saturation', source:'soil', calc:'sat', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'sat_deep',    label:'Percent Saturation — Deep',    group:'Soil Moisture', col:'Deep Percent Saturation',      source:'soil', calc:'sat', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'swp_shallow', label:'Soil Water Potential — Shallow', group:'Soil Moisture', col:'Shallow Soil Water Potential',   source:'soil', calc:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', rev:true, log:true}, fmt:'p2' },
    { key:'swp_mid',     label:'Soil Water Potential — Mid',     group:'Soil Moisture', col:'Mid Depth Soil Water Potential', source:'soil', calc:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', rev:true, log:true}, fmt:'p2' },
    { key:'swp_deep',    label:'Soil Water Potential — Deep',    group:'Soil Moisture', col:'Deep Soil Water Potential',      source:'soil', calc:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', rev:true, log:true}, fmt:'p2' },
    // Soil moisture change (latest only — /derived/change/, deferred fetch)
    { key:'dvwc_shallow_1',  label:'Δ VWC 1-day — Shallow',  group:'Soil Moisture', col:'1-day',  depth:'shallow', source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_mid_1',      label:'Δ VWC 1-day — Mid',      group:'Soil Moisture', col:'1-day',  depth:'mid',     source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_deep_1',     label:'Δ VWC 1-day — Deep',     group:'Soil Moisture', col:'1-day',  depth:'deep',    source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_shallow_7',  label:'Δ VWC 7-day — Shallow',  group:'Soil Moisture', col:'7-day',  depth:'shallow', source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_mid_7',      label:'Δ VWC 7-day — Mid',      group:'Soil Moisture', col:'7-day',  depth:'mid',     source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_deep_7',     label:'Δ VWC 7-day — Deep',     group:'Soil Moisture', col:'7-day',  depth:'deep',    source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_shallow_14', label:'Δ VWC 14-day — Shallow', group:'Soil Moisture', col:'14-day', depth:'shallow', source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_mid_14',     label:'Δ VWC 14-day — Mid',     group:'Soil Moisture', col:'14-day', depth:'mid',     source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_deep_14',    label:'Δ VWC 14-day — Deep',    group:'Soil Moisture', col:'14-day', depth:'deep',    source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_shallow_30', label:'Δ VWC 30-day — Shallow', group:'Soil Moisture', col:'30-day', depth:'shallow', source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_mid_30',     label:'Δ VWC 30-day — Mid',     group:'Soil Moisture', col:'30-day', depth:'mid',     source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },
    { key:'dvwc_deep_30',    label:'Δ VWC 30-day — Deep',    group:'Soil Moisture', col:'30-day', depth:'deep',    source:'change', modes:['latest'], scale:{ramp:'BrBG', mid:{'%':0}}, fmt:'p1' },

    // Soil temperature
    { key:'soil_temp_shallow', label:'Soil Temperature — Shallow', group:'Soil Temperature', col:'Shallow Soil Temperature',   source:'obs', els:['soil_temp_0005','soil_temp_0010'], band:true, modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'soil_temp_mid',     label:'Soil Temperature — Mid',     group:'Soil Temperature', col:'Mid-depth Soil Temperature', source:'obs', els:['soil_temp_0020','soil_temp_0050'], band:true, modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'soil_temp_deep',    label:'Soil Temperature — Deep',    group:'Soil Temperature', col:'Deep Soil Temperature',      source:'obs', els:['soil_temp_0070','soil_temp_0076','soil_temp_0091','soil_temp_0100'], band:true, modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'frost_depth',       label:'Frost Depth',                group:'Soil Temperature', col:'Frost Depth', source:'derived', element:'frost_depth', modes:ALL_MODES, scale:{ramp:'BrBG', rev:true}, fmt:'p1' },

    // Soil EC
    { key:'soil_ec_shallow', label:'Bulk EC — Shallow', group:'Soil Electrical Conductivity', col:'Shallow Bulk EC',   source:'obs', els:['soil_ec_blk_0005','soil_ec_blk_0010'], band:true, modes:ALL_MODES, scale:{ramp:'PuRd'}, fmt:'p2' },
    { key:'soil_ec_mid',     label:'Bulk EC — Mid',     group:'Soil Electrical Conductivity', col:'Mid-depth Bulk EC', source:'obs', els:['soil_ec_blk_0020','soil_ec_blk_0050'], band:true, modes:ALL_MODES, scale:{ramp:'PuRd'}, fmt:'p2' },
    { key:'soil_ec_deep',    label:'Bulk EC — Deep',    group:'Soil Electrical Conductivity', col:'Deep Bulk EC',      source:'obs', els:['soil_ec_blk_0070','soil_ec_blk_0076','soil_ec_blk_0091','soil_ec_blk_0100'], band:true, modes:ALL_MODES, scale:{ramp:'PuRd'}, fmt:'p2' },

    // ET & agriculture (derived; hourly/daily only)
    { key:'eto', label:'Reference ET (grass)', group:'ET & Agriculture', col:'Reference ET', source:'derived', element:'eto', modes:['hourly','daily'], scale:{ramp:'YlOrRd'}, fmt:'p2' },
    { key:'gdd', label:'Growing Degree Days',  group:'ET & Agriculture', col:'GDDs',         source:'derived', element:'gdd', modes:['daily'],           scale:{ramp:'YlOrRd'}, fmt:'p1' },

    // Groundwater
    { key:'well_lvl', label:'Well Water Level',       group:'Groundwater', col:'Well Water Level',       source:'extra', els:['well_lvl'], modes:ALL_MODES, scale:{ramp:'YlGnBu'}, fmt:'p1' },
    { key:'well_tmp', label:'Well Water Temperature', group:'Groundwater', col:'Well Water Temperature', source:'extra', els:['well_tmp'], modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'well_eco', label:'Well EC',                group:'Groundwater', col:'Well EC',                source:'extra', els:['well_eco'], modes:ALL_MODES, scale:{ramp:'PuRd'}, fmt:'p2' },
  ];
  const REGISTRY_BY_KEY = new Map(REGISTRY.map(e => [e.key, e]));

  // Short labels for the variable picker when it is the compact bar's hot
  // control (a portrait phone, 0.21.0): the bar also carries the badge, the
  // search button and ☰, which leaves the picker ~180px at 390px and ~110px
  // at 320px. The option group ("Soil Moisture", …) carries the rest of the
  // meaning in the open list. Anything not listed keeps its full label.
  const SHORT_LABELS = {
    air_temp: 'Air Temp', rh: 'Humidity', sol_rad: 'Solar Rad', vpd: 'VPD',
    feels_like: 'Feels Like', wet_bulb: 'Wet Bulb', cci: 'CCI', bp: 'Pressure',
    wind_dir: 'Wind Dir', ppt_max_rate: 'Max Rate',
    ppt_midnight: 'Precip Today', ppt_24h: '24-h Precip', ppt_2: '2-day Precip',
    ppt_7: '7-day Precip', ppt_14: '14-day Precip', ppt_30: '30-day Precip',
    ppt_60: '60-day Precip', ppt_90: '90-day Precip', ppt_180: '180-day Precip',
    ppt_ytd: 'YTD Precip',
    soil_vwc_shallow: 'VWC Shallow', soil_vwc_mid: 'VWC Mid', soil_vwc_deep: 'VWC Deep',
    sat_shallow: 'Sat. Shallow', sat_mid: 'Sat. Mid', sat_deep: 'Sat. Deep',
    swp_shallow: 'SWP Shallow', swp_mid: 'SWP Mid', swp_deep: 'SWP Deep',
    dvwc_shallow_1: 'ΔVWC 1d Shal.', dvwc_mid_1: 'ΔVWC 1d Mid', dvwc_deep_1: 'ΔVWC 1d Deep',
    dvwc_shallow_7: 'ΔVWC 7d Shal.', dvwc_mid_7: 'ΔVWC 7d Mid', dvwc_deep_7: 'ΔVWC 7d Deep',
    dvwc_shallow_14: 'ΔVWC 14d Shal.', dvwc_mid_14: 'ΔVWC 14d Mid', dvwc_deep_14: 'ΔVWC 14d Deep',
    dvwc_shallow_30: 'ΔVWC 30d Shal.', dvwc_mid_30: 'ΔVWC 30d Mid', dvwc_deep_30: 'ΔVWC 30d Deep',
    soil_temp_shallow: 'Soil T Shallow', soil_temp_mid: 'Soil T Mid', soil_temp_deep: 'Soil T Deep',
    soil_ec_shallow: 'EC Shallow', soil_ec_mid: 'EC Mid', soil_ec_deep: 'EC Deep',
    eto: 'Ref. ET', gdd: 'GDD', well_lvl: 'Well Level', well_tmp: 'Well Temp',
  };

  // Plain-language one-liners shown under the legend title (DRAFT copy —
  // MCO scientists should refine). Depths appear in the labels already.
  const VARIABLE_DESC = {
    air_temp:   'Air temperature measured above ground.',
    rh:         'Moisture in the air, as a share of the most it could hold.',
    sol_rad:    'Incoming solar energy.',
    vpd:        'Drying power of the air — higher means faster water loss from plants and soil.',
    feels_like: 'Temperature as it feels, blending heat index and wind chill.',
    heat_index: 'How hot it feels once humidity is factored in.',
    wind_chill: 'How cold it feels once wind is factored in.',
    wet_bulb:   'Lowest temperature evaporation can cool to — a heat-stress indicator.',
    cci:        'Livestock weather-stress index combining temperature, humidity, wind, and sun.',
    bp:         'Air pressure reduced to sea level the way the National Weather Service does, so stations at different elevations compare.',
    wind_spd:   'Sustained wind speed.',
    windgust:   'Strongest brief burst of wind in the period.',
    wind_dir:   'Direction the wind blows from, as compass points (N, SSW, …).',
    ppt:          'Rain plus melted snow collected in the period.',
    ppt_max_rate: 'Heaviest precipitation rate observed in the period.',
    snow_depth:   'Depth of snow on the ground.',
    ppt_midnight: 'Precipitation accumulated since midnight.',
    ppt_24h:  'Precipitation accumulated over the last 24 hours.',
    ppt_2:    'Precipitation accumulated over the last 2 days.',
    ppt_7:    'Precipitation accumulated over the last 7 days.',
    ppt_14:   'Precipitation accumulated over the last 14 days.',
    ppt_30:   'Precipitation accumulated over the last 30 days.',
    ppt_60:   'Precipitation accumulated over the last 60 days.',
    ppt_90:   'Precipitation accumulated over the last 90 days.',
    ppt_180:  'Precipitation accumulated over the last 180 days.',
    ppt_ytd:  'Precipitation accumulated so far this calendar year.',
    soil_vwc_shallow: 'Share of the soil volume that is water.',
    soil_vwc_mid:     'Share of the soil volume that is water.',
    soil_vwc_deep:    'Share of the soil volume that is water.',
    sat_shallow: 'How full the soil pore space is, relative to its maximum.',
    sat_mid:     'How full the soil pore space is, relative to its maximum.',
    sat_deep:    'How full the soil pore space is, relative to its maximum.',
    swp_shallow: 'How tightly the soil holds its water — higher means drier, harder for roots.',
    swp_mid:     'How tightly the soil holds its water — higher means drier, harder for roots.',
    swp_deep:    'How tightly the soil holds its water — higher means drier, harder for roots.',
    dvwc_shallow_1:  'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_mid_1:      'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_deep_1:     'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_shallow_7:  'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_mid_7:      'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_deep_7:     'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_shallow_14: 'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_mid_14:     'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_deep_14:    'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_shallow_30: 'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_mid_30:     'Change in soil water over the window — positive is wetting, negative drying.',
    dvwc_deep_30:    'Change in soil water over the window — positive is wetting, negative drying.',
    soil_temp_shallow: 'Soil temperature at depth.',
    soil_temp_mid:     'Soil temperature at depth.',
    soil_temp_deep:    'Soil temperature at depth.',
    frost_depth: 'Estimated depth of frozen soil.',
    soil_ec_shallow: 'Soil electrical conductivity — tracks salinity and moisture.',
    soil_ec_mid:     'Soil electrical conductivity — tracks salinity and moisture.',
    soil_ec_deep:    'Soil electrical conductivity — tracks salinity and moisture.',
    eto: 'Water a well-watered grass surface would lose to the air — an irrigation baseline.',
    gdd: 'Accumulated warmth above a crop base temperature — tracks crop development.',
    well_lvl: 'Water level in the monitoring well.',
    well_tmp: 'Groundwater temperature in the monitoring well.',
    well_eco: 'Electrical conductivity of well water — tracks dissolved minerals.',
  };
  const NETWORK_DESC = {
    HydroMet: 'HydroMet — core weather and water-supply monitoring stations',
    AgriMet:  'AgriMet — agriculture-focused stations with expanded soil sensing',
  };
  const GROUP_ORDER = ['Atmosphere', 'Wind', 'Precipitation', 'Soil Moisture',
                       'Soil Temperature', 'Soil Electrical Conductivity',
                       'ET & Agriculture', 'Groundwater'];
  // Elements bundled into the single 'extra' fetch
  const EXTRA_ELEMENTS = ['well_lvl', 'well_tmp', 'well_eco'];



  // ── Viewport class ────────────────────────────────────────────────────────
  // MCO.viewport owns this now, including the .is-compact / .is-touch stamping
  // on <html>. Its query is character-for-character the one this file used —
  // "compact" is a viewport where a ~320px anchored popup can't be shown whole
  // inside the map container: narrow phones AND short/landscape ones. Layout
  // itself stays in real @media rules, so there is no flash of the desktop
  // layout before this deferred module runs; these flags only drive the choices
  // JS has to make (sheet vs. anchored popup, the legend default).
  //
  // Adopting the kit's copy is the point: this file previously carried a
  // "KEEP THE QUERY IN SYNC" comment, and a duplicated breakpoint is exactly
  // the thing that drifts. The kit's mco-theme.css @media and MCO.viewport are
  // now the single pair to keep aligned, for every consumer at once.
  // Return value differs from the old local helper: the kit hands back an
  // unsubscribe function rather than the callback. Nothing here used either.
  const onViewportChange = (fn) => MCO.viewport.onChange(fn);

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const refreshStampEl = document.getElementById('refresh-stamp');
  const subnetFiltersEl= document.getElementById('subnet-filters');
  const legendTitleEl  = document.getElementById('legend-title');
  const legendGradientEl = document.getElementById('legend-gradient');
  const legendGradientBtn = document.getElementById('legend-gradient-btn');
  const legendPinBtn   = document.getElementById('legend-pin-btn');
  const legendScaleLabelsEl = document.getElementById('legend-scale-labels');
  const legendDescEl   = document.getElementById('legend-desc');
  const legendRowsEl   = document.getElementById('legend-rows');
  const legendOverlaysEl = document.getElementById('legend-overlays');
  const legendMetaEl   = document.getElementById('legend-meta');
  const searchInput    = document.getElementById('search-input');
  const searchDropdown = document.getElementById('search-dropdown');
  const infoModal      = document.getElementById('info-modal');
  const variableSelect = document.getElementById('variable-select');
  const aggSelect      = document.getElementById('agg-select');
  const aggGroup       = document.getElementById('agg-group');
  const dateGroup      = document.getElementById('date-group');
  const hourGroup      = document.getElementById('hour-group');
  const dateInput      = document.getElementById('date-input');
  const hourReadout    = document.getElementById('hour-readout');
  const emptyStateEl   = document.getElementById('empty-state');
  const navbarEl       = document.getElementById('navbar');
  const sheetEl        = document.getElementById('station-sheet');
  const sheetBodyEl    = document.getElementById('sheet-body');
  const sheetTitleEl   = document.getElementById('sheet-title');
  let _sheetOpen = false;
  // The navbar's height is --chrome-h, which the kit sheet docks under
  // (MCO.metrics, a ResizeObserver; the rail's CSS pins it to 0 itself).
  MCO.metrics.observe('--chrome-h', navbarEl);


  // Announcements go through MCO.announce (kit 0.8.0): the page's one polite
  // region, present from load, cleared then set so a repeat is re-read, and
  // de-duplicated within 500 ms.

  // ── Loading indicator (bar at the top of the map; the navbar stamp is
  //    display:none on phones, so this is the only loading cue there) ───────
  // The bar is the kit's MCO.loading (0.9.0): aria-busy on the map frame, a
  // .mco-progress sweep that waits 300 ms so a fast load never flashes it, and
  // one "Still loading…" announcement past 8 s. Started right away: the first
  // paint should already say something is coming (the module still has to
  // wait for MapLibre). The visible batch note below is this app's own.
  const mapLoading    = MCO.loading(document.getElementById('main'), { label: 'Loading station data' });
  const loadingNoteEl = document.getElementById('loading-note');
  let _loading = false;
  function showLoading() { _loading = true; mapLoading.start(); }
  function hideLoading() {
    _loading = false;
    mapLoading.done();
    loadingNoteEl.hidden = true;
    loadingNoteEl.textContent = '';
  }
  showLoading();
  function setLoadingNote(text) {
    // Only narrate long fetches that the user is actually waiting on.
    if (!_loading) return;
    loadingNoteEl.textContent = text;
    loadingNoteEl.hidden = !text;
  }

  // escapeHTML and escapeRe are both the kit's (MCO.escapeHTML / MCO.escapeRe).

  // ── Mountain-time helpers ────────────────────────────────────────────────
  // Every MT date/time helper below is the kit's now. They were byte-equivalent
  // here with ONE exception that matters: this file's shiftDate ended in
  // `toISOString().slice(0, 10)`, which re-projects the noon anchor to UTC. The
  // date stepper therefore did NOTHING at UTC+13/+14 and skipped two days at
  // UTC-12 — reproduced before this migration, correct in Mountain Time, which
  // is why it went unnoticed. lastCompleteHourMT calls shiftDate and inherited
  // it. The kit fixed this in v0.4.0; adopting the helpers fixes it here.
  // ── URL state ────────────────────────────────────────────────────────────
  // Read once at boot. getLower / splitTokens are the kit's — this file carried
  // byte-identical copies of both.
  const urlParams = MCO.urlParams();
  const getLower = (key) => MCO.getParamLower(key, urlParams);
  const splitTokens = MCO.splitTokens;

  const KNOWN_NETWORKS = ['HydroMet', 'AgriMet'];
  const networkByLowerName = new Map(KNOWN_NETWORKS.map(n => [n.toLowerCase(), n]));

  let activeMode = (() => {
    const u = getLower('mode');
    return (u === 'hourly' || u === 'daily') ? u : 'latest';
  })();

  // Retired variable keys still in old links → their replacement.
  const VAR_ALIASES = { slp: 'bp' };
  let activeVar = (() => {
    const raw = getLower('var');
    const u = VAR_ALIASES[raw] || raw;
    return (u && REGISTRY_BY_KEY.has(u)) ? u : 'air_temp';
  })();
  // A deep-linked variable that doesn't exist in the deep-linked mode has no
  // picker entry there — fall back rather than showing a blank select.
  if (!REGISTRY_BY_KEY.get(activeVar).modes.includes(activeMode)) activeVar = 'air_temp';

  // Custom color scale — { min?, mid?, max?, ramp?, rev? }, applied to the
  // CURRENT variable only (cleared on variable/units change). The domain is
  // locked iff min & max are set; mid present only when explicitly chosen
  // (absent = inherit the variable's semantic pivot). From ?scale=min,mid|-,max
  // and ?ramp=Name[-r]; both validated like every other URL param.
  let scaleOverride = (() => {
    let o = null;
    const raw = urlParams.get('scale');
    if (raw) {
      const parts = raw.split(',');
      if (parts.length === 3) {
        const num = (s) => s === '-' ? undefined : parseFloat(s);
        const min = num(parts[0]), mid = num(parts[1]), max = num(parts[2]);
        const okNum = (v) => v === undefined || Number.isFinite(v);
        const valid = okNum(min) && okNum(mid) && okNum(max) &&
          (min === undefined) === (max === undefined) &&           // both or neither
          (min === undefined || min < max) &&
          (mid === undefined ||
            ((min === undefined || mid > min) && (max === undefined || mid < max)));
        if (valid && (min !== undefined || mid !== undefined)) {
          o = {};
          if (min !== undefined) { o.min = min; o.max = max; }
          if (mid !== undefined) o.mid = mid;
        }
      }
    }
    const rampRaw = urlParams.get('ramp');
    if (rampRaw) {
      const rev = rampRaw.endsWith('-r');
      let name = rev ? rampRaw.slice(0, -2) : rampRaw;
      if (MCO.palette.isBanned(name)) {
        name = 'RdBu';
        MCO.showToast('Spectral isn’t colorblind-safe, so this link opens on RdBu');
      }
      if (RAMPS[name]) {
        o = o || {};
        o.ramp = name;
        o.rev = rev;
      }
    }
    return o;
  })();
  const scaleLocked = () => !!(scaleOverride && Number.isFinite(scaleOverride.min));

  let activeUnits = (() => {
    const u = getLower('units');
    if (u === 'us' || u === 'si') return u;
    const saved = MCO.lsGet('mco-explorer-units');
    return (saved === 'si') ? 'si' : 'us';
  })();

  // null → resolve to the variable's own default aggregation (avg for most,
  // sum for precipitation) in syncAggUI, so the selector always shows a
  // concrete function instead of an unspecified "Default".
  let activeAgg = (() => {
    const u = getLower('agg');
    return (u && ['min','max','avg','sum','stddev'].includes(u)) ? u : null;
  })();

  let activeDate = (() => {
    const u = urlParams.get('date');
    if (u && /^\d{4}-\d{2}-\d{2}$/.test(u)) return u;
    return activeMode === 'hourly' ? MCO.lastCompleteHourMT().date : MCO.todayMT();
  })();

  let activeHour = (() => {
    const u = parseInt(urlParams.get('hour'), 10);
    if (Number.isInteger(u) && u >= 0 && u <= 23) return u;
    return MCO.lastCompleteHourMT().hour;
  })();

  let activeNetworks = (() => {
    const tokens = splitTokens(urlParams.get('net'));
    if (tokens !== null) {
      return new Set(tokens.map(t => networkByLowerName.get(t)).filter(Boolean));
    }
    try {
      const saved = JSON.parse(MCO.lsGet('mco-explorer-networks') || 'null');
      // localStorage is shared across every mt-climate-office.github.io app —
      // validate members the same way as ?net= rather than trusting them.
      if (Array.isArray(saved)) {
        return new Set(saved.map(n => networkByLowerName.get(String(n).toLowerCase()))
                            .filter(Boolean));
      }
    } catch {}
    return new Set(KNOWN_NETWORKS);
  })();
  if (activeNetworks.size === 0) activeNetworks = new Set(KNOWN_NETWORKS);

  const LABELS_DEFAULT = true;
  let labelsOn = (() => {
    const u = getLower('labels');
    if (u === 'on' || u === 'off') return u === 'on';
    const saved = MCO.lsGet('mco-explorer-labels');
    if (saved === 'on' || saved === 'off') return saved === 'on';
    return LABELS_DEFAULT;
  })();

  let radarOn = getLower('radar') === 'on';
  let radarWanted = radarOn;   // user intent — restored when returning to Latest

  let nodataShown = getLower('nodata') !== 'hide';
  let staleShown  = getLower('stale') === 'show';

  let overlayCounties   = getLower('counties') === 'on';
  let overlayWatersheds = getLower('watersheds') === 'on';

  // Headless export hook: ?export=light|dark forces the theme before the map
  // is built, then boot() auto-triggers a PNG export (photo-explorer pattern).
  // Read here with the rest of the URL state rather than down in the keyboard
  // section: writeUrl() emits it, and writeUrl can run during init, which put
  // the old late `const` in its temporal dead zone.
  const kbdShortcuts = getLower('kbd') !== 'off';

  const _exportParam = getLower('export');
  if (_exportParam === 'light' || _exportParam === 'dark') {
    document.documentElement.dataset.theme = _exportParam;
  }

  const _initLng    = parseFloat(urlParams.get('lng'));
  const _initLat    = parseFloat(urlParams.get('lat'));
  const _initZoom   = parseFloat(urlParams.get('zoom'));
  const _hasInitPos = Number.isFinite(_initLng) && Number.isFinite(_initLat) && Number.isFinite(_initZoom);
  const _initStation = getLower('station');
  let _selectedStation = _initStation;

  // ── Theme ────────────────────────────────────────────────────────────────
  // The basemap URL is the kit's MCO.map.cartoStyleUrl(). Its `=== 'dark'` test
  // is why the local copy had to go: high-contrast is a dark-family theme and
  // would have been dropped onto the light basemap.
  function dotStrokeColor() {
    // --dot-stroke is a kit token precisely because every MCO map needs a
    // marker outline that survives all three themes.
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--dot-stroke').trim() || (isDarkTheme() ? '#ffffff' : '#2a2a3a');
  }
  function mutedStrokeColor() {
    // Hollow stale/no-data dots are ONLY a stroke — it must clear 3:1
    // against the basemap in every theme (WCAG 1.4.11).
    return isDarkTheme() ? '#7a8aa0' : '#6e7787';
  }
  // High-contrast counts as dark for palette purposes, so this tests
  // `!== 'light'` rather than `=== 'dark'`.
  function isDarkTheme() { return MCO.getTheme() !== 'light'; }
  // A 3-state toggle (kit 0.10.0, cycle: true): dark → light → high contrast,
  // so high contrast is reachable from the page and not only from ?theme=. The
  // icon shown and the aria-label name the theme a press switches TO. The
  // button only sets the theme; everything that depends on it listens for the
  // kit's mco:themechange (MCO.setTheme fires it and persists mco-theme), so a
  // theme set from anywhere else re-styles the map the same way.
  const themeToggle = MCO.initThemeToggle({
    button: document.getElementById('btn-theme'),
    iconSun: document.getElementById('icon-sun'),
    iconMoon: document.getElementById('icon-moon'),
    iconContrast: document.getElementById('icon-contrast'),
    cycle: true,
  });
  document.addEventListener('mco:themechange', () => {
    themeToggle.sync();
    // The layers come back from the style.load handler beside the map.
    map.setStyle(MCO.map.cartoStyleUrl());
    writeUrl();
  });

  // ── Info modal ───────────────────────────────────────────────────────────
  // The kit's MCO.initInfoModal (0.21.0): focus on the close button, focus
  // back to the opener, and the first-visit intro once per key. A deep link is
  // an explicit request to see something specific, so the intro never covers
  // it (a shared ?station= link used to land on this modal). urlParams was
  // snapshotted at boot, so writeUrl()'s rewrites can't affect the test.
  const btnInfo = document.getElementById('btn-info');
  const DEEP_LINK_PARAMS = ['station', 'var', 'mode', 'date', 'hour', 'scale',
                            'ramp', 'agg', 'net', 'lng', 'lat', 'zoom', 'export'];
  const infoDialog = MCO.initInfoModal({
    dialog: infoModal,
    intro: { key: 'mco-explorer-seen-intro', skip: () => DEEP_LINK_PARAMS.some(k => urlParams.has(k)) },
  });
  // The ? button sits in the compact drawer on a phone: close the drawer first
  // (focus back to ☰, which the dialog then returns to), or the drawer's inert
  // page would include the dialog itself.
  btnInfo.addEventListener('click', () => { closeNavDrawer(); infoDialog.open(); });
  document.getElementById('info-credit').textContent = MCO.credit({ source: 'Montana Mesonet' });

  // ── Share ────────────────────────────────────────────────────────────────
  document.getElementById('btn-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareURL());
      MCO.showToast('Link copied to clipboard');
    } catch {
      MCO.showToast('Could not copy — copy the URL from the address bar');
    }
  });

  // ── Color scale engine ───────────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Sample a ramp at t ∈ [0,1] by piecewise-linear sRGB interpolation.
  function sampleRamp(stops, t) {
    const n = stops.length - 1;
    const x = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.min(Math.floor(x), n - 1);
    const f = x - i;
    const a = hexToRgb(stops[i]);
    const b = hexToRgb(stops[i + 1]);
    const c = a.map((av, k) => Math.round(av + (b[k] - av) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // makeScale: value → CSS color. Domain [min,max] with optional semantic mid
  // mapped to t=0.5 (two linear segments, chroma.domain([min,mid,max]) style).
  // opts (all optional, from the user's scale override): ramp/rev replace the
  // spec's; mid is an explicit pivot (a number, or null for "no pivot").
  function makeScale(scaleSpec, unit, domainMin, domainMax, opts = {}) {
    const rampName = opts.ramp || scaleSpec.ramp;
    let stops = RAMPS[rampName] || RAMPS.YlGnBu;
    const rev = opts.rev !== undefined ? !!opts.rev : !!scaleSpec.rev;
    if (rev) stops = [...stops].reverse();

    // Resolve the pivot: user override wins over the semantic spec value.
    let pivot = null;
    if (opts.mid !== undefined) pivot = opts.mid;
    else if (scaleSpec.mid) {
      const m = scaleSpec.mid[unit];
      if (typeof m === 'number') pivot = m;
    }

    let mid = null;
    if (typeof pivot === 'number') {
      if (pivot > domainMin && pivot < domainMax) {
        mid = pivot;
      } else if (stops.length % 2 === 1) {
        // Pivot outside the domain: use only the matching half of the ramp so
        // the neutral center keeps its meaning — e.g. on an all-above-freezing
        // day temperatures render white→hot rather than stretching the full
        // blue-white-red ramp across one-sided data (which painted an 87 °F
        // daily max deep blue).
        const c = (stops.length - 1) / 2;
        stops = pivot <= domainMin ? stops.slice(c) : stops.slice(0, c + 1);
      }
    }
    const toT = (v) => {
      if (domainMax <= domainMin) return 0.5;
      if (mid == null) return (v - domainMin) / (domainMax - domainMin);
      return v <= mid
        ? 0.5 * (v - domainMin) / (mid - domainMin)
        : 0.5 + 0.5 * (v - mid) / (domainMax - mid);
    };
    const fn = (v) => sampleRamp(stops, toT(v));
    fn.domain = [domainMin, domainMax];
    fn.mid = mid;
    fn.stops = stops;
    fn.endLabels = scaleSpec.endLabels || null;
    fn.midLabel = scaleSpec.midLabel || null;
    return fn;
  }
  // Robust domain: 2nd–98th percentile (plain extent when n < 12).
  function robustDomain(values) {
    const v = [...values].sort((a, b) => a - b);
    if (v.length === 0) return [0, 1];
    if (v.length < 12) return [v[0], v[v.length - 1]];
    const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    return [q(0.02), q(0.98)];
  }

  // ── Value formatting ─────────────────────────────────────────────────────
  const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                      'S','SSW','SW','WSW','W','WNW','NW','NNW'];
  function toCompass(deg) {
    return COMPASS_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  }
  function makeFormatter(entry, domain) {
    if (entry.fmt === 'compass') return toCompass;
    if (entry.fmt === 'p2') return (v) => v.toFixed(2);
    if (entry.fmt === 'p1') return (v) => v.toFixed(1);
    if (entry.fmt === 'p0') return (v) => String(Math.round(v));
    const range = Math.abs(domain[1] - domain[0]);
    return range > 5 ? (v) => String(Math.round(v)) : (v) => v.toFixed(1);
  }
  function fmtScaleLimit(v) {
    if (!Number.isFinite(v)) return '—';
    if (v !== 0 && Math.abs(v) < 0.01) return v.toPrecision(1);   // log-scale minima
    return Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : String(Math.round(v * 10) / 10);
  }

  // ── Fetch orchestration ──────────────────────────────────────────────────
  // Promise cache: key → Promise<rows>. Storing promises dedupes concurrent
  // requests. Latest-keyed entries are invalidated by the auto-refresh timer.
  const cache = new Map();
  let renderToken = 0;

  // MCO.fetchJSON is the kit's; it takes the timeout as an option rather than a
  // positional argument, hence the { timeoutMs } at each call below.
  // Network-wide daily aggregates can take 30–60 s on the production API
  // (cost scales with station count server-side), so give them extra headroom.
  const timeoutForMode = (mode) => mode === 'daily' ? 150_000 : 60_000;
  function cached(key, maker) {
    if (!cache.has(key)) {
      const p = maker().catch(err => { cache.delete(key); throw err; });
      cache.set(key, p);
    }
    return cache.get(key);
  }
  function invalidateLatest() {
    for (const key of [...cache.keys()]) {
      if (key.includes('|latest')) cache.delete(key);
    }
  }

  // Time window helpers for hourly/daily queries.
  function hourWindow(date, hour) {
    const start = `${date}T${MCO.pad2(hour)}:00:00`;
    const end = hour < 23 ? `${date}T${MCO.pad2(hour + 1)}:00:00` : `${MCO.shiftDate(date, 1)}T00:00:00`;
    return { start, end };
  }

  // timeKey identifies the temporal slice a fetch belongs to.
  function timeKeyFor(mode, date, hour) {
    if (mode === 'latest') return 'latest';
    if (mode === 'hourly') return `${date}T${MCO.pad2(hour)}`;
    return date;
  }

  // Source fetchers → arrays of wide rows [{station, datetime?, "<Name> [unit]": v, …}]
  // `els` is the active variable's element list. DAILY ONLY uses it — see below.
  function fetchObs(mode, date, hour, units, els) {
    const tk = timeKeyFor(mode, date, hour);
    // Daily is fetched per-variable, so the element set is part of the key.
    const elsKey = mode === 'daily' && els && els.length ? els.join(',') : 'all';
    return cached(`obs|${units}|${tk}|${elsKey}`, () => {
      let url;
      if (mode === 'latest') {
        url = `${API}/observations/grouped/?type=json&latest=true&units=${units}`;
      } else if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/observations/grouped/?type=json&hour=true&start_time=${w.start}&end_time=${w.end}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      } else {
        // Daily had never loaded at all: this call asked for EVERY element over
        // an explicit range covering today, and either of those alone hangs the
        // endpoint (~90 s, then net::ERR_FAILED). Probed 2026-08-16 —
        // measurements in mco-web-style's CONSUMERS.md.
        //
        // Two changes, both required:
        //   1. narrow to the active variable's elements
        //   2. omit start_time/end_time for today — the endpoint already
        //      defaults to today, and an explicit range covering it is the
        //      trigger. A PAST day still needs (and tolerates) a range.
        //
        // Deliberately still /observations/grouped/, not /observations/daily/.
        // "Grouped" is what merges multi-height sensors into the single column
        // the registry resolves against: grouped gives `Wind Speed [mi/h]`,
        // while /daily/ gives `Wind Speed @ 10 m` AND `@ 8 ft`. Swapping
        // endpoints would silently break every multi-height variable.
        const q = ['type=json', 'day=true', `units=${units}`, 'rm_na=true',
                   `tz=${encodeURIComponent(TZ)}`];
        if (els && els.length) {
          q.push(...els.map(e => `elements=${encodeURIComponent(e)}`));
        }
        if (date !== MCO.todayMT()) {
          q.push(`start_time=${date}`, `end_time=${MCO.shiftDate(date, 1)}`);
        }
        url = `${API}/observations/grouped/?${q.join('&')}`;
      }
      return MCO.fetchJSON(url, { timeoutMs: timeoutForMode(mode) });
    });
  }

  function fetchDerived(element, mode, date, hour, units) {
    const tk = timeKeyFor(mode, date, hour);
    return cached(`derived:${element}|${units}|${tk}`, () => {
      let url;
      if (mode === 'latest') {
        url = `${API}/derived/?type=json&elements=${element}&grouped=true&wide=true&units=${units}`;
      } else if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/derived/hourly/?type=json&elements=${element}&grouped=true&wide=true&start_time=${w.start}&end_time=${w.end}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      } else {
        url = `${API}/derived/daily/?type=json&elements=${element}&grouped=true&wide=true&start_time=${date}&end_time=${MCO.shiftDate(date, 1)}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return MCO.fetchJSON(url, { timeoutMs: timeoutForMode(mode) });
    });
  }

  function fetchPptWindows(units) {
    // /derived/ppt/ has no units param — U.S. units always; converted client-side.
    return cached(`pptwin|${units}|latest`, () => MCO.fetchJSON(`${API}/derived/ppt/?type=json&wide=true`));
  }

  function fetchExtra(mode, date, hour, units) {
    const tk = timeKeyFor(mode, date, hour);
    const els = EXTRA_ELEMENTS.map(e => `elements=${e}`).join('&');
    return cached(`extra|${units}|${tk}`, () => {
      let url;
      if (mode === 'latest') {
        url = `${API}/latest/?type=json&${els}&units=${units}`;
      } else if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/observations/hourly/?type=json&${els}&wide=true&start_time=${w.start}&end_time=${w.end}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      } else {
        url = `${API}/observations/daily/?type=json&${els}&wide=true&start_time=${date}&end_time=${MCO.shiftDate(date, 1)}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return MCO.fetchJSON(url, { timeoutMs: timeoutForMode(mode) });
    });
  }

  // /derived/change/ is slow and 504s when queried for the whole network at
  // once, so fetch in station batches and merge. Latest mode only.
  function fetchChange() {
    return cached('change|any|latest', async () => {
      const ids = stations.map(s => s.station);
      const merged = [];
      const BATCH = 40;
      const nBatches = Math.ceil(ids.length / BATCH);
      for (let i = 0; i < ids.length; i += BATCH) {
        setLoadingNote(`Loading soil-moisture change… batch ${i / BATCH + 1} of ${nBatches}`);
        const batch = ids.slice(i, i + BATCH).map(encodeURIComponent).join(',');
        const url = `${API}/derived/change/?type=json&difference=1,7,14,30&stations=${batch}`;
        const rows = await MCO.fetchJSON(url, { timeoutMs: 45_000 });
        merged.push(...rows);
      }
      setLoadingNote('');
      return merged;
    });
  }

  // Percent saturation and soil water potential: the API dropped both when the
  // lab soil calibrations moved out of it (mesonet-db-rds 7ac1d88), so they
  // are computed here the way mesonet-dashboard does (web/src/core/ag/compute/
  // soil.ts): per-depth VWC from the raw-element endpoints, plus mesonet-soils'
  // fits from data2. Percent saturation = clip(VWC / porosity, 0–100 %); SWP =
  // Fredlund–Xing inverse of VWC clipped to that station+depth's lab range.
  // Depths then average into the shallow/mid/deep bands, as the API's grouped
  // output did, under the old column names so extractValues is unchanged.
  const SOIL_PARAMS_URL = 'https://data2.climate.umt.edu/mesonet/soils/soil_params.json';
  const SOIL_VWC_ELS = ['soil_vwc_0005','soil_vwc_0010','soil_vwc_0020','soil_vwc_0050',
                        'soil_vwc_0070','soil_vwc_0076','soil_vwc_0091','soil_vwc_0100'];
  const SOIL_BAND_COL = {
    sat: { shallow: 'Shallow Percent Saturation', mid: 'Mid Depth Percent Saturation', deep: 'Deep Percent Saturation' },
    swp: { shallow: 'Shallow Soil Water Potential', mid: 'Mid Depth Soil Water Potential', deep: 'Deep Soil Water Potential' },
  };
  // Band edges in cm, as the API's reclassify_soil_by_depth.
  const soilBand = (cm) => cm <= 10 ? 'shallow' : cm <= 50 ? 'mid' : 'deep';

  // → Map("station|depthCm" → {fx:{r,s,n,m,h}|null, por, lo, hi})
  function fetchSoilParams() {
    return cached('soilparams', async () => {
      const j = await MCO.fetchJSON(SOIL_PARAMS_URL, { timeoutMs: 15_000 });
      const ci = Object.fromEntries(j.columns.map((c, i) => [c, i]));
      const obj = (keys, vals) => vals ? Object.fromEntries(keys.map((k, i) => [k, vals[i]])) : null;
      const out = new Map();
      for (const r of j.rows) {
        out.set(`${r[ci.station]}|${r[ci.depthCm]}`, {
          fx:  obj(j.fxKeys, r[ci.fx]),
          por: r[ci.porosityPct],
          lo:  r[ci.labVwcMinPct] ?? -Infinity,
          hi:  r[ci.labVwcMaxPct] ?? Infinity,
        });
      }
      return out;
    });
  }

  function fetchSoilVwc(mode, date, hour) {
    const tk = timeKeyFor(mode, date, hour);
    const els = SOIL_VWC_ELS.map(e => `elements=${e}`).join('&');
    return cached(`soilvwc|${tk}`, () => {
      let url;
      if (mode === 'latest') {
        url = `${API}/latest/?type=json&${els}&units=us`;
      } else if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/observations/hourly/?type=json&${els}&wide=true&start_time=${w.start}&end_time=${w.end}&units=us&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      } else {
        url = `${API}/observations/daily/?type=json&${els}&wide=true&start_time=${date}&end_time=${MCO.shiftDate(date, 1)}&units=us&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return MCO.fetchJSON(url, { timeoutMs: timeoutForMode(mode) });
    });
  }

  // Fredlund–Xing inverse, θ (fraction) → ψ (kPa); non-finite → null.
  function fxInverse(theta, p) {
    const inner = Math.exp(((p.s - p.r) / (theta - p.r)) ** (1 / p.m)) - Math.E;
    const v = p.h * inner ** (1 / p.n);
    return Number.isFinite(v) ? v : null;
  }

  function fetchSoilDerived(entry, mode, date, hour, units) {
    const tk = timeKeyFor(mode, date, hour);
    return cached(`soil:${entry.calc}|${units}|${tk}`, async () => {
      const [rows, params] = await Promise.all([fetchSoilVwc(mode, date, hour), fetchSoilParams()]);
      const unit = entry.calc === 'sat' ? '%' : units === 'si' ? 'kPa' : 'bar';
      const cols = SOIL_BAND_COL[entry.calc];
      return rows.map(row => {
        const acc = { shallow: [], mid: [], deep: [] };
        for (const [k, vwc] of Object.entries(row)) {
          const m = k.match(/^Soil VWC @ -(\d+) cm/);
          if (!m || typeof vwc !== 'number' || !Number.isFinite(vwc)) continue;
          const cm = +m[1];
          const p = params.get(`${row.station}|${cm}`);
          if (!p) continue;
          let v = null;
          if (entry.calc === 'sat') {
            if (typeof p.por === 'number') v = Math.min(100, Math.max(0, vwc / p.por * 100));
          } else if (p.fx) {
            v = fxInverse(Math.min(p.hi, Math.max(p.lo, vwc)) / 100, p.fx);
            if (v != null && unit === 'bar') v /= 100;
          }
          if (v != null) acc[soilBand(cm)].push(v);
        }
        const out = { station: row.station, datetime: row.datetime };
        for (const b of ['shallow', 'mid', 'deep']) {
          if (acc[b].length) out[`${cols[b]} [${unit}]`] = acc[b].reduce((a, c) => a + c, 0) / acc[b].length;
        }
        return out;
      });
    });
  }

  // Aggregation fetches bypass the grouped route (it ignores agg_func) and
  // query /observations/hourly|daily per entry with its raw element ids.
  // The plain endpoints handle units correctly, so no SI fixups here.
  function fetchAggObs(entry, mode, date, hour, units, agg) {
    const tk = timeKeyFor(mode, date, hour);
    const els = entry.els.map(e => `elements=${e}`).join('&');
    return cached(`aggobs:${entry.key}|${units}|${tk}|${agg}`, () => {
      let url;
      if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/observations/hourly/?type=json&${els}&wide=true&start_time=${w.start}&end_time=${w.end}&units=${units}&rm_na=true&agg_func=${agg}&tz=${encodeURIComponent(TZ)}`;
      } else {
        url = `${API}/observations/daily/?type=json&${els}&wide=true&start_time=${date}&end_time=${MCO.shiftDate(date, 1)}&units=${units}&rm_na=true&agg_func=${agg}&tz=${encodeURIComponent(TZ)}`;
      }
      return MCO.fetchJSON(url, { timeoutMs: timeoutForMode(mode) });
    });
  }

  function aggSupported(entry) {
    return entry.source === 'obs' || entry.source === 'extra';
  }
  // The API default when agg_func is omitted: averaged, except precipitation
  // which is summed. Registry entries may override via `agg`.
  function defaultAggFor(entry) {
    return entry.agg || 'avg';
  }
  // Only a non-default choice needs the per-element agg fetch — the default
  // matches what the grouped endpoint already returns.
  function aggActive(entry) {
    return activeMode !== 'latest' && aggSupported(entry)
        && activeAgg != null && activeAgg !== defaultAggFor(entry);
  }

  function fetchRowsFor(entry, mode, date, hour, units) {
    if (aggActive(entry)) return fetchAggObs(entry, mode, date, hour, units, activeAgg);
    switch (entry.source) {
      case 'obs':     return fetchObs(mode, date, hour, units, entry.els);
      case 'derived': return fetchDerived(entry.element, mode, date, hour, units);
      case 'pptwin':  return fetchPptWindows(units);
      case 'extra':   return fetchExtra(mode, date, hour, units);
      case 'change':  return fetchChange();
      case 'soil':    return fetchSoilDerived(entry, mode, date, hour, units);
      default:        return Promise.reject(new Error(`Unknown source ${entry.source}`));
    }
  }

  // ── Column resolution & value extraction ─────────────────────────────────
  // Wide column names look like "Air Temperature [°F]",
  // "Shallow Soil VWC (0-4 in) [%]", or "Reference ET (a=0.23) [in]".
  // Match the registry `col` prefix, tolerating an optional "(...)" fragment,
  // and capture the unit.
  const _colResolveCache = new WeakMap();   // rows array → Map(col → {key, unit})
  function resolveColumn(rows, entry) {
    let m = _colResolveCache.get(rows);
    if (!m) { m = new Map(); _colResolveCache.set(rows, m); }
    if (m.has(entry.key)) return m.get(entry.key);
    const re = new RegExp(`^${MCO.escapeRe(entry.col)}(?:\\s*\\([^)]*\\))?\\s*\\[(.+)\\]$`);
    let found = null;
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (k === 'station' || k === 'datetime') continue;
        const match = k.match(re);
        if (match) { found = { key: k, unit: match[1] }; break; }
      }
      if (found) break;
    }
    m.set(entry.key, found);
    return found;
  }

  // Extract per-station values from rows for a registry entry, applying the
  // self-healing SI conversion when needed. Returns {byStation, unit, maxDt}.
  // byStation: Map(stationId → {v, dt}).
  function extractValues(rows, entry, units) {
    const byStation = new Map();
    let unit = null;
    let maxDt = null;

    if (entry.source === 'change') {
      // /derived/change rows: shape discovered at runtime — expected keys like
      // "<n>-day … Shallow/Mid-depth/Deep … VWC …". Match on the window token
      // AND the depth token.
      const depthToken = entry.depth === 'shallow' ? /shallow/i
                       : entry.depth === 'mid'     ? /mid/i : /deep/i;
      for (const row of rows) {
        let val = null;
        for (const k of Object.keys(row)) {
          if (k === 'station' || k === 'datetime') continue;
          if (k.toLowerCase().includes(entry.col) && depthToken.test(k)) {
            val = row[k];
            const um = k.match(/\[(.+)\]$/);
            if (um && !unit) unit = um[1];
            break;
          }
        }
        if (typeof val === 'number' && Number.isFinite(val)) {
          byStation.set(row.station, { v: val, dt: row.datetime ?? null });
        }
        if (typeof row.datetime === 'number') maxDt = Math.max(maxDt ?? 0, row.datetime);
      }
      return { byStation, unit: unit || '%', maxDt };
    }

    const colInfo = resolveColumn(rows, entry);
    if (!colInfo) return { byStation, unit: null, maxDt: null };
    unit = colInfo.unit;

    // SI handling — see the US_TO_SI comment block for the per-source quirks.
    // 'relabel': values already SI, label stale. 'convert': values still U.S.
    const siBehavior = entry.source === 'obs' ? 'relabel'
                     : entry.source === 'pptwin' ? 'convert' : 'none';
    let conv = null;
    if (units === 'si' && siBehavior !== 'none') {
      const ov = entry.siKey ? SI_OVERRIDES[entry.siKey] : null;
      const mapping = (ov && unit === ov.from) ? ov : US_TO_SI[unit];
      if (mapping) {
        unit = mapping.unit;
        if (siBehavior === 'convert') conv = mapping;
      }
    }
    const usOv = usOverride(entry, units, unit);
    if (usOv) {
      unit = usOv.unit;
      conv = usOv;
    }

    for (const row of rows) {
      const raw = row[colInfo.key];
      const dt = typeof row.datetime === 'number' ? row.datetime : null;
      if (dt != null) maxDt = Math.max(maxDt ?? 0, dt);
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const v = conv ? conv.f(raw) : raw;
      byStation.set(row.station, { v, dt });
    }
    return { byStation, unit, maxDt };
  }

  // Extract values from an aggregation response: columns are named
  // "{AggPrefix}{description_short} [unit]" per raw element. Alternative
  // sensors (2 m vs 8 ft) coalesce in els order; depth bands combine by the
  // aggregation's own semantics (min of mins, max of maxes, mean of means).
  function extractAggValues(rows, entry, agg, units) {
    const byStation = new Map();
    const prefix = AGG_PREFIX[agg];
    let unit = null, maxDt = null;
    const keySet = new Set();
    for (const row of rows) for (const k of Object.keys(row)) keySet.add(k);
    const cols = [];
    for (const el of entry.els) {
      const desc = elementDesc.get(el);
      if (!desc) continue;
      for (const k of keySet) {
        if (k.startsWith(`${prefix}${desc} [`)) {
          if (!unit) { const m = k.match(/\[(.+)\]$/); if (m) unit = m[1]; }
          cols.push(k);
          break;
        }
      }
    }
    const usOv = usOverride(entry, units, unit);
    const combine = (vals) => {
      if (!vals.length) return null;
      if (!entry.band) return vals[0];
      if (agg === 'min') return Math.min(...vals);
      if (agg === 'max') return Math.max(...vals);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    for (const row of rows) {
      const dt = typeof row.datetime === 'number' ? row.datetime : null;
      if (dt != null) maxDt = Math.max(maxDt ?? 0, dt);
      const vals = [];
      for (const k of cols) {
        const v = row[k];
        if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
      }
      const v = combine(vals);
      if (v != null) byStation.set(row.station, { v: usOv ? usOv.f(v) : v, dt });
    }
    return { byStation, unit: usOv ? usOv.unit : unit, maxDt };
  }

  // ── App state (data) ─────────────────────────────────────────────────────
  let stations    = [];
  let elementDesc = new Map();     // element id → description_short (boot)
  let stationById = new Map();
  // Co-location is the kit's MCO.map.colocation (0.21.0; see "Click & hover"):
  // it groups the visible stations into 4-decimal buckets on every render, so
  // hiding a network or category promotes the next visible member to anchor.
  let _propsById    = new Map();   // station id → feature props from last render
  let _catById      = new Map();   // station id → 'ok' | 'stale' | 'nodata' (last render)
  let _lastFC = { type: 'FeatureCollection', features: [] };
  let _lastRender = null;          // {entry, unit, scale, fmt, counts, maxDt}
  let _popupFocusReturn = null;    // element to refocus when the popup closes
  let earliestDate = EARLIEST_DATE;

  function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

  // ── Map init ─────────────────────────────────────────────────────────────
  // MapLibre 6 is ES-modules only (kit 0.8.0): there is no <script src> that
  // defines the global any more. mco-map.js imports the family pin (SRI via the
  // page's import map, started early by its modulepreloads) and publishes
  // window.maplibregl. This file is a module, so it simply waits here; the
  // controls above are already wired. If the library never arrives, say so on
  // the map and stop here: everything below needs it. The never-settling
  // promise halts this module without an uncaught error.
  await MCO.map.loadMapLibre().catch((err) => {
    console.error(err);
    hideLoading();
    MCO.notice({
      tone: 'danger',
      text: 'The map library failed to load. Check your connection and try again.',
      action: { label: 'Retry', onClick: () => location.reload() },
      container: document.getElementById('main'), place: 'over', dismissible: false,
    });
    MCO.ready();
    return new Promise(() => {});
  });

  const map = new maplibregl.Map({
    container: 'map',
    style: MCO.map.cartoStyleUrl(),
    ...(_hasInitPos
      ? { center: [_initLng, _initLat], zoom: _initZoom }
      : { bounds: MT_FIT_BOUNDS, fitBoundsOptions: FIT_OPTS }),
  });
  // A basemap that 404s or hangs used to leave 'load' unfired and the loading
  // bar spinning forever. watchBasemap (kit 0.8.0) retries the style, then
  // falls back to a blank style that DOES load, with a Retry notice.
  MCO.map.watchBasemap(map);
  // Every style load wipes our sources and layers: the first one, a theme
  // switch, and watchBasemap's retry or blank fallback alike. So re-add them on
  // EVERY style.load, not once per caller. addCustomLayers is idempotent (it
  // checks each id), so the first load's second call from 'load' is a no-op.
  map.on('style.load', () => {
    addCustomLayers();
    coloc.refresh();   // re-fans an open spider into the new style's sources
  });

  // Top-LEFT on purpose: the station detail panel docks to the right edge, and
  // anything in a right-hand corner ends up underneath it.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  (function addFitToExtentButton() {
    const navGroup = document.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group');
    if (!navGroup) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maplibregl-ctrl-fit';
    btn.title = 'Zoom to full extent';
    btn.setAttribute('aria-label', 'Zoom to full extent');
    btn.innerHTML = `<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => {
      coloc.close();
      map.fitBounds(MT_FIT_BOUNDS, { ...fitOpts(), animate: !MCO.reducedMotion() });
    });
    navGroup.appendChild(btn);
  })();

  // Zoom floor: the kit's MCO.map.installZoomFloor (0.8.0, hardened from this
  // file's own guards: the re-entrancy latch and the 0.01 tolerance). Zooming
  // out past the whole state springs back to the Montana extent; a setMinZoom
  // clamp was tried here once and was wrong twice over (zoom-out did nothing,
  // and MapLibre greys out its zoom-out button at minZoom with no explanation).
  // App policy rides in onBeforeSnap: resizes are this app's own handler's
  // business (it re-fits when you were AT the extent, and never under an open
  // station unless the sidebar toggle asked), so the kit only snaps on zoom.
  const zoomFloor = MCO.map.installZoomFloor(map, {
    fitOpts: () => fitOpts(),
    onBeforeSnap: ({ reason }) => reason === 'zoom' && _mapReady,
  });
  const fitZoom = () => zoomFloor.fitZoom();
  let _mapReady = false;

  // Cached static overlay FeatureCollections
  let _stateFC  = null;
  let _tribalFC = null;
  let _countyFC = null;
  // Watersheds stream from the MCO CDN as FlatGeobuf, lazily on first enable.
  // Vendored copy of the MCO CDN file (data.climate.umt.edu resolves to a
  // private IP on the UMT campus network, and Chrome blocks public→local
  // fetches). May move back to a shared host later.
  const HUC_FGB_URL = 'data/mt_hucs.fgb';
  let _hucFC = null;
  let _hucLoading = null;
  function loadHucOnce() {
    if (_hucFC) return Promise.resolve(_hucFC);
    if (!_hucLoading) {
      _hucLoading = (async () => {
        const res = await fetch(HUC_FGB_URL);
        if (!res.ok) throw new Error(`watersheds fetch failed (${res.status})`);
        const features = [];
        // deserialize takes the response stream (same pattern as the
        // snowpack explorer) — a bare URL argument requires a spatial rect.
        for await (const f of flatgeobuf.deserialize(res.body)) features.push(f);
        _hucFC = { type: 'FeatureCollection', features };
        map.getSource('huc')?.setData(_hucFC);
        return _hucFC;
      })().catch(err => { _hucLoading = null; throw err; });
    }
    return _hucLoading;
  }
  async function preloadOverlay(sourceId, url, save) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const fc = await res.json();
      save(fc);
      const src = map.getSource(sourceId);
      if (src) src.setData(fc);
    } catch { /* overlays are decorative */ }
  }

  let _radarTs = Date.now();

  function addCustomLayers() {
    if (!map.getSource('stations')) {
      map.addSource('stations', { type: 'geojson', data: _lastFC });
    }
    coloc.addSources();   // the kit's spider feet + connector sources
    if (!map.getSource('tribal')) {
      map.addSource('tribal', { type: 'geojson', data: _tribalFC || 'data/mt_reservations_simple.geojson' });
    }
    if (!map.getSource('county')) {
      map.addSource('county', { type: 'geojson', data: _countyFC || 'data/mt_counties_simple.geojson' });
    }
    if (!map.getSource('huc')) {
      map.addSource('huc', { type: 'geojson', data: _hucFC || emptyFC() });
    }
    if (!map.getSource('state')) {
      map.addSource('state', { type: 'geojson', data: _stateFC || 'data/mt_state_simple.geojson' });
    }
    if (!_tribalFC) preloadOverlay('tribal', 'data/mt_reservations_simple.geojson', fc => _tribalFC = fc);
    if (!_countyFC) preloadOverlay('county', 'data/mt_counties_simple.geojson',     fc => _countyFC = fc);
    if (!_stateFC)  preloadOverlay('state',  'data/mt_state_simple.geojson',        fc => _stateFC  = fc);

    // Themed live-shaded topography, beneath everything we draw. On a station
    // map the terrain is real context — which sites sit in valleys, which on
    // ridges — and the dots are small enough that it never competes with them.
    MCO.map.addHillshade(map);

    // CARTO draws its own dashed county boundaries (pale orange on Positron,
    // z9+). This map has a county overlay the user can toggle, so the basemap's
    // copy is a duplicate that can't be turned off. Re-run on every style load,
    // because setStyle brings it back.
    if (map.getLayer('boundary_county')) {
      map.setLayoutProperty('boundary_county', 'visibility', 'none');
    }

    if (radarOn && !map.getSource('radar')) {
      map.addSource('radar', { type: 'raster', tiles: [RADAR_TILES(_radarTs)], tileSize: 256 });
    }
    if (radarOn && !map.getLayer('radar-layer')) {
      map.addLayer({ id: 'radar-layer', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.55 } });
    }

    if (!map.getLayer('county-line')) {
      map.addLayer({
        id: 'county-line', type: 'line', source: 'county',
        layout: { visibility: overlayCounties ? 'visible' : 'none' },
        paint: countyLinePaint(),
      });
    }
    if (!map.getLayer('huc-line')) {
      map.addLayer({
        id: 'huc-line', type: 'line', source: 'huc',
        layout: { visibility: overlayWatersheds ? 'visible' : 'none' },
        paint: hucLinePaint(),
      });
    }
    if (!map.getLayer('tribal-fill')) {
      map.addLayer({
        id: 'tribal-fill', type: 'fill', source: 'tribal',
        paint: tribalFillPaint(),
      });
    }
    if (!map.getLayer('tribal-line')) {
      map.addLayer({
        id: 'tribal-line', type: 'line', source: 'tribal',
        paint: tribalLinePaint(),
      });
    }
    if (!map.getLayer('state-line')) {
      map.addLayer({
        id: 'state-line', type: 'line', source: 'state',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: stateLinePaint(),
      });
    }

    if (!map.getLayer('spider-lines-layer')) {
      map.addLayer({
        id: 'spider-lines-layer', type: 'line', source: coloc.spiderLinesSource,
        paint: MCO.map.colocation.spiderLinePaint(),
      });
    }

    // Station dot layers: no-data (hollow, muted) under stale (hollow, dashed
    // feel via lighter stroke) under valued (filled with the scale color).
    if (!map.getLayer('dots-nodata')) {
      map.addLayer({
        id: 'dots-nodata', type: 'circle', source: 'stations',
        filter: nodataFilter(),
        paint: nodataDotPaint(),
      });
    }
    if (!map.getLayer('dots-stale')) {
      map.addLayer({
        id: 'dots-stale', type: 'circle', source: 'stations',
        filter: staleFilter(),
        paint: staleDotPaint(),
      });
    }
    if (!map.getLayer('dots-value')) {
      map.addLayer({
        id: 'dots-value', type: 'circle', source: 'stations',
        filter: valueFilter(),
        paint: valueDotPaint(),
      });
    }
    // The detail panel is docked at the edge rather than attached to the dot,
    // so the dot itself has to say which station you're reading. The ring is
    // the kit's --selection-ring, read per theme at paint time (the literal
    // '#5aaee8' this replaced is the DARK value, and too pale on light). Added
    // with the current selection so a theme switch, which rebuilds the style,
    // keeps the ring on the open station.
    if (!map.getLayer('dots-selected')) {
      map.addLayer({
        id: 'dots-selected', type: 'circle', source: 'stations',
        filter: ['==', ['get', 'station'], _selectedStation || '__none__'],
        paint: MCO.map.selectionPaint({ radius: 11, width: 3 }),
      });
    }
    // The colocated site's count badge: the kit's disc + count (0.21.0).
    if (!map.getLayer('stations-badge')) {
      MCO.map.colocation.badgeLayers({ id: 'stations-badge', source: 'stations', filter: netMatch() })
        .forEach((l) => map.addLayer(l));
    }

    if (!map.getLayer('dots-label')) {
      map.addLayer({
        id: 'dots-label', type: 'symbol', source: 'stations',
        minzoom: LABEL_MINZOOM,
        filter: valueFilter(),
        layout: dotLabelLayout(),
        paint: labelPaint(),
      });
    }

    // Spider fan-out: feet inherit render props, so one circle layer with
    // cat-driven paint reproduces the value/stale/nodata looks exactly.
    if (!map.getLayer('spider-layer')) {
      map.addLayer({
        id: 'spider-layer', type: 'circle', source: coloc.spiderSource,
        paint: spiderCirclePaint(),
      });
    }
    if (!map.getLayer('spider-label')) {
      map.addLayer({
        id: 'spider-label', type: 'symbol', source: coloc.spiderSource,
        minzoom: LABEL_MINZOOM,
        layout: dotLabelLayout(),
        paint: labelPaint(),
      });
    }

    applyDotFilters();
  }

  // Every station draws with the kit's one station paint (MCO.map.stationPaint,
  // 0.21.0): no network encoding, HydroMet and AgriMet alike. The data value is
  // the fill; no-data and stale dots are hollow rings in a muted stroke, which
  // the legend's hollow swatches (data-shape="hollow") match.
  const R_NODATA = ['interpolate', ['linear'], ['zoom'], 4, 2.5, 7, 3.5, 10, 5, 14, 6.5];
  const R_STALE  = ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 4.5, 10, 6.5, 14, 8.5];
  const R_VALUE  = ['interpolate', ['linear'], ['zoom'], 4, 3.5, 7, 5, 10, 7, 14, 9];
  function nodataDotPaint() {
    return MCO.map.stationPaint({ fill: 'rgba(0,0,0,0)', radius: R_NODATA,
      stroke: mutedStrokeColor(), strokeWidth: 1.2 });
  }
  function staleDotPaint() {
    return MCO.map.stationPaint({ fill: 'rgba(0,0,0,0)', radius: R_STALE,
      stroke: mutedStrokeColor(), strokeWidth: 1.8 });
  }
  function valueDotPaint() {
    return { ...MCO.map.stationPaint({ fill: ['get', 'color'], radius: R_VALUE }), 'circle-opacity': 0.95 };
  }

  function dotLabelLayout() {
    return {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 12, 14, 13],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.8,
      'text-justify': 'auto',
      'text-padding': 2,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': true,
      'visibility': labelsOn ? 'visible' : 'none',
    };
  }

  // Spider feet carry the render props, so one layer reproduces all three looks.
  function spiderCirclePaint() {
    const byCat = (ok, stale, nodata) =>
      ['match', ['get', 'cat'], 'stale', stale, 'nodata', nodata, ok];
    const fill = ['match', ['get', 'cat'], 'ok', ['get', 'color'], 'rgba(0,0,0,0)'];
    return {
      ...MCO.map.stationPaint({
        fill,
        radius: ['interpolate', ['linear'], ['zoom'],
          4,  byCat(3.5, 3,   2.5),
          7,  byCat(5,   4.5, 3.5),
          10, byCat(7,   6.5, 5),
          14, byCat(9,   8.5, 6.5)],
        stroke: byCat(dotStrokeColor(), mutedStrokeColor(), mutedStrokeColor()),
        strokeWidth: byCat(1.2, 1.8, 1.2),
      }),
      'circle-opacity': byCat(0.95, 0, 0),
    };
  }

  // Layer filters per category + network visibility (applied at feature level
  // via the `net` property so the source doesn't need re-emitting). Main dot
  // layers show only bucket anchors; siblings appear via the spider fan-out.
  const ANCHOR_ONLY = MCO.map.colocation.ANCHOR_ONLY;
  function netMatch() {
    return ['in', ['get', 'sub_network'], ['literal', [...activeNetworks]]];
  }
  function valueFilter()  { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'ok'],     netMatch()]; }
  function staleFilter()  { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'stale'],  netMatch(), ['literal', staleShown]]; }
  function nodataFilter() { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'nodata'], netMatch(), ['literal', nodataShown]]; }
  function badgeFilter()  { return MCO.map.colocation.badgeFilter(netMatch()); }
  // Spider membership already excludes hidden nets/cats, but keep a category
  // guard for the toggle→re-render window.
  function spiderCatFilter() {
    const cats = ['ok'];
    if (staleShown)  cats.push('stale');
    if (nodataShown) cats.push('nodata');
    return ['in', ['get', 'cat'], ['literal', cats]];
  }
  function applyDotFilters() {
    if (!map.getLayer('dots-value')) return;
    map.setFilter('dots-value',  valueFilter());
    map.setFilter('dots-stale',  staleFilter());
    map.setFilter('dots-nodata', nodataFilter());
    map.setFilter('dots-label',  valueFilter());
    for (const lid of ['stations-badge', 'stations-badge-disc']) {
      if (map.getLayer(lid)) map.setFilter(lid, badgeFilter());
    }
    if (map.getLayer('spider-layer'))   map.setFilter('spider-layer',   spiderCatFilter());
    if (map.getLayer('spider-label'))   map.setFilter('spider-label',   ['all', ['==', ['get', 'cat'], 'ok']]);
    updateEmptyState();
  }

  function labelPaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'text-color':      dark ? '#e8ecf0' : '#1a1a2e',
      'text-halo-color': dark ? '#161b22' : '#ffffff',
      'text-halo-width': 1.4,
      'text-halo-blur':  0.4,
    };
  }
  function tribalFillPaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'fill-color':   dark ? '#b88a5e' : '#9b6b3e',
      'fill-opacity': dark ? 0.18      : 0.10,
    };
  }
  function tribalLinePaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'line-color':   dark ? '#d6a06f' : '#7a4f24',
      'line-width':   1,
      'line-opacity': dark ? 0.65      : 0.55,
    };
  }
  function countyLinePaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'line-color':   dark ? '#8a99b0' : '#5a6070',
      'line-width':   0.8,
      'line-opacity': 0.5,
    };
  }
  function hucLinePaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'line-color':   dark ? '#6fa8c9' : '#3d7ba6',
      'line-width':   1,
      'line-opacity': dark ? 0.55      : 0.5,
    };
  }
  function stateLinePaint() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return {
      'line-color':   dark ? '#e8ecf0' : '#1a1a2e',
      'line-width':   2,
      'line-opacity': 0.55,
    };
  }

  // ── Co-location membership (visibility-aware) ────────────────────────────
  // A station is a member of its site only while its network AND category are
  // visible, so the badge counts what you can actually expand, and a hidden
  // anchor promotes its sibling (MCO.map.colocation's visible + rank).
  const netRank = (n) => n === 'HydroMet' ? 0 : n === 'AgriMet' ? 1 : 99;
  function catVisible(cat) {
    return cat === 'ok' || (cat === 'stale' && staleShown) || (cat === 'nodata' && nodataShown);
  }

  // ── Render pipeline ──────────────────────────────────────────────────────
  async function render({ background = false } = {}) {
    const token = ++renderToken;
    const entry = REGISTRY_BY_KEY.get(activeVar);
    if (!entry) return;
    if (!background) showLoading();

    let rows;
    try {
      rows = await fetchRowsFor(entry, activeMode, activeDate, activeHour, activeUnits);
    } catch (err) {
      if (token !== renderToken) return;
      console.error(err);
      hideLoading();
      if (!background) showRenderError(entry);
      MCO.showToast(entry.source === 'change'
        ? 'Soil-moisture change is temporarily unavailable'
        : `Data fetch failed: ${err.message}`, 6000);
      return;
    }
    if (token !== renderToken) return;

    const { byStation, unit, maxDt } = aggActive(entry)
      ? extractAggValues(rows, entry, activeAgg, activeUnits)
      : extractValues(rows, entry, activeUnits);

    // Stale classification (latest mode only; rows lacking a timestamp are
    // treated as current — e.g. precip windows).
    const now = Date.now();
    const isStale = (dt) =>
      activeMode === 'latest' && typeof dt === 'number' && (now - dt) >= STALE_MS;

    // Scale domain from displayable values (stale included only when shown).
    const domainValues = [];
    for (const s of stations) {
      if (!activeNetworks.has(s.sub_network)) continue;
      const rec = byStation.get(s.station);
      if (!rec) continue;
      if (isStale(rec.dt) && !staleShown) continue;
      domainValues.push(rec.v);
    }
    // Log-scale variables (SWP spans several orders of magnitude) color-map
    // in log10 space; legend labels stay in raw units via displayDomain.
    let xform = null;
    if (entry.scale.log) {
      const pos = domainValues.filter(v => v > 0);
      const minPos = pos.length ? Math.min(...pos) : 1e-3;
      xform = (v) => Math.log10(Math.max(v, minPos));
    }
    const scaleValues = xform ? domainValues.map(xform) : domainValues;
    let [dMin, dMax] = entry.scale.domain || robustDomain(scaleValues);
    // User override: locked domain and/or swapped ramp (current variable only).
    const ov = scaleOverride;
    if (ov && Number.isFinite(ov.min) && Number.isFinite(ov.max) && !entry.scale.domain) {
      dMin = xform ? xform(ov.min) : ov.min;
      dMax = xform ? xform(ov.max) : ov.max;
    }
    const scale = makeScale(entry.scale, unit || '', dMin, dMax, ov ? {
      ramp: ov.ramp,
      rev:  ov.rev,
      mid:  (!xform && Number.isFinite(ov.mid)) ? ov.mid : undefined,
    } : {});
    scale.xform = xform;
    scale.displayDomain = xform ? [10 ** dMin, 10 ** dMax] : [dMin, dMax];
    // True data extent → ≤/≥ legend labels when the domain trims it (robust
    // percentiles or a locked scale). Not for fixed-domain variables.
    if (!entry.scale.domain && domainValues.length) {
      let rawMin = Infinity, rawMax = -Infinity;
      for (const v of domainValues) { if (v < rawMin) rawMin = v; if (v > rawMax) rawMax = v; }
      const [lo, hi] = scale.displayDomain;
      const eps = Math.abs(hi - lo) * 1e-9;
      scale.clampedLow  = rawMin < lo - eps;
      scale.clampedHigh = rawMax > hi + eps;
    }
    const fmt = makeFormatter(entry, scale.displayDomain);

    // Pass 1 — classify every station so colocation can be visibility-aware.
    const catById = new Map();
    for (const s of stations) {
      const rec = byStation.get(s.station);
      catById.set(s.station, !rec ? 'nodata' : isStale(rec.dt) ? 'stale' : 'ok');
    }
    _catById = catById;

    // Pass 2 — the render props per station. MCO.map.colocation adds the
    // colocation fields (count, index, bucket) when it writes the source.
    const counts = { ok: 0, stale: 0, nodata: 0 };
    _propsById = new Map();
    for (const s of stations) {
      const rec = byStation.get(s.station);
      const cat = catById.get(s.station);
      let color = NULL_COLOR, label = '', value = null, dt = null;
      if (rec) {
        value = rec.v; dt = rec.dt; label = fmt(rec.v);
        if (cat === 'ok') color = scale(scale.xform ? scale.xform(rec.v) : rec.v);
      }
      if (activeNetworks.has(s.sub_network)) counts[cat]++;
      _propsById.set(s.station, {
        station: s.station, name: s.name, sub_network: s.sub_network,
        cat, color, label, value, dt,
      });
    }
    _lastFetchAt = Date.now();
    _lastFC = coloc.setData(stations);
    _lastRender = { entry, unit, scale, fmt, counts, maxDt };
    applyDotFilters();
    renderLegend();
    updateSyncStampFromData();
    hideLoading();
    refreshOpenPopup();
    renderSRTable();
    if (!background) {
      // Tell screen-reader users the map updated — nothing else announces it.
      // Cyclic variables (compass) skip the range: "N to N" is meaningless.
      const disp = scale.displayDomain;
      const scalePart = !scale.endLabels && Number.isFinite(disp[0]) && Number.isFinite(disp[1])
        ? `, scale ${fmt(disp[0])} to ${fmt(disp[1])}${unit ? ' ' + unit : ''}` : '';
      MCO.announce(`${entry.label}: ${counts.ok} stations reporting${scalePart}.`);
    }
  }

  // Non-visual access to the dataset: the WebGL dots are unreachable by
  // keyboard and invisible to AT, so every render also fills a hidden table:
  // the kit's MCO.srTable twin (0.8.0) — caption with the row count, row
  // headers, cells by textContent, rebuilt only when the content changed, and
  // never a live region (MCO.announce says what changed). The caption names
  // the variable, so it is set per render; the table keeps its old id for
  // anything that looks it up.
  const srTwinOpts = {
    container: document.getElementById('main'),
    caption: 'Stations',
    rowKey: (p) => p.station,
    columns: [
      { key: 'name', label: 'Station', rowHeader: true, value: (p) => `${p.name} (${p.station})` },
      { key: 'sub_network', label: 'Network' },
      { key: 'value', label: 'Value', value: (p) => p.__value },
      { key: 'dt', label: 'Observed', value: (p) => typeof p.dt === 'number' ? MCO.formatStampMT(p.dt) : null },
    ],
  };
  const srTwin = MCO.srTable(srTwinOpts);
  srTwin.element.querySelector('table').id = 'sr-station-table';
  function renderSRTable() {
    if (!_lastRender) return;
    const { entry, unit } = _lastRender;
    srTwinOpts.caption = `${entry.label}${unit ? ` (${unit})` : ''} by station`;
    const unitFor = (p) => entry.fmt === 'compass'
      ? ` (${Math.round(p.value)}°)` : (unit ? ' ' + unit : '');
    const rows = [..._propsById.values()]
      .filter(p => activeNetworks.has(p.sub_network))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ ...p, __value: p.cat === 'nodata' || p.value == null
        ? 'no data' : `${p.label}${unitFor(p)}${p.cat === 'stale' ? ' (stale)' : ''}` }));
    srTwin.render(rows);
  }

  // Keep an open popup in step with the map — variable/time/unit changes and
  // the auto-refresh would otherwise leave it showing a stale snapshot.
  // Scroll position is preserved across the rebuild: the 5-minute auto-refresh
  // would otherwise yank a mid-read popup back to the top.
  function refreshOpenPopup() {
    if (!_selectedStation || !_sheetOpen) return;
    const keepScroll = sheetBodyEl.scrollTop;
    const hadFocus = sheetBodyEl.contains(document.activeElement);
    sheetBodyEl.replaceChildren(popupDOM(_selectedStation));
    sheetBodyEl.scrollTop = keepScroll;
    initPhotoCarousel(() => sheetEl, _selectedStation);
    wireSiblingLinks(sheetEl);
    // The value block's height varies by variable, so peek has to re-measure:
    // re-applying the state makes the kit measure [data-peek] again.
    if (sheet.state() === 'peek') sheet.setState('peek');
    if (hadFocus && !sheetBodyEl.contains(document.activeElement)) sheetTitleEl.focus({ preventScroll: true });
  }

  // The freshness stamp is the kit's MCO.formatUpdatedMT (0.21.0): "Updated
  // 2:45 PM MST", the time of the newest observation in what is shown, with
  // the date when that is not today in Mountain time. A feed with no data time
  // (the precipitation windows) falls back to when it was fetched.
  let _lastFetchAt = null;
  function updateSyncStampFromData() {
    if (!_lastRender) return;
    MCO.formatUpdatedMT(_lastRender.maxDt || _lastFetchAt, { into: refreshStampEl });
  }

  // Empty states are the kit's .mco-empty callout, built with textContent (the
  // variable label is API-derived). Any error notice goes too: whatever state
  // just rendered supersedes it.
  function updateEmptyState() {
    clearErrorCard();
    emptyStateEl.replaceChildren();
    if (!stations.length) { emptyStateEl.hidden = true; return; }
    let lead = null, rest = '';
    if (activeNetworks.size === 0) {
      lead = 'No networks selected.'; rest = ' Click HydroMet or AgriMet to show stations.';
    } else if (_lastRender && _lastRender.counts.ok === 0) {
      lead = 'No data';
      rest = ` for ${_lastRender.entry.label} at this time. Try another variable, date, or time mode.`;
    }
    if (lead) {
      const card = document.createElement('p');
      card.className = 'mco-empty';
      const b = document.createElement('strong');
      b.textContent = lead;
      card.append(b, rest);
      emptyStateEl.appendChild(card);
    }
    emptyStateEl.hidden = !lead;
  }

  // Load failures are the kit's danger notice (MCO.notice, 0.8.0) floating at
  // the top of the map: a visible "Error" tone word, Retry, a dismiss button,
  // and one assertive announcement. A toast alone (gone in seconds, and the
  // navbar stamp is hidden on phones) was never enough. A later render clears
  // it through updateEmptyState().
  let _errorNotice = null;
  function clearErrorCard() { if (_errorNotice) { _errorNotice.close(); _errorNotice = null; } }
  function showErrorCard(text, onRetry) {
    clearErrorCard();
    emptyStateEl.hidden = true;
    _errorNotice = MCO.notice({
      tone: 'danger', text, container: document.getElementById('main'), place: 'over',
      action: { label: 'Retry', onClick: () => { clearErrorCard(); onRetry(); } },
    });
  }
  function showRenderError(entry) {
    showErrorCard(`Couldn’t load ${entry.label}. The map still shows the previous selection.`, () => render());
  }

  // ── Legend ───────────────────────────────────────────────────────────────
  function renderLegend() {
    if (!_lastRender) return;
    const { entry, unit, scale, counts, maxDt } = _lastRender;

    updateLegendTitle();
    legendDescEl.textContent = VARIABLE_DESC[entry.key] || '';
    legendDescEl.hidden = !VARIABLE_DESC[entry.key];

    // Gradient strip from the actual scale (21 samples).
    const stops = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const v = scale.domain[0] + t * (scale.domain[1] - scale.domain[0]);
      stops.push(`${scale(v)} ${(t * 100).toFixed(0)}%`);
    }
    // backgroundImage, NOT the background shorthand — the shorthand resets the
    // no-repeat/100% sizing that prevents edge wrap-around (see the CSS).
    legendGradientEl.style.backgroundImage = `linear-gradient(to right, ${stops.join(', ')})`;

    legendScaleLabelsEl.innerHTML = '';
    const disp = scale.displayDomain || scale.domain;
    const minL = document.createElement('span');
    // ≤/≥ marks values trimmed by the robust percentile domain (or a locked
    // scale) that share the end colors; compass variables get N…N ends.
    minL.textContent = scale.endLabels
      ? scale.endLabels[0]
      : (scale.clampedLow ? '≤ ' : '') + fmtScaleLimit(disp[0]);
    legendScaleLabelsEl.appendChild(minL);
    if (scale.mid != null && !scale.xform) {
      const midL = document.createElement('span');
      midL.textContent = fmtScaleLimit(scale.mid);
      legendScaleLabelsEl.appendChild(midL);
    } else if (scale.midLabel) {
      const midL = document.createElement('span');
      midL.textContent = scale.midLabel;
      legendScaleLabelsEl.appendChild(midL);
    }
    const maxL = document.createElement('span');
    maxL.textContent = scale.endLabels
      ? scale.endLabels[1]
      : (scale.clampedHigh ? '≥ ' : '') + fmtScaleLimit(disp[1]);
    legendScaleLabelsEl.appendChild(maxL);

    // Pin + editor affordances reflect the current override state.
    legendPinBtn.hidden = !!entry.scale.domain;
    legendPinBtn.setAttribute('aria-pressed', scaleLocked() ? 'true' : 'false');
    legendPinBtn.setAttribute('aria-label', scaleLocked() ? 'Unlock color scale' : 'Lock color scale');
    legendGradientBtn.title = scaleOverride
      ? 'Custom scale — click to edit'
      : 'Scale spans the 2nd–98th percentile of current values; more extreme '
        + 'values share the end colors. Click to customize.';

    // Interactive rows: no-data always; stale only in Latest mode.
    legendRowsEl.innerHTML = '';
    addLegendRow(legendRowsEl, {
      label: `No data (${counts.nodata})`,
      swatchClass: '',
      pressed: nodataShown,
      onToggle: () => {
        nodataShown = !nodataShown;
        applyDotFilters(); render({ background: true }); writeUrl();
      },
    });
    if (activeMode === 'latest') {
      addLegendRow(legendRowsEl, {
        label: `Stale ≥ 2 h (${counts.stale})`,
        swatchClass: 'stale',
        pressed: staleShown,
        onToggle: () => {
          staleShown = !staleShown;
          applyDotFilters(); render({ background: true }); writeUrl();
        },
      });
    }

    renderOverlayChecks();

    // Meta line
    if (activeMode === 'latest') {
      let meta = maxDt
        ? `Data current as of ${MCO.formatStampMT(maxDt)}`
        : 'Current accumulations';
      if (!staleShown && counts.stale > 0) {
        meta += ` · ${counts.stale} station${counts.stale === 1 ? '' : 's'} hidden (no report in 2 h)`;
      }
      legendMetaEl.textContent = meta;
    } else if (activeMode === 'hourly') {
      legendMetaEl.textContent = `Hour beginning ${MCO.formatDateStr(activeDate)}, ${MCO.pad2(activeHour)}:00 MT`;
    } else {
      legendMetaEl.textContent = `Daily aggregate for ${MCO.formatDateStr(activeDate)}${dailyPartialSuffix()}`;
    }

  }

  // "Today" in Daily mode is an aggregate of an incomplete day — label it so
  // a 9 AM view of daily precipitation isn't read as a full-day total.
  function dailyPartialSuffix() {
    return (activeMode === 'daily' && activeDate === MCO.todayMT())
      ? ` (partial day, through ${MCO.hhmmNowMT()} MT)` : '';
  }

  function updateLegendTitle() {
    if (!_lastRender) return;
    const { entry, unit, counts } = _lastRender;
    const aggSuffix = (activeMode !== 'latest' && aggSupported(entry))
      ? ` · ${AGG_LABEL[activeAgg || defaultAggFor(entry)]}` : '';
    let title = (unit ? `${entry.label} [${unit}]` : entry.label) + aggSuffix;
    // Collapsed (the mobile default) hides the stale toggle — surface the
    // count where it stays visible.
    if (legendCollapsed && activeMode === 'latest' && !staleShown && counts.stale > 0) {
      title += ` · ${counts.stale} hidden`;
    }
    legendTitleEl.textContent = title;
  }

  function addLegendRow(parent, { label, swatchClass, pressed, onToggle }) {
    const row = document.createElement('button');
    row.type = 'button';
    // The kit's legend row (0.8.0). Not MCO.initLegendToggles: these two rows
    // are independent show/hide switches rebuilt on every render (their counts
    // change), not a partition of the data, so isolate-on-double-click has
    // nothing to mean here. The swatch is the hollow ring the map draws.
    row.className = 'mco-legend-row';
    row.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    const sw = document.createElement('span');
    sw.className = `mco-legend-swatch ${swatchClass}`.trim();
    sw.dataset.shape = 'hollow';
    sw.style.setProperty('--swatch', 'var(--text-muted)');
    sw.setAttribute('aria-hidden', 'true');
    const lb = document.createElement('span');
    lb.className = 'mco-legend-label';
    lb.textContent = label;
    row.appendChild(sw);
    row.appendChild(lb);
    row.addEventListener('click', onToggle);
    parent.appendChild(row);
  }

  // Overlays are layers, so they are the kit's .mco-chip[aria-pressed]
  // (HOUSE-STYLE §5.7), like the network filters.
  function renderOverlayChecks() {
    // Rebuilt on every legend render (the Radar chip's availability follows
    // the mode), so keep keyboard focus on the chip that was pressed.
    const focusIdx = [...legendOverlaysEl.children].indexOf(document.activeElement);
    legendOverlaysEl.replaceChildren();
    const mk = (label, pressed, disabled, onToggle, title) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mco-chip';
      chip.textContent = label;
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      chip.disabled = disabled;
      if (title) chip.title = title;
      chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        onToggle(on);
      });
      legendOverlaysEl.appendChild(chip);
    };
    mk('Counties', overlayCounties, false, (on) => {
      overlayCounties = on;
      setOverlayVisibility();
      writeUrl();
    });
    mk('Watersheds', overlayWatersheds, false, (on) => {
      overlayWatersheds = on;
      setOverlayVisibility();
      writeUrl();
      if (on && !_hucFC) {
        loadHucOnce().catch(() => MCO.showToast('Watershed boundaries failed to load'));
      }
    });
    mk('Radar (live)', radarOn, activeMode !== 'latest', (on) => {
      radarWanted = on;
      setRadar(on);
    }, activeMode !== 'latest' ? 'Radar is available in Latest mode' : 'NEXRAD base reflectivity');
    if (focusIdx >= 0) legendOverlaysEl.children[focusIdx]?.focus();
  }

  function setOverlayVisibility() {
    const vis = (on) => on ? 'visible' : 'none';
    if (map.getLayer('county-line')) map.setLayoutProperty('county-line', 'visibility', vis(overlayCounties));
    if (map.getLayer('huc-line'))    map.setLayoutProperty('huc-line',    'visibility', vis(overlayWatersheds));
  }

  // ── Radar overlay (the legend's Radar chip is the only toggle) ──────────
  function setRadar(on) {
    radarOn = on && activeMode === 'latest';
    if (radarOn) {
      _radarTs = Date.now();
      if (!map.getSource('radar')) {
        map.addSource('radar', { type: 'raster', tiles: [RADAR_TILES(_radarTs)], tileSize: 256 });
      }
      if (!map.getLayer('radar-layer')) {
        // Insert below boundary + dot layers.
        const before = map.getLayer('county-line') ? 'county-line' : undefined;
        map.addLayer({ id: 'radar-layer', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.55 } }, before);
      }
    } else {
      if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
      if (map.getSource('radar')) map.removeSource('radar');
    }
    renderLegend();
    writeUrl();
  }
  function refreshRadarTiles() {
    if (!radarOn || !map.getSource('radar')) return;
    _radarTs = Date.now();
    const src = map.getSource('radar');
    if (typeof src.setTiles === 'function') {
      src.setTiles([RADAR_TILES(_radarTs)]);
    } else {
      setRadar(false); setRadar(true);
    }
  }
  // ── Auto-refresh engine (Latest mode, fixed 5-minute cadence) ────────────
  let _refreshTimer = null;
  let _lastRefreshAt = Date.now();
  let _pendingRefresh = false;

  function scheduleRefresh() {
    clearTimeout(_refreshTimer);
    if (activeMode !== 'latest') return;
    _refreshTimer = setTimeout(doRefresh, REFRESH_MS);
  }
  async function doRefresh() {
    if (document.hidden) { _pendingRefresh = true; return; }
    _pendingRefresh = false;
    _lastRefreshAt = Date.now();
    invalidateLatest();
    refreshRadarTiles();
    await render({ background: true });
    scheduleRefresh();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const overdue = (Date.now() - _lastRefreshAt) > REFRESH_MS;
    if (activeMode === 'latest' && (_pendingRefresh || overdue)) doRefresh();
  });

  // ── Variable picker ──────────────────────────────────────────────────────
  function populateVariableSelect() {
    variableSelect.innerHTML = '';
    for (const group of GROUP_ORDER) {
      // Variables unavailable in the current mode are omitted entirely
      // (empty groups drop with them); the info modal explains the behavior.
      const entries = REGISTRY.filter(e => e.group === group && e.modes.includes(activeMode));
      if (!entries.length) continue;
      const og = document.createElement('optgroup');
      og.label = group;
      for (const e of entries) {
        const opt = document.createElement('option');
        opt.value = e.key;
        opt.textContent = (_pickerInBar && SHORT_LABELS[e.key]) || e.label;
        og.appendChild(opt);
      }
      variableSelect.appendChild(og);
    }
    variableSelect.value = activeVar;
  }
  variableSelect.addEventListener('change', () => {
    activeVar = variableSelect.value;
    activeAgg = null;      // re-resolve to the new variable's default aggregation
    scaleOverride = null;  // a custom temperature domain is meaningless for precip
    syncAggUI();
    render();
    writeUrl();
  });

  // ── Aggregation selector ─────────────────────────────────────────────────
  function syncAggUI() {
    aggGroup.hidden = activeMode === 'latest';
    // Runs after syncModeUI in boot(), so this is the last word on which control
    // groups are visible — re-derive which sidebar sections have any content.
    syncSidebarSections();
    const entry = REGISTRY_BY_KEY.get(activeVar);
    const ok = aggSupported(entry);
    aggSelect.disabled = !ok;
    aggSelect.title = ok ? '' : 'Aggregation applies to observed variables';
    if (!ok) { aggSelect.value = ''; return; }   // placeholder dash
    for (const opt of aggSelect.options) {
      if (opt.value === 'sum' || opt.value === 'stddev') {
        opt.disabled = !!entry.band;
        opt.title = opt.disabled ? 'Not available for depth-grouped variables' : '';
      }
    }
    // Resolve to the variable's own default; drop selections a depth-grouped
    // variable can't honor.
    if (activeAgg == null) activeAgg = defaultAggFor(entry);
    if (entry.band && (activeAgg === 'sum' || activeAgg === 'stddev')) {
      activeAgg = defaultAggFor(entry);
    }
    aggSelect.value = activeAgg;
  }
  aggSelect.addEventListener('change', () => {
    activeAgg = aggSelect.value;
    render();
    writeUrl();
  });

  // ── Time mode + date/hour controls ───────────────────────────────────────
  function syncModeUI() {
    for (const b of document.querySelectorAll('.seg-btn[data-mode]')) {
      b.setAttribute('aria-pressed', b.dataset.mode === activeMode ? 'true' : 'false');
    }
    dateGroup.hidden = activeMode === 'latest';
    hourGroup.hidden = activeMode !== 'hourly';
    if (activeMode !== 'latest' && radarOn) setRadar(false);
    // The pulsing dot signals live auto-refresh — stop it for historical modes.
    const rs = document.querySelector('.refresh-status');
    rs.classList.toggle('static', activeMode !== 'latest');
    rs.title = activeMode === 'latest' ? 'Updates every 5 minutes' : 'Selected time';
    syncSidebarSections();
  }

  function setMode(mode) {
    if (mode === activeMode) return;
    activeMode = mode;
    // Clamp the time selection into range for the new mode.
    if (mode === 'hourly') {
      const last = MCO.lastCompleteHourMT();
      if (activeDate > last.date || (activeDate === last.date && activeHour > last.hour)) {
        activeDate = last.date; activeHour = last.hour;
      }
      dateInput.value = activeDate;
      updateHourReadout();
    } else if (mode === 'daily') {
      if (activeDate > MCO.todayMT()) activeDate = MCO.todayMT();
      dateInput.value = activeDate;
    }
    dateInput.max = maxDateForMode();   // hourly excludes the incomplete hour's day
    // Fall back if the current variable isn't available in this mode.
    const entry = REGISTRY_BY_KEY.get(activeVar);
    if (!entry.modes.includes(mode)) {
      activeVar = 'air_temp';
      MCO.showToast(`${entry.label} isn't available in ${mode} mode — showing Air Temperature`);
    }
    populateVariableSelect();
    syncAggUI();
    syncModeUI();
    if (mode === 'latest' && radarWanted && !radarOn) setRadar(true);
    scheduleRefresh();
    render();
    writeUrl();
  }
  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  }

  function maxDateForMode() {
    return activeMode === 'hourly' ? MCO.lastCompleteHourMT().date : MCO.todayMT();
  }
  function setDate(dateStr) {
    let d = dateStr;
    const maxD = maxDateForMode();
    if (d < earliestDate) { d = earliestDate; MCO.showToast(`Earliest available date: ${MCO.formatDateStr(d)}`); }
    if (d > maxD)         { d = maxD;         MCO.showToast('No future dates available'); }
    activeDate = d;
    dateInput.value = d;
    if (activeMode === 'hourly') clampHour();
    render();
    writeUrl();
  }
  dateInput.addEventListener('change', () => setDate(dateInput.value));

  // Steppers are the kit's MCO.initStepper (0.9.0): click and Enter/Space step
  // once, a held pointer repeats. No canStep: the bounds are enforced (with a
  // toast saying why) by setDate/stepHour, and a button disabled under the
  // keyboard focus would drop that focus on <body>.
  const byId = (id) => document.getElementById(id);
  MCO.initStepper({ prev: byId('btn-date-prev'), next: byId('btn-date-next'),
    onStep: (d) => setDate(MCO.shiftDate(activeDate, d)) });

  function updateHourReadout() {
    hourReadout.textContent = `${MCO.pad2(activeHour)}:00`;
  }
  function clampHour() {
    const last = MCO.lastCompleteHourMT();
    if (activeDate === last.date && activeHour > last.hour) activeHour = last.hour;
    if (activeDate > last.date) { activeDate = last.date; dateInput.value = activeDate; }
    updateHourReadout();
  }
  function stepHour(delta) {
    let h = activeHour + delta;
    let d = activeDate;
    if (h > 23) { h = 0; d = MCO.shiftDate(d, 1); }
    if (h < 0)  { h = 23; d = MCO.shiftDate(d, -1); }
    const last = MCO.lastCompleteHourMT();
    if (d > last.date || (d === last.date && h > last.hour)) {
      MCO.showToast('That hour isn\'t complete yet');
      return;
    }
    if (d < earliestDate) { MCO.showToast(`Earliest available date: ${MCO.formatDateStr(earliestDate)}`); return; }
    activeHour = h;
    if (d !== activeDate) { activeDate = d; dateInput.value = d; }
    updateHourReadout();
    render();
    writeUrl();
  }
  MCO.initStepper({ prev: byId('btn-hour-prev'), next: byId('btn-hour-next'),
    onStep: (d) => stepHour(d) });

  // ── Units toggle ─────────────────────────────────────────────────────────
  function syncUnitsUI() {
    for (const b of document.querySelectorAll('.seg-btn[data-units]')) {
      b.setAttribute('aria-pressed', b.dataset.units === activeUnits ? 'true' : 'false');
    }
  }
  for (const btn of document.querySelectorAll('.seg-btn[data-units]')) {
    btn.addEventListener('click', () => {
      if (btn.dataset.units === activeUnits) return;
      activeUnits = btn.dataset.units;
      MCO.lsSet('mco-explorer-units', activeUnits);
      if (scaleLocked()) {
        scaleOverride = scaleOverride.ramp
          ? { ramp: scaleOverride.ramp, rev: scaleOverride.rev }  // keep the ramp choice
          : null;
        MCO.showToast('Custom scale range cleared — units changed');
      }
      syncUnitsUI();
      render();
      writeUrl();
    });
  }

  // ── Sub-network chips ────────────────────────────────────────────────────
  function buildFilterUI() {
    const byNet = {};
    for (const s of stations) {
      if (!s.sub_network) continue;
      byNet[s.sub_network] = (byNet[s.sub_network] || 0) + 1;
    }
    const allNetworks = Object.keys(byNet).sort();
    subnetFiltersEl.innerHTML = '';
    for (const net of allNetworks) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mco-chip';
      chip.dataset.network = net;
      chip.setAttribute('aria-pressed', activeNetworks.has(net) ? 'true' : 'false');
      chip.title = NETWORK_DESC[net] || `Show or hide ${net} stations`;
      const lbl = document.createElement('span');
      lbl.textContent = net;
      const count = document.createElement('span');
      count.className = 'mco-chip-count';
      count.textContent = String(byNet[net] || 0);
      chip.append(lbl, ' ', count);
      chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) activeNetworks.add(net);
        else    activeNetworks.delete(net);
        MCO.lsSet('mco-explorer-networks', JSON.stringify([...activeNetworks]));
        applyDotFilters();
        render({ background: true });   // recompute scale domain for visible nets
        writeUrl();
      });
      subnetFiltersEl.appendChild(chip);
    }
  }

  // ── Labels toggle ────────────────────────────────────────────────────────
  const labelsBtn = document.getElementById('btn-labels');
  labelsBtn.setAttribute('aria-pressed', labelsOn ? 'true' : 'false');
  labelsBtn.addEventListener('click', () => {
    labelsOn = !labelsOn;
    labelsBtn.setAttribute('aria-pressed', labelsOn ? 'true' : 'false');
    MCO.lsSet('mco-explorer-labels', labelsOn ? 'on' : 'off');
    for (const lid of ['dots-label', 'spider-label']) {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', labelsOn ? 'visible' : 'none');
    }
    writeUrl();
  });

  // ── Legend collapse ──────────────────────────────────────────────────────
  const legendEl        = document.getElementById('legend');
  const legendToggleBtn = document.getElementById('legend-toggle-btn');
  const _legendUrlChoice = getLower('legend');
  const _legendSaved = MCO.lsGet('mco-explorer-legend');
  let legendCollapsed =
    _legendUrlChoice === 'collapsed' ? true :
    _legendUrlChoice === 'open'      ? false :
    _legendSaved === 'collapsed'     ? true :
    _legendSaved === 'expanded'      ? false :
    // Expanded by default everywhere: the legend sits in the sidebar (a drawer on
    // compact viewports) rather than over the map, so collapsing it no longer
    // buys any map back.
    false;
  function setLegendCollapsed(collapsed, { persist = true } = {}) {
    legendCollapsed = !!collapsed;
    legendEl.classList.toggle('collapsed', legendCollapsed);
    legendToggleBtn.setAttribute('aria-expanded', legendCollapsed ? 'false' : 'true');
    legendToggleBtn.setAttribute('aria-label', legendCollapsed ? 'Expand legend' : 'Collapse legend');
    if (persist) MCO.lsSet('mco-explorer-legend', legendCollapsed ? 'collapsed' : 'expanded');
    updateLegendTitle();   // the collapsed title carries the hidden-stale count
  }
  setLegendCollapsed(legendCollapsed, { persist: false });
  function toggleLegend() {
    setLegendCollapsed(!legendCollapsed);
    writeUrl();
  }
  legendToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();   // the header row toggles too — don't double-fire
    toggleLegend();
  });
  // The whole header row is a natural click target, not just the 22px chevron.
  document.getElementById('legend-header').addEventListener('click', toggleLegend);
  // Rotating a phone re-applies the small-screen default — but never overrides a
  // choice the user made. Was a one-shot matchMedia read, so landscape used to
  // inherit portrait's decision and overflow the map.


  // ── Scale editor (click the legend gradient) ─────────────────────────────
  const scaleModal    = document.getElementById('scale-modal');
  const scaleRampList = document.getElementById('scale-ramp-list');
  const scaleRevCb    = document.getElementById('scale-rev');
  const scaleMinIn    = document.getElementById('scale-min');
  const scaleMidIn    = document.getElementById('scale-mid');
  const scaleMaxIn    = document.getElementById('scale-max');
  const scaleHintEl   = document.getElementById('scale-hint');

  // Radio rows with gradient swatches — ramp names alone mean nothing.
  for (const g of RAMP_GROUPS) {
    const head = document.createElement('div');
    head.className = 'scale-ramp-group';
    head.textContent = g.label;
    scaleRampList.appendChild(head);
    for (const r of g.ramps) {
      const row = document.createElement('label');
      row.className = 'scale-ramp-opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'scale-ramp';
      input.value = r;
      const name = document.createElement('span');
      name.className = 'scale-ramp-name';
      name.textContent = r;
      const strip = document.createElement('span');
      strip.className = 'scale-ramp-strip';
      strip.setAttribute('aria-hidden', 'true');
      strip.style.backgroundImage = rampGradientCSS(r);
      row.append(input, name, strip);
      scaleRampList.appendChild(row);
    }
  }
  function currentEditorRamp() {
    return scaleRampList.querySelector('input[name="scale-ramp"]:checked')?.value || 'YlGnBu';
  }
  function setEditorRamp(name) {
    const input = scaleRampList.querySelector(`input[value="${name}"]`);
    if (input) input.checked = true;
  }
  scaleRampList.addEventListener('change', paintScalePreview);

  function rampGradientCSS(name, rev = false) {
    let stops = RAMPS[name] || RAMPS.YlGnBu;
    if (rev) stops = [...stops].reverse();
    const parts = stops.map((c, i) => `${c} ${(i / (stops.length - 1) * 100).toFixed(1)}%`);
    return `linear-gradient(to right, ${parts.join(', ')})`;
  }
  function paintScalePreview() {
    document.getElementById('scale-preview').style.backgroundImage =
      rampGradientCSS(currentEditorRamp(), scaleRevCb.checked);
  }

  function openScaleEditor() {
    if (!_lastRender) return;
    const { entry, unit, scale } = _lastRender;
    document.getElementById('scale-modal-var').textContent =
      unit ? `${entry.label} [${unit}]` : entry.label;
    setEditorRamp(scaleOverride?.ramp || entry.scale.ramp);
    scaleRevCb.checked = scaleOverride?.ramp !== undefined
      ? !!scaleOverride.rev : !!entry.scale.rev;
    const [lo, hi] = scale.displayDomain;
    scaleMinIn.placeholder = fmtScaleLimit(lo);
    scaleMaxIn.placeholder = fmtScaleLimit(hi);
    scaleMinIn.value = scaleLocked() ? String(scaleOverride.min) : '';
    scaleMaxIn.value = scaleLocked() ? String(scaleOverride.max) : '';
    scaleMidIn.value = Number.isFinite(scaleOverride?.mid) ? String(scaleOverride.mid) : '';
    for (const el of scaleModal.querySelectorAll('.scale-unit')) {
      el.textContent = unit ? `(${unit})` : '';
    }
    const fixed = !!entry.scale.domain;
    const isLog = !!entry.scale.log;
    scaleMinIn.disabled = scaleMaxIn.disabled = fixed;
    scaleMidIn.disabled = fixed || isLog;
    scaleHintEl.textContent =
      fixed ? 'This variable uses a fixed range — only the ramp can change.' :
      isLog ? 'Logarithmic scale: min and max must be greater than 0.' : '';
    paintScalePreview();
    closeNavDrawer();   // its inert page would include the dialog
    scaleModal.showModal();
  }
  legendGradientBtn.addEventListener('click', openScaleEditor);
  scaleRevCb.addEventListener('change', paintScalePreview);
  scaleModal.addEventListener('click', (e) => {
    if (e.target === scaleModal || e.target.dataset.closeModal !== undefined) scaleModal.close();
  });
  // Back to the strip, or to ☰ when the strip went away with the closed drawer.
  scaleModal.addEventListener('close', () =>
    (legendGradientBtn.getClientRects().length ? legendGradientBtn : navRailToggle).focus());

  document.getElementById('scale-apply').addEventListener('click', () => {
    const entry = REGISTRY_BY_KEY.get(activeVar);
    const fixed = !!entry.scale.domain;
    const isLog = !!entry.scale.log;
    const o = {};
    if (currentEditorRamp() !== entry.scale.ramp || scaleRevCb.checked !== !!entry.scale.rev) {
      o.ramp = currentEditorRamp();
      o.rev = scaleRevCb.checked;
    }
    const minRaw = scaleMinIn.value.trim(), maxRaw = scaleMaxIn.value.trim();
    const midRaw = scaleMidIn.value.trim();
    if (!fixed && (minRaw !== '' || maxRaw !== '')) {
      const min = parseFloat(minRaw), max = parseFloat(maxRaw);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        scaleHintEl.textContent = 'Enter both min and max, or clear both for automatic.';
        return;
      }
      if (min >= max) { scaleHintEl.textContent = 'Min must be less than max.'; return; }
      if (isLog && min <= 0) { scaleHintEl.textContent = 'Logarithmic scale: min must be greater than 0.'; return; }
      o.min = min;
      o.max = max;
    }
    if (!fixed && !isLog && midRaw !== '') {
      const mid = parseFloat(midRaw);
      const lo = Number.isFinite(o.min) ? o.min : -Infinity;
      const hi = Number.isFinite(o.max) ? o.max : Infinity;
      if (!Number.isFinite(mid) || mid <= lo || mid >= hi) {
        scaleHintEl.textContent = 'Midpoint must sit between min and max.';
        return;
      }
      o.mid = mid;
    }
    scaleOverride = Object.keys(o).length ? o : null;
    scaleModal.close();
    render({ background: true });
    writeUrl();
  });
  document.getElementById('scale-reset').addEventListener('click', () => {
    scaleOverride = null;
    scaleModal.close();
    MCO.showToast('Scale reset to automatic');
    render({ background: true });
    writeUrl();
  });

  // ── Scale lock (pin) ─────────────────────────────────────────────────────
  legendPinBtn.addEventListener('click', (e) => {
    e.stopPropagation();   // sits inside the collapsing header row
    toggleScaleLock();
  });
  function toggleScaleLock() {
    if (scaleLocked()) {
      const { ramp, rev } = scaleOverride;
      scaleOverride = ramp ? { ramp, rev } : null;
      MCO.showToast('Scale unlocked — range follows the data again');
    } else if (_lastRender) {
      const [lo, hi] = _lastRender.scale.displayDomain;
      scaleOverride = { ...(scaleOverride || {}), min: lo, max: hi };
      MCO.showToast('Scale locked — it will stay put as you change dates');
    }
    // Reflect the new state immediately — the render below may wait on a fetch.
    legendPinBtn.setAttribute('aria-pressed', scaleLocked() ? 'true' : 'false');
    render({ background: true });   // data is cached; just recolor + relabel
    writeUrl();
  }

  // ── Search ───────────────────────────────────────────────────────────────
  const SEARCH_MAX_RESULTS = 8;

  // The combobox is the kit's MCO.initSearchBox (0.8.0, the APG pattern on the
  // dashboard's model): roles and aria-* on the field and list, ranked matching
  // (name, id, word starts, typos), Up/Down/Home/End/Enter/Esc, a polite
  // debounced count, and the "No matches" note as a disabled option.
  // Esc closes the list and restores the text, clears it on a second press,
  // and lets the third through to the page (which closes the detail).
  const searchBox = MCO.initSearchBox({
    input: searchInput, listbox: searchDropdown,
    items: () => stations.map(s => ({ id: s.station, label: s.name, meta: `${s.station} · ${s.sub_network || '—'}` })),
    value: () => _selectedStation,
    onSelect: (id) => selectStation(id),
    label: 'Stations', limit: SEARCH_MAX_RESULTS,
  });
  function populateSearch() { searchBox.refresh(); }

  function selectStation(stationId) {
    // Hand focus back to the field when the detail closes; on a phone the
    // field is in the drawer, which closes now, so the bar's search button
    // takes it instead (MCO.initNavRail: "hands the toggle to whatever opens
    // next").
    if (navRail.isOpen()) {
      navRail.close({ restoreFocus: false });
      _popupFocusReturn = navRail.isDrawerMode() ? searchToggle : navRailToggle;
    } else {
      _popupFocusReturn = searchInput;
    }
    flyToAndOpen(stationId);
  }

  // Search picks, the sr-table and the ?station= deep link: the kit's
  // MCO.map.flyToAndOpen (0.21.0) opens the detail once the map is idle with
  // the station in view, rather than on the first moveend (which can fire
  // before the camera arrives). A station on a hidden network turns its
  // network back on first.
  function flyToAndOpen(stationId, openOpts = {}) {
    const s = stationById.get(stationId);
    if (!s) { MCO.showToast('Station not found'); return; }
    coloc.close();
    MCO.map.flyToAndOpen(map, {
      center: [s.longitude, s.latitude],
      zoom: SEARCH_FLY_ZOOM, speed: SEARCH_FLY_SPEED,
      ensureVisible: () => {
        if (!s.sub_network || activeNetworks.has(s.sub_network)) return;
        activeNetworks.add(s.sub_network);
        MCO.lsSet('mco-explorer-networks', JSON.stringify([...activeNetworks]));
        for (const chip of subnetFiltersEl.querySelectorAll('.mco-chip')) {
          if (chip.dataset.network === s.sub_network) chip.setAttribute('aria-pressed', 'true');
        }
        applyDotFilters();
        render({ background: true });   // recompute colocation for the re-enabled network
      },
      open: () => openPopupFor(stationId, [s.longitude, s.latitude], openOpts),
    });
  }

  // ── Popup ────────────────────────────────────────────────────────────────
  function stationRecord(stationId) {
    // Current variable's value record for the popup/tooltip, from the last render.
    return _propsById.get(stationId) || null;
  }

  // The detail body, built with DOM APIs and textContent (HOUSE-STYLE §7, kit
  // 0.8.0): no API value is ever parsed as HTML, escaped or not. Same markup
  // and classes as the string builder it replaces, so .pop-* styling, the peek
  // measurement and the carousel wiring are unchanged. Not MCO.map.popupContent:
  // that is a title/facts/actions popup shell, and this panel carries a value
  // block, sibling stations and a photo carousel.
  function h_(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function popupDOM(stationId) {
    const frag = document.createDocumentFragment();
    const s = stationById.get(stationId);
    if (!s) return frag;
    const rec = stationRecord(stationId);
    const lr = _lastRender;
    const elev = (typeof s.elevation === 'number')
      ? (activeUnits === 'us' ? `${Math.round(s.elevation * 3.28084)} ft` : `${Math.round(s.elevation)} m`)
      : '—';
    const installed = (typeof s.date_installed === 'number') ? MCO.formatDateMT(s.date_installed) : '—';

    // The station name is the kit sheet's title (openSheetFor); the body
    // starts with the id and county.
    const sub = h_('div', 'pop-sub', `${s.station}${s.county ? ` · ${s.county} County` : ''}`);
    const badgeRow = h_('div');
    badgeRow.style.marginTop = '6px';
    badgeRow.appendChild(h_('span', 'pop-badge', s.sub_network || '—'));
    frag.append(sub, badgeRow);

    if (lr && rec) {
      const block = h_('div', 'pop-value');
      const num = h_('div', 'pop-value-num mco-num-display');
      let timeLine = '', accent = 'var(--accent-line)';
      if (rec.cat === 'nodata' || rec.value == null) {
        num.textContent = '—';
        timeLine = 'No data for this selection';
      } else {
        // Compass variables read as points; degrees ride along for precision.
        const unitPart = lr.entry.fmt === 'compass' ? `${Math.round(rec.value)}°` : (lr.unit || '');
        num.append(lr.fmt(rec.value), h_('span', 'pop-unit', unitPart));
        if (rec.color && rec.cat === 'ok') accent = rec.color;
        if (rec.dt) {
          timeLine = activeMode === 'daily' ? MCO.formatDateMT(rec.dt) : MCO.formatStampMT(rec.dt);
          if (rec.cat === 'stale') timeLine += ' · stale';
        }
      }
      block.style.setProperty('--pop-accent', accent);
      // Peek on a phone shows the sheet head down to this block (the kit
      // measures [data-peek]): the lightweight readout hover gives a mouse.
      block.dataset.peek = '';
      block.append(h_('div', 'pop-value-var', lr.entry.label), num);
      if (timeLine) block.appendChild(h_('div', 'pop-value-time', timeLine));
      frag.appendChild(block);
    }

    const meta = h_('div', 'pop-meta');
    for (const [k, v] of [['Elevation:', elev], ['Installed:', installed]]) {
      const row = h_('div');
      row.append(h_('strong', null, k), ` ${v}`);
      meta.appendChild(row);
    }
    frag.appendChild(meta);

    // Co-located stations, reachable without the pointer-only spider. One row
    // per sibling rather than inline links: on touch the canvas spider is a
    // poor affordance, so this list is the primary way across.
    const sibs = coloc.siblings(stationId);
    if (sibs.length) {
      const box = h_('div', 'pop-siblings');
      box.appendChild(h_('div', 'pop-siblings-label', 'Also at this site'));
      for (const m of sibs) {
        const b = h_('button', 'pop-sibling-link');
        b.type = 'button';
        b.dataset.station = m.station;
        b.append(h_('span', 'pop-sibling-name', m.name), h_('span', 'pop-sibling-net', m.sub_network || '—'));
        box.appendChild(b);
      }
      frag.appendChild(box);
    }

    const links = h_('div', 'pop-links');
    for (const [label, href] of [['Station dashboard →', DASH_URL(stationId)],
                                 ['Latest data (API) →', `${API}/latest/?stations=${encodeURIComponent(stationId)}`]]) {
      const a = h_('a', null, label);
      a.href = href; a.target = '_blank'; a.rel = 'noopener';
      links.appendChild(a);
    }
    frag.appendChild(links);
    const car = carouselShell(stationId);
    if (car) frag.appendChild(car);
    return frag;
  }

  // The photo frame is reserved at full height from the first paint (never
  // `hidden`), so filling it in later can't resize the popup. Omitted outright
  // only when we already KNOW there's no photo. Static, author-written markup
  // (no values), so a template is fine here.
  const CAROUSEL_TPL = document.createElement('template');
  CAROUSEL_TPL.innerHTML = `
      <div class="pop-carousel" data-state="loading">
        <div class="pop-carousel-frame">
          <img class="pop-carousel-img" alt="">
          <button type="button" class="pop-carousel-btn prev" aria-label="Previous photo" hidden>&#8249;</button>
          <button type="button" class="pop-carousel-btn next" aria-label="Next photo" hidden>&#8250;</button>
        </div>
        <div class="pop-carousel-caption" role="status">
          <span class="pop-carousel-dir"></span>
          <span class="pop-carousel-counter"></span>
        </div>
      </div>`;
  function carouselShell(stationId) {
    if (photoFrameWanted(stationId) === false) return null;
    return CAROUSEL_TPL.content.firstElementChild.cloneNode(true);
  }

  // ── Photo carousel ───────────────────────────────────────────────────────
  // Everything photo-related comes from the Mesonet archive bucket, served
  // through data2.climate.umt.edu: the camera registry (schedule.json), the
  // monthly manifests, and the images themselves as immutable WebP:
  //   photos/webp/large/{station}/{station}_{DIR}_{YYYYMMDD}T{HHMMSS}Z.webp
  // The timestamp is the capture SLOT in UTC — a local wall-clock time such as
  // 09:00 or 15:00, so it shifts an hour at each DST change. Nothing serves a
  // time-matched photo any more, so the app works out which frames exist and
  // picks the one nearest the time on screen. Two sources, by mode:
  //   Latest        S3 ListObjectsV2 on the bucket (CORS-open), one UTC day per
  //                 direction: ~2 KB each, always the live state. The edge
  //                 forwards only `prefix` — `max-keys`/`start-after` are
  //                 dropped — which is why a listing is narrowed to a day.
  //   Hourly/Daily  the archive's per-station MONTHLY manifest CSV, one fetch
  //                 (70-250 KB) that then covers every day in the month, so
  //                 scrubbing through days costs nothing more.
  const PHOTO_BASE = 'https://data2.climate.umt.edu/mesonet';
  // Backup: data2's CloudFront default domain serves the same paths. Swap it in
  // if data2's certificate lapses again (the CSP already allows both).
  // const PHOTO_BASE = 'https://d1s8jav5n0eyyf.cloudfront.net/mesonet';
  const PHOTO_PREFIX = 'photos/webp/large';
  const PHOTO_TTL = 5 * 60_000;      // re-check anything still changing on the refresh cadence

  // Camera registry: which stations have a camera, which directions it shoots
  // now (and ever has), and since when. Comes from the archive's own schedule
  // file (~5 KB on the wire) — the API's /photos/ metadata lags it: nine
  // cameras live in September 2026 were missing there, so their popups never
  // asked for a photo at all. The API stays as a fallback if the archive is
  // unreachable. One fetch serves all popups; a failure clears the cache so a
  // later popup retries.
  const PHOTO_LABELS = { E: 'East', N: 'North', S: 'South', W: 'West', SNOW: 'Snow', NS: 'North Sky', SS: 'South Sky' };
  let _photoMetaPromise = null;
  let _photoMetaMap = null;          // resolved value, or null while still pending
  function fetchPhotoMeta() {
    if (!_photoMetaPromise) {
      _photoMetaPromise = MCO.fetchJSON(`${PHOTO_BASE}/photos/schedule/schedule.json`, { timeoutMs: 20_000 })
        .then(metaFromSchedule)
        .catch(() => MCO.fetchJSON(`${API}/photos/?type=json`).then(metaFromApi))
        .then(map => (_photoMetaMap = map))
        .catch(err => { _photoMetaPromise = null; throw err; });
    }
    return _photoMetaPromise;
  }
  // { start: 'YYYY-MM-DD', dirs: [{code, label}] (what the camera shoots NOW —
  //   what Latest lists), labels: {code → label} (every direction it ever had —
  //   what Hourly/Daily captions need) }
  function metaFromSchedule(doc) {
    const label = (code, view) => (view && view !== code) ? view : (PHOTO_LABELS[code] || code);
    return new Map(Object.entries(doc.stations || {}).map(([id, st]) => {
      const labels = {};
      for (const p of st.periods || []) for (const [code, v] of Object.entries(p.views || {})) labels[code] = label(code, v.view);
      const current = (st.periods || []).find(p => p.until === null) || (st.periods || []).at(-1);
      const dirs = Object.keys(current?.views || {}).map(code => ({ code, label: labels[code] }));
      return [id, { start: st.first_month ? `${st.first_month}-01` : null, dirs, labels }];
    }));
  }
  function metaFromApi(rows) {
    return new Map(rows.map(r => {
      const dirs = (r['Photo Directions'] || []).map(d => {
        const m = d.match(/^(\S+)\s*\(([^)]*)\)/);   // "NS (North Sky)" → NS / North Sky
        return { code: (m ? m[1] : d).toUpperCase(), label: m ? m[2] : d };
      });
      return [r['Station ID'], { start: r['Photo Start Date'] || null, dirs, labels: Object.fromEntries(dirs.map(d => [d.code, d.label])) }];
    }));
  }

  // Will this station show a photo frame? Answered synchronously so popupDOM
  // can reserve the frame's space in the FIRST paint — a frame that appears (or
  // vanishes) later changes the popup's height and makes MapLibre re-anchor it
  // while the user is reading. boot() warms the cache, so by the time anyone
  // clicks a dot this returns a real boolean; null means "not known yet", in
  // which case we reserve the space and correct it once (see markCarousel).
  function photoFrameWanted(stationId) {
    if (!_photoMetaMap) return null;
    const m = _photoMetaMap.get(stationId);
    if (!m || !m.dirs.length) return false;
    if (activeMode !== 'latest' && m.start && activeDate < m.start) return false;
    return true;
  }

  // Wall-clock time in TZ → UTC instant. Intl gives the zone's offset at a
  // guessed instant; a second pass corrects the guess when it straddles a DST
  // change. Offsets are whole minutes, so the sub-second noise in `ms` is
  // rounded away.
  function mtToUtcMs(dateStr, hour) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const wall = Date.UTC(y, mo - 1, d, hour);
    const offAt = ms => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      }).formatToParts(new Date(ms));
      const g = t => +parts.find(p => p.type === t).value;
      const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
      return Math.round((asUtc - ms) / 60_000) * 60_000;
    };
    let ms = wall - offAt(wall);
    const off2 = offAt(ms);
    if (wall - off2 !== ms) ms = wall - off2;
    return ms;
  }
  const utcYmd = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
  const utcMidnight = ms => ms - (ms % 86_400_000);
  const slotPath = (stationId, dir, ms) =>
    `${PHOTO_PREFIX}/${stationId}/${stationId}_${dir}_${new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '')}.webp`;

  // Promise cache with an optional expiry, keyed by caller. Failures evict
  // themselves so the next popup retries.
  const _photoCache = new Map();
  function photoCached(key, ttl, make) {
    const hit = _photoCache.get(key);
    if (hit && (ttl === Infinity || Date.now() - hit.at < ttl)) return hit.promise;
    const promise = make().catch(err => { _photoCache.delete(key); throw err; });
    _photoCache.set(key, { promise, at: Date.now() });
    return promise;
  }
  const fetchArchive = (url, timeoutMs = 20_000) =>
    fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(res => {
      if (res.status === 404) return null;                      // nothing there — not an error
      if (!res.ok) throw new Error(`photo archive ${res.status}`);
      return res.text();
    });

  // ─ Latest: bucket listings ─
  // One UTC day for one direction. A past day never changes, so it lives for
  // the session; the current UTC day gains a frame every slot.
  function listPhotoDay(stationId, dir, ymd) {
    const ttl = ymd === utcYmd(Date.now()) ? PHOTO_TTL : Infinity;
    return photoCached(`list|${stationId}|${dir}|${ymd}`, ttl, async () => {
      const prefix = `${PHOTO_PREFIX}/${stationId}/${stationId}_${dir}_${ymd}`;
      const xml = await fetchArchive(`${PHOTO_BASE}/?list-type=2&prefix=${encodeURIComponent(prefix)}`);
      const frames = [];
      for (const m of (xml || '').matchAll(/<Key>([^<]+)<\/Key>/g)) {
        const t = m[1].match(/_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.webp$/);
        if (!t) continue;
        frames.push({ dir, ms: Date.UTC(+t[1], t[2] - 1, +t[3], +t[4], +t[5], +t[6]), url: `${PHOTO_BASE}/${m[1]}` });
      }
      return frames;
    });
  }
  // Every frame for one direction between two instants, merged from the UTC
  // days those instants span. A day whose listing fails contributes nothing
  // rather than sinking the carousel.
  async function listedFramesBetween(stationId, dir, fromMs, toMs) {
    const days = [];
    for (let d = utcMidnight(fromMs); d < toMs; d += 86_400_000) days.push(utcYmd(d));
    const lists = await Promise.all(days.map(ymd => listPhotoDay(stationId, dir, ymd).catch(() => [])));
    return lists.flat().filter(f => f.ms >= fromMs && f.ms < toMs);
  }

  // ─ Hourly/Daily: monthly manifests ─
  // photos/manifest/{station}/{station}_{YYYY-MM}.csv lists every capture of a
  // LOCAL month for every direction: token, view label, capture time, slot,
  // and the paths. Rows are keyed to the local date, so a Mountain day never
  // straddles two files. Two quirks handled here: the `webp_large` column is
  // blank for many frames whose WebP does exist (the plan-period hourly frames,
  // and the newer midday slot — the manifest's slot matching lags the
  // schedule), so the path is derived from the capture time snapped to the
  // nearest hour whenever the column is empty; and a capture more than 30 min
  // from any hour has no WebP at all (the archive's `snap_max_seconds`).
  // The whole tree is rewritten on every publish, so a past month is not
  // immutable — but it is stable enough to hold for the session; only a month
  // that is still being written is re-read, when the day on screen is today.
  function monthManifest(stationId, ym, fresh) {
    return photoCached(`manifest|${stationId}|${ym}`, fresh ? PHOTO_TTL : Infinity, async () => {
      const csv = await fetchArchive(`${PHOTO_BASE}/photos/manifest/${stationId}/${stationId}_${ym}.csv`, 30_000);
      if (!csv) return [];
      const lines = csv.trim().split('\n');
      const col = Object.fromEntries(lines[0].trim().split(',').map((h, i) => [h, i]));
      const frames = new Map();                                // url → frame (dedupes a re-shot slot)
      for (const line of lines.slice(1)) {
        const f = line.trim().split(',');
        const dir = f[col.token];
        const captured = Date.parse(f[col.captured_utc]);
        if (!dir || Number.isNaN(captured)) continue;
        let ms = f[col.slot_utc] ? Date.parse(f[col.slot_utc]) : Math.round(captured / 3_600_000) * 3_600_000;
        if (Math.abs(ms - captured) > 30 * 60_000) continue;
        const path = f[col.webp_large] || slotPath(stationId, dir, ms);
        if (!frames.has(path)) frames.set(path, { dir, ms, url: `${PHOTO_BASE}/${path}`, view: f[col.view] || '' });
      }
      return [...frames.values()];
    });
  }

  // Which frames the time on screen calls for. Latest: the newest frame from
  // the past day (the old API's rule — a camera dark for longer shows nothing).
  // Hourly: the frame nearest the end of the selected hour, from anywhere in
  // that day — legacy cameras shoot only 9 AM and 3 PM, and the caption
  // carries the real capture time. Daily: the frames nearest 9 AM and 3 PM,
  // each within three hours of its mark so the same photo can't be both.
  function photoTargets() {
    const H = 3_600_000;
    if (activeMode === 'latest') {
      const now = Date.now();
      return { from: now - 24 * H, to: now + H, newest: true, picks: [] };
    }
    const dayStart = mtToUtcMs(activeDate, 0);
    const dayEnd = mtToUtcMs(MCO.shiftDate(activeDate, 1), 0);
    if (activeMode === 'hourly') {
      const target = activeHour < 23 ? mtToUtcMs(activeDate, activeHour + 1) : dayEnd;
      return { from: dayStart, to: dayEnd, picks: [{ ms: target, within: Infinity }] };
    }
    return { from: dayStart, to: dayEnd, picks: [
      { ms: mtToUtcMs(activeDate, 9),  within: 3 * H },
      { ms: mtToUtcMs(activeDate, 15), within: 3 * H },
    ] };
  }

  // Frames for every direction the station has, in the API's direction order
  // (any direction the manifest knows but the API doesn't goes last), each
  // already sorted by time.
  async function photoFramesByDir(stationId, meta, spec) {
    let all;
    if (activeMode === 'latest') {
      all = (await Promise.all(meta.dirs.map(d => listedFramesBetween(stationId, d.code, spec.from, spec.to)))).flat();
    } else {
      const month = await monthManifest(stationId, activeDate.slice(0, 7), activeDate === MCO.todayMT()).catch(() => []);
      all = month.filter(f => f.ms >= spec.from && f.ms < spec.to);
    }
    const order = new Map(meta.dirs.map((d, i) => [d.code, i]));
    const byDir = new Map();
    for (const f of all) {
      if (!byDir.has(f.dir)) byDir.set(f.dir, []);
      byDir.get(f.dir).push(f);
    }
    return [...byDir.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
      .map(([dir, frames]) => ({
        label: meta.labels[dir] || frames.find(f => f.view)?.view || PHOTO_LABELS[dir] || dir,
        frames: frames.sort((a, b) => a.ms - b.ms),
      }));
  }

  function pickPhotoFrames(frames, spec, label) {
    if (!frames.length) return [];
    const caption = f => `${label} · ${photoStamp(f.ms)}`;
    if (spec.newest) { const f = frames[frames.length - 1]; return [{ ...f, caption: caption(f) }]; }
    const out = [];
    for (const p of spec.picks) {
      let best = null;
      for (const f of frames) if (!best || Math.abs(f.ms - p.ms) < Math.abs(best.ms - p.ms)) best = f;
      if (!best || Math.abs(best.ms - p.ms) > p.within) continue;
      if (out.some(o => o.url === best.url)) continue;
      out.push({ ...best, caption: caption(best) });
    }
    return out;
  }

  // Capture time in Mountain Time; the date is added only when it isn't the
  // day already on screen (Latest showing yesterday's last frame).
  function photoStamp(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
    const day = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const onScreen = activeMode === 'latest' ? MCO.todayMT() : activeDate;
    if (day === onScreen) return time;
    return `${d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}, ${time}`;
  }

  // Settle the reserved frame into a terminal state without changing the
  // container's height. Dropping the block entirely is the one case that can
  // resize it, so it only happens on the cold-start path — metadata not yet in
  // when the popup was built, which boot()'s prefetch makes vanishingly rare.
  function markCarousel(root, state) {
    if (!root) return;
    if (state === 'absent') { root.remove(); return; }
    root.dataset.state = state;
  }

  // `host` is a thunk returning the element that contains .pop-carousel, so the
  // anchored popup and the bottom sheet can share this verbatim. Each call
  // supersedes the previous one: refreshOpenPopup() rebuilds the body every
  // five minutes, and an older init still awaiting its listings must not wire
  // a second set of handlers onto the new frame.
  let _carouselGen = 0;
  async function initPhotoCarousel(host, stationId) {
    const gen = ++_carouselGen;
    const stale = () => gen !== _carouselGen || _selectedStation !== stationId;
    const rootNow = () => host()?.querySelector('.pop-carousel');
    let meta;
    try { meta = (await fetchPhotoMeta()).get(stationId); }
    catch { if (!stale()) markCarousel(rootNow(), 'none'); return; }
    if (stale()) return;
    const noPhoto = !meta || !meta.dirs.length ||
      (activeMode !== 'latest' && meta.start && activeDate < meta.start);
    if (noPhoto) { markCarousel(rootNow(), 'absent'); return; }

    const spec = photoTargets();
    const byDir = await photoFramesByDir(stationId, meta, spec);
    if (stale()) return;
    const root = rootNow();
    if (!root) return;
    const frames = byDir.flatMap(d => pickPhotoFrames(d.frames, spec, d.label)).map(f => ({ ...f, state: 'pending' }));
    if (!frames.length) { markCarousel(root, 'none'); return; }

    const img   = root.querySelector('.pop-carousel-img');
    const frame = root.querySelector('.pop-carousel-frame');
    const dirEl = root.querySelector('.pop-carousel-dir');
    const cntEl = root.querySelector('.pop-carousel-counter');
    let idx = 0;

    function show(i) {
      idx = (i + frames.length) % frames.length;
      const f = frames[idx];
      dirEl.textContent = f.caption;
      cntEl.textContent = `${idx + 1} / ${frames.length}`;
      img.alt = f.state === 'bad'
        ? 'No photo for this time'
        : `Station camera: ${f.caption}, photo ${idx + 1} of ${frames.length}`;
      frame.classList.toggle('unavailable', f.state === 'bad');
      img.classList.toggle('loading', f.state !== 'ok');
      if (f.state === 'bad') { img.removeAttribute('src'); return; }
      if (img.getAttribute('src') !== f.url) img.src = f.url;
    }
    img.addEventListener('load', () => {
      frames[idx].state = 'ok';
      img.classList.remove('loading');
    });
    img.addEventListener('error', () => {
      frames[idx].state = 'bad';
      // Every direction failed: keep the reserved box and say so, rather than
      // collapsing it and shifting everything below out from under the reader.
      if (frames.every(f => f.state === 'bad')) { markCarousel(root, 'none'); return; }
      show(idx + 1);   // auto-skip; each error removes a frame from rotation
    });
    root.querySelector('.prev').addEventListener('click', () => show(idx - 1));
    root.querySelector('.next').addEventListener('click', () => show(idx + 1));
    if (frames.length > 1) root.querySelectorAll('.pop-carousel-btn').forEach(b => b.hidden = false);
    markCarousel(root, 'ok');
    show(0);
  }

  // Flat padding, independent of what is open. The sidebar has its own column, so
  // its effect on the map already shows up in the container size; the detail panel
  // floats and must not influence the camera at all — that is what keeps the map
  // dead still when you click a station. Keeping this constant also means the
  // zoom-out spring-back always returns to the same framing.
  const FIT_PAD = { top: 24, bottom: 44, left: 24, right: 24 };
  function fitOpts() { return { padding: FIT_PAD, animate: false }; }

  // Re-fit only when the user is already looking at the whole state; if they have
  // zoomed into a region, a container resize must not yank them out of it.
  function refitIfAtExtent() {
    if (!_mapReady || fitZoom() === undefined) return;
    const atExtent = map.getZoom() <= fitZoom() + 0.1;
    zoomFloor.refresh();
    if (atExtent) map.fitBounds(MT_FIT_BOUNDS, { ...fitOpts(), animate: !MCO.reducedMotion() });
  }

  // Pan the minimum needed to get the selected dot out from under the panel, and
  // only if it is actually under it. A blanket pan on every open would move the
  // map on every click, which is the behaviour we deliberately removed.
  //
  // panBy([dx,dy]) moves the CAMERA, so content moves by (-dx,-dy): to push the
  // dot left, clear of a right-docked panel, dx must be positive.
  const REVEAL_MARGIN_PX = 44;
  function revealSelectedDot(ll) {
    if (!_sheetOpen || !ll) return;
    requestAnimationFrame(() => {
      if (!_sheetOpen) return;
      const panel = sheetEl.getBoundingClientRect();
      if (!panel.width || !panel.height) return;
      const c = map.getContainer().getBoundingClientRect();
      const pt = map.project(ll);
      const x = c.left + pt.x, y = c.top + pt.y;
      const M = REVEAL_MARGIN_PX;
      const nearPanel = x > panel.left - M && x < panel.right + M &&
                        y > panel.top - M && y < panel.bottom + M;
      if (!nearPanel) return;
      // Push along whichever edge the panel is docked to.
      const dx = MCO.viewport.isCompact() ? 0 : x - (panel.left - M);
      const dy = MCO.viewport.isCompact() ? y - (panel.top - M) : 0;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      map.panBy([dx, dy], { animate: !MCO.reducedMotion(), duration: 260 });
    });
  }

  function highlightSelectedDot() {
    if (!map.getLayer('dots-selected')) return;
    map.setFilter('dots-selected', ['==', ['get', 'station'], _selectedStation || '__none__']);
  }

  // One docked panel, two dock edges — bottom on compact viewports, right on
  // desktop: the kit's MCO.initSheet (0.21.0 adoption; the kit's sheet was
  // lifted from this app's own panel in 0.9.0). This replaced a MapLibre Popup
  // anchored to the dot, which sat on top of the map: with one open, 38% of
  // the surrounding dots were underneath it and simply unclickable. A docked
  // panel covers no dots at all, so any station can be selected while another
  // is showing, and the content swaps in place.
  // `fromHistory`: Back/Forward is re-applying a URL, so write nothing.
  // `replace`: open without a history entry (a deep link at boot).
  function openPopupFor(stationId, lngLat, { fromHistory = false, replace = false } = {}) {
    const s = stationById.get(stationId);
    if (!s) return;
    const ll = lngLat || [s.longitude, s.latitude];
    // Drill-down: the FIRST step from "no station" gets its own history entry;
    // switching stations while the panel is open replaces it, or every click
    // would flood the history (HOUSE-STYLE §4).
    const firstStep = !_sheetOpen;
    _selectedStation = stationId;
    openSheetFor(stationId);
    announcePopup(stationId);
    highlightSelectedDot();
    // No re-fit — the panel floats, so the scale never changes. The only camera
    // move is a targeted nudge when the dot you just picked would sit underneath
    // the panel; otherwise the map doesn't budge.
    revealSelectedDot(ll);
    if (fromHistory) return;
    if (firstStep && !replace) MCO.pushUrlState(viewParams(), { state: { mcoDetail: stationId } });
    else writeUrl();
  }

  // Keyboard and touch path to co-located stations (the canvas spider is
  // pointer-only): the sheet's "Also at this site" rows.
  function wireSiblingLinks(root) {
    if (!root) return;
    root.querySelectorAll('.pop-sibling-link').forEach(btn => {
      btn.addEventListener('click', () => openPopupFor(btn.dataset.station));
    });
  }

  function announcePopup(stationId) {
    const s = stationById.get(stationId);
    if (!s) return;
    const rec = stationRecord(stationId);
    const lr = _lastRender;
    let valPart = 'no data';
    if (rec && rec.value != null && lr) {
      valPart = lr.entry.fmt === 'compass'
        ? `${lr.entry.label} ${lr.fmt(rec.value)}, ${Math.round(rec.value)} degrees`
        : `${lr.entry.label} ${lr.fmt(rec.value)} ${lr.unit || ''}`;
    }
    MCO.announce(`${s.name} (${s.station}), ${s.sub_network || 'station'}, ${valPart}.`);
  }

  // Closing goes through the kit sheet (its ×, Esc, a drag below peek, or
  // this), which then calls onSheetClosed below. Closing a panel that opened
  // with its own history entry goes BACK to the entry before it, rather than
  // leaving a dead "station open" entry behind for Back to land on. The
  // popstate that follows only re-syncs the URL.
  let _expectPop = false;
  let _closingFromHistory = false;
  function closeDetail({ fromHistory = false } = {}) {
    if (!_sheetOpen) return;
    _closingFromHistory = fromHistory;
    sheet.close();
    _closingFromHistory = false;
  }
  function onSheetClosed() {
    _sheetOpen = false;
    _popupFocusReturn = null;
    if (!_selectedStation) return;
    _selectedStation = null;
    highlightSelectedDot();
    if (_closingFromHistory) return;
    if (history.state && history.state.mcoDetail) { _expectPop = true; history.back(); }
    else writeUrl();
  }

  // Back / Forward (MCO.onUrlState, kit 0.8.0). Only the station is ever
  // pushed, so it is the only thing to re-apply: Back closes the panel (focus
  // returns to what opened it, else the map), Forward reopens it. Other hash
  // changes (the skip link's #main) leave the station as it is.
  MCO.onUrlState((params) => {
    if (_expectPop) { _expectPop = false; writeUrl(); return; }
    const id = (params.get('station') || '').toLowerCase() || null;
    if (id && stationById.has(id)) {
      if (id !== _selectedStation || !_sheetOpen) openPopupFor(id, null, { fromHistory: true });
    } else if (_selectedStation) {
      closeDetail({ fromHistory: true });
    }
    // The entry Back/Forward landed on was written before the camera moved
    // (the reveal nudge, a pan while reading): re-sync it to what is on
    // screen, in place.
    writeUrl();
  });
  const closePopup = closeDetail;   // keep the existing call sites honest

  // ── Station sheet ────────────────────────────────────────────────────────
  // MCO.initSheet owns the detents, the drag and its keyboard twin (the grip),
  // focus (in to the title, back to the opener or the map), Esc through
  // MCO.escStack, inertness in the full detent on compact, and --sheet-h for
  // the kit's auto-lift of the toast and the bottom map controls.
  const sheet = MCO.initSheet({
    sheet: sheetEl,
    peekHeight: 'auto',
    fallbackFocus: map.getCanvas(),
    onState: (state) => { if (state === 'closed' && _sheetOpen) onSheetClosed(); },
  });
  function openSheetFor(stationId) {
    const s = stationById.get(stationId);
    if (!s) return;
    sheetTitleEl.textContent = s.name;
    sheetBodyEl.replaceChildren(popupDOM(stationId));
    // Touch gets the peek readout first — the analogue of hovering a dot.
    const opener = _popupFocusReturn && _popupFocusReturn.isConnected ? _popupFocusReturn : undefined;
    sheet.open(MCO.viewport.isTouch() ? 'peek' : 'full', { opener });
    _sheetOpen = true;
    initPhotoCarousel(() => sheetEl, stationId);
    wireSiblingLinks(sheetEl);
  }

  // ── Click & hover ────────────────────────────────────────────────────────
  // Colocated stations are the kit's MCO.map.colocation (0.21.0, extracted
  // from mesonet-status and cross-checked against this file's copy): one
  // marker with a count badge per site, fanned out as a spider on hover, or on
  // the first tap, which also opens the anchor's detail. It owns the click
  // dispatch and the spider's hover grace and Esc. includeHidden keeps every
  // station in the source (hidden ones as singles), because this app hides
  // networks and categories by layer filter, so a chip flips at once.
  const DOT_LAYERS    = ['dots-value', 'dots-stale', 'dots-nodata', 'dots-label'];
  const ANCHOR_LAYERS = [...DOT_LAYERS, 'stations-badge-disc', 'stations-badge'];
  const SPIDER_LAYERS = ['spider-layer', 'spider-label'];
  const HOVER_LAYERS  = [...SPIDER_LAYERS, ...ANCHOR_LAYERS];
  const coloc = MCO.map.colocation(map, {
    source: 'stations',
    rank: (s) => netRank(s.sub_network),
    visible: (s) => activeNetworks.has(s.sub_network) && catVisible(_catById.get(s.station)),
    includeHidden: true,
    properties: (s) => ({ ..._propsById.get(s.station) }),
    anchorLayers: ANCHOR_LAYERS,
    spiderLayers: SPIDER_LAYERS,
    onSelect: (id, info) => openPopupFor(id, info.lngLat),
    onEmpty: (e) => nearMiss(e),
  });

  // A fingertip is much bigger than a dot; a mouse pointer is precise but the
  // dots are only ~10px across, so a few px of slop stops near-misses from
  // reading as "click did nothing" (they'd hit empty map and close the panel).
  // The kit picks direct hits exactly as the tooltip does; only a click that
  // hit nothing comes here. A box query returns features in layer order, NOT
  // by distance, so they are sorted by distance before the layer preference.
  const TOUCH_SLOP_PX = 10;
  const MOUSE_SLOP_PX = 6;
  function nearMiss(e) {
    const layers = HOVER_LAYERS.filter(lid => map.getLayer(lid));
    const slop = MCO.viewport.isTouch() ? TOUCH_SLOP_PX : MOUSE_SLOP_PX;
    let feats = layers.length ? map.queryRenderedFeatures(
      [[e.point.x - slop, e.point.y - slop], [e.point.x + slop, e.point.y + slop]], { layers }) : [];
    if (!feats.length) { closePopup(); return; }
    const d2 = (ft) => {
      const p = map.project(ft.geometry.coordinates);
      return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
    };
    feats = [...feats].sort((a, b) => d2(a) - d2(b));
    const f = feats.find(x => SPIDER_LAYERS.includes(x.layer.id)) ||
              feats.find(x => x.layer.id === 'dots-value') || feats[0];
    const p = f.properties;
    if (!SPIDER_LAYERS.includes(f.layer.id) && p.colocationCount > 1) coloc.open(p.bucket);
    openPopupFor(p.station, f.geometry.coordinates.slice());
  }

  // The hover readout is the kit's MCO.map.initCursorTooltip (0.8.0): the
  // queryRenderedFeatures dispatcher, textContent lines, cursor+14 placement
  // flipped at the viewport edge, cursor: pointer, mouseout cleanup. Touch gets
  // nothing here: browsers synthesize a mousemove on tap, which would show it
  // under the finger, and the tap opens the sheet, whose peek IS the readout.
  const tooltipEl = document.getElementById('tooltip');
  MCO.map.initCursorTooltip(map, {
    element: tooltipEl,
    layers: HOVER_LAYERS,
    render: (f) => {
      if (MCO.viewport.isTouch()) return null;
      const props = f.properties;
      const lr = _lastRender;
      let line = null;
      if (lr) {
        const unit = lr.entry.fmt === 'compass'
          ? ` · ${Math.round(props.value)}°`
          : (lr.unit ? ` ${lr.unit}` : '');
        line = props.value != null && props.label
          ? `${props.label}${unit}${props.cat === 'stale' ? ' · stale' : ''}`
          : 'no data';
      }
      return { name: props.name, sub: props.station, line };
    },
  });


  // ── Control sidebar ──────────────────────────────────────────────────────
  // Controls live in ONE place in the DOM and get moved between the sidebar and
  // the compact nav drawer as the breakpoint changes. Moving (rather than
  // cloning) keeps every listener, aria-pressed sync and label association.
  let _sidebarReady = false;
  const sidebarEl     = document.getElementById('sidebar');
  const sidebarScroll = sidebarEl.querySelector('.sidebar-scroll');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const navControlsEl = document.querySelector('#navbar .controls');
  const navRailEl     = document.querySelector('#navbar .mco-rail');
  const navRailToggle = document.getElementById('btn-rail');
  const searchToggle  = document.getElementById('btn-search-toggle');
  const variableGroupEl = document.getElementById('variable-group');
  // The sidebar's groups (<details>), in their one order at every width. More
  // (units … help) follows them in the drawer; on desktop it is the bar's.
  const SECTION_IDS = ['sb-search', 'sb-networks', 'sb-time', 'sb-variable', 'sb-legend', 'sb-overlays'];
  const sections = SECTION_IDS.map(id => document.getElementById(id));
  const variableSection = document.getElementById('sb-variable');
  const moreHead = document.getElementById('more-head');
  const moreBody = document.getElementById('more-body');

  // ── Collapsible groups ──
  // Same groups, headings and order at every width; only their default
  // state differs. In the ☰ drawer (compact) Search, Networks, Time and
  // Variable start open and Legend, Overlays and More closed, so the drawer
  // fits a phone; in the desktop sidebar all start open. Each width class
  // remembers its own choices (mco-explorer-groups-compact / -wide),
  // re-validated on read like a URL parameter.
  const GROUP_NAMES = ['search', 'networks', 'time', 'variable', 'legend', 'overlays', 'more'];
  const GROUP_DEFAULTS = {
    compact: { search: true, networks: true, time: true, variable: true, legend: false, overlays: false, more: false },
    wide:    { search: true, networks: true, time: true, variable: true, legend: true,  overlays: true,  more: true },
  };
  const groupClass = () => (MCO.viewport.isCompact() ? 'compact' : 'wide');
  const groupKey = (cls) => `mco-explorer-groups-${cls}`;
  function readGroups(cls) {
    const out = { ...GROUP_DEFAULTS[cls] };
    let saved = null;
    try { saved = JSON.parse(MCO.lsGet(groupKey(cls)) || 'null'); } catch { saved = null; }
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const g of GROUP_NAMES) if (typeof saved[g] === 'boolean') out[g] = saved[g];
    }
    return out;
  }
  let _groupCls = null;
  let _applyingGroups = false;
  function groupEl(name) {
    return name === 'more' ? null : sections.find(sec => sec.dataset.group === name);
  }
  function isGroupOpen(name) {
    return name === 'more' ? moreHead.getAttribute('aria-expanded') === 'true' : groupEl(name).open;
  }
  function setMoreOpen(open) {
    moreHead.setAttribute('aria-expanded', open ? 'true' : 'false');
    moreBody.toggleAttribute('data-collapsed', !open);
  }
  function saveGroups() {
    if (_applyingGroups || !_groupCls) return;
    const state = {};
    for (const g of GROUP_NAMES) state[g] = isGroupOpen(g);
    MCO.lsSet(groupKey(_groupCls), JSON.stringify(state));
  }
  // Called from layoutControls(): restores the width class's states when the
  // class changes (and once at boot).
  function applyGroups() {
    const cls = groupClass();
    if (cls === _groupCls) return;
    _groupCls = cls;
    const state = readGroups(cls);
    _applyingGroups = true;
    for (const sec of sections) sec.open = state[sec.dataset.group];
    setMoreOpen(state.more);
    // <details> fires 'toggle' asynchronously; let those pass before saving again.
    setTimeout(() => { _applyingGroups = false; }, 0);
  }
  for (const sec of sections) sec.addEventListener('toggle', saveGroups);
  moreHead.addEventListener('click', () => {
    setMoreOpen(!isGroupOpen('more'));
    saveGroups();
  });
  // Opens a group so a control inside it can take focus (the / shortcut, the
  // bar's search button). Remembered, like a click on its heading.
  function openGroup(name) {
    const sec = groupEl(name);
    if (sec && !sec.open) sec.open = true;
  }

  // Desktop: remembered open/closed. On compact the column is gone and its
  // sections are in the nav drawer, which always starts closed.
  let sidebarOpen = (() => {
    const u = getLower('sidebar');
    if (u === 'open' || u === 'closed') return u === 'open';
    return MCO.lsGet('mco-explorer-sidebar') !== 'closed';
  })();

  // Where the variable picker sits: in the bar itself on a portrait phone
  // (the one hot control, MCO.initNavRail's compact bar), else in its section.
  let _pickerInBar = false;
  // Which container each control belongs to at the current breakpoint. Compact
  // (the kit's compact bar on a portrait phone, its rail on a landscape one):
  // every section goes into #nav-drawer, the right-hand drawer under the bar,
  // or beside the rail. Desktop: back to the sidebar column.
  function layoutControls() {
    const place = (el, parent, before = null) => {
      if (el && (el.parentElement !== parent || (before && el.nextElementSibling !== before))) {
        parent.insertBefore(el, before);
      }
    };
    const home = MCO.viewport.isCompact() ? navControlsEl : sidebarScroll;
    for (const sec of sections) place(sec, home);
    const inBar = navRail.isDrawerMode();
    if (inBar) place(variableGroupEl, navRailEl, searchToggle);
    else place(variableGroupEl, variableSection, aggGroup);
    if (inBar !== _pickerInBar) {
      _pickerInBar = inBar;
      populateVariableSelect();   // short labels in the bar
    }
    applyGroups();
    syncSidebarSections();
  }

  // A section showing nothing but its own heading is noise — and which groups are
  // hidden changes with the time mode (Date/Hour/Aggregation), so this re-runs
  // from syncModeUI too.
  function syncSidebarSections() {
    // syncModeUI/syncAggUI can fire during module init, before the sidebar block
    // below has initialised its const bindings. layoutControls() calls this again
    // once they exist, so bailing here loses nothing.
    if (!_sidebarReady) return;
    for (const sec of sections) {
      sec.hidden = !sec.querySelector(':scope > *:not(summary):not([hidden])');
    }
    // And .controls, whose children all move to the sidebar on desktop. CSS
    // :empty can't do this: moving the children out leaves whitespace text nodes
    // behind, so the selector never matches and the empty div still takes part in
    // the navbar's flex layout.
    navControlsEl.hidden = !navControlsEl.querySelector(':scope > *:not([hidden])');
  }

  // Above compact the sidebar is a column you can collapse (this function:
  // remembered, ?sidebar=, resizes the map). On compact its sections are in
  // the nav drawer instead (MCO.initNavRail, below).
  function setSidebarOpen(open, { persist = true, refit = true } = {}) {
    if (MCO.viewport.isCompact()) return;
    sidebarOpen = !!open;
    document.body.classList.toggle('sidebar-closed', !sidebarOpen);
    const label = sidebarOpen ? 'Hide controls' : 'Show controls';
    sidebarToggle.setAttribute('aria-expanded', sidebarOpen ? 'true' : 'false');
    sidebarToggle.setAttribute('aria-label', label);
    sidebarToggle.title = label;
    if (persist) MCO.lsSet('mco-explorer-sidebar', sidebarOpen ? 'open' : 'closed');
    if (refit) {
      // The map container just changed width. MapLibre needs telling, and the
      // resize handler then re-fits if the user was at full extent.
      const settle = () => { _resizeFromSidebar = true; map.resize(); };
      if (MCO.reducedMotion()) settle(); else setTimeout(settle, 240);   // after the slide
    }
    writeUrl();
  }

  sidebarToggle.addEventListener('click', () => setSidebarOpen(!sidebarOpen));
  // The nav drawer (kit 0.21.0 compact bar, 0.10.0 rail): ☰ at the bar's right
  // edge, or atop the landscape rail, opens #nav-drawer with the drawer
  // contract (focus in, the rest of the page and bar inert, Esc / the scrim /
  // ☰ close it, focus back to the opener). The bar's search button opens it
  // on the search field. Idle above compact, where the drawer is
  // display:contents.
  // Registered before initNavRail's own listener, so the Search group is open
  // by the time the kit focuses the field inside it.
  searchToggle.addEventListener('click', () => openGroup('search'));
  const navRail = MCO.initNavRail({
    toggle: navRailToggle,
    drawer: document.getElementById('nav-drawer'),
    scrim: document.getElementById('rail-scrim'),
    search: { toggle: searchToggle, input: searchInput },
  });
  // A drawer button that opens a dialog closes the drawer first: its inert
  // page would otherwise include the dialog.
  function closeNavDrawer() { if (navRail.isOpen()) navRail.close(); }

  _sidebarReady = true;
  layoutControls();
  setSidebarOpen(sidebarOpen, { persist: false, refit: false });   // no-op on compact
  // Releases the compact first-paint hold in index.html ("First paint"): every
  // control is now where it belongs.
  document.documentElement.classList.add('layout-ready');

  onViewportChange(() => {
    layoutControls();
    // Crossing back out of compact restores the saved column preference.
    if (!MCO.viewport.isCompact()) setSidebarOpen(MCO.lsGet('mco-explorer-sidebar') !== 'closed',
                        { persist: false });
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // ?kbd=off disables the single-character shortcut (WCAG 2.1.4 — speech-input
  // users can misfire it). Escape is the kit's MCO.escStack: the sheet, the
  // spider and the nav drawer each take one press, newest first.
  window.addEventListener('keydown', (e) => {
    if (kbdShortcuts && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target;
      const inField =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (inField) return;
      e.preventDefault();
      // The box lives in the sidebar on desktop and in the nav drawer on
      // compact. Reveal it either way before focusing, so the shortcut can't
      // focus something invisible.
      openGroup('search');
      if (navRail.isRail() || navRail.isDrawerMode()) { navRail.open(searchInput); return; }
      if (!sidebarOpen) setSidebarOpen(true);
      searchInput.focus();
      searchInput.select();
    }
  });
  // ── Export (PNG with MCO branding — photo-explorer pattern) ──────────────
  // Renders a fixed EXPORT_W×EXPORT_H map off-screen so the output is
  // identical regardless of the live viewport, composites a branding card
  // with the color-scale legend, and downloads a PNG.
  const EXPORT_W = 1400, EXPORT_H = 700;
  const EXPORT_SCALE = 2;   // → 2800×1400 output, independent of device DPR

  const onceEv = (m, ev) => new Promise(res => m.once(ev, res));
  function loadImg(url) {
    return new Promise((res) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url;
    });
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  let _exporting = false;
  document.getElementById('btn-export').addEventListener('click', exportPNG);

  async function exportPNG() {
    if (!_lastRender) { MCO.showToast('Map not loaded yet.'); return; }
    if (_exporting) return;
    _exporting = true;
    MCO.showToast('Exporting…');
    const W = EXPORT_W, H = EXPORT_H;

    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
    document.body.appendChild(holder);

    const xm = new maplibregl.Map({
      container: holder,
      style: MCO.map.cartoStyleUrl(),
      bounds: MT_FIT_BOUNDS,
      fitBoundsOptions: { padding: 24, animate: false },
      interactive: false,
      attributionControl: false,
      // Required for getCanvas() readback. MapLibre 6 only honours it inside
      // canvasContextAttributes; the old top-level option is silently ignored,
      // which would export a blank map.
      canvasContextAttributes: { preserveDrawingBuffer: true },
      pixelRatio: EXPORT_SCALE,      // render at 2× for a high-resolution PNG
      fadeDuration: 0,
    });

    try {
      await onceEv(xm, 'load');

      // Mirror the live map's layer stack for the current view state.
      if (radarOn && activeMode === 'latest') {
        xm.addSource('radar', { type: 'raster', tiles: [RADAR_TILES(_radarTs)], tileSize: 256 });
        xm.addLayer({ id: 'radar-layer', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.55 } });
      }
      if (overlayCounties) {
        xm.addSource('county', { type: 'geojson', data: _countyFC || 'data/mt_counties_simple.geojson' });
        xm.addLayer({ id: 'county-line', type: 'line', source: 'county', paint: countyLinePaint() });
      }
      if (overlayWatersheds && _hucFC) {
        xm.addSource('huc', { type: 'geojson', data: _hucFC });
        xm.addLayer({ id: 'huc-line', type: 'line', source: 'huc', paint: hucLinePaint() });
      }
      xm.addSource('tribal', { type: 'geojson', data: _tribalFC || 'data/mt_reservations_simple.geojson' });
      xm.addLayer({ id: 'tribal-fill', type: 'fill', source: 'tribal', paint: tribalFillPaint() });
      xm.addLayer({ id: 'tribal-line', type: 'line', source: 'tribal', paint: tribalLinePaint() });
      xm.addSource('state', { type: 'geojson', data: _stateFC || 'data/mt_state_simple.geojson' });
      xm.addLayer({ id: 'state-line', type: 'line', source: 'state',
                    layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: stateLinePaint() });

      xm.addSource('stations', { type: 'geojson', data: _lastFC });
      xm.addLayer({ id: 'dots-nodata', type: 'circle', source: 'stations', filter: nodataFilter(), paint: nodataDotPaint() });
      xm.addLayer({ id: 'dots-stale',  type: 'circle', source: 'stations', filter: staleFilter(),  paint: staleDotPaint() });
      xm.addLayer({ id: 'dots-value',  type: 'circle', source: 'stations', filter: valueFilter(),  paint: valueDotPaint() });
      if (labelsOn) {
        xm.addLayer({ id: 'dots-label', type: 'symbol', source: 'stations',
                      filter: valueFilter(), layout: { ...dotLabelLayout(), visibility: 'visible' }, paint: labelPaint() });
      }

      await onceEv(xm, 'idle');

      const mc = xm.getCanvas();
      const canvas = document.createElement('canvas');
      canvas.width = mc.width; canvas.height = mc.height;   // 2× via pixelRatio
      const ctx = canvas.getContext('2d');
      ctx.drawImage(mc, 0, 0);
      // Draw the branding card in logical (EXPORT_W×EXPORT_H) coords, scaled
      // up so its text/shapes stay crisp at the higher output resolution.
      ctx.save();
      ctx.scale(canvas.width / W, canvas.height / H);
      await drawBranding(ctx, W, H);
      ctx.restore();

      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) { MCO.showToast('Export failed.'); return; }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: exportFilename() });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      MCO.showToast('Exported!');
    } catch (err) {
      console.error(err);
      MCO.showToast('Export failed.');
    } finally {
      xm.remove();
      holder.remove();
      _exporting = false;
    }
  }

  // Full ISO-8601 timestamp in Mountain Time, e.g. "2026-07-14T20:25:00".
  function isoStampMT(ms) {
    const d = new Date(ms);
    const date = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(d);
    return `${date}T${time}`;
  }
  function tzAbbrevMT(ms) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' })
      .formatToParts(new Date(ms));
    return parts.find(p => p.type === 'timeZoneName')?.value || 'MT';
  }
  // Latest uses the newest data timestamp; hourly uses the hour-start
  // timestamp from the data rows (both full ISO). Daily stays a plain date.
  function exportTimeLabel() {
    const dt = _lastRender?.maxDt;
    if (activeMode === 'latest') {
      return dt ? `as of ${isoStampMT(dt)} ${tzAbbrevMT(dt)}` : 'Latest conditions';
    }
    if (activeMode === 'hourly') {
      return dt ? `${isoStampMT(dt)} ${tzAbbrevMT(dt)}`
                : `${activeDate}T${MCO.pad2(activeHour)}:00:00 MT`;
    }
    return `Daily · ${MCO.formatDateStr(activeDate)}${dailyPartialSuffix()}`;
  }
  function exportFilename() {
    const isoCompact = (ms) => isoStampMT(ms).replace(/:/g, '');   // filesystem-safe
    const dt = _lastRender?.maxDt;
    const t = activeMode === 'latest' ? (dt ? isoCompact(dt) : `latest-${MCO.todayMT()}`)
            : activeMode === 'hourly' ? (dt ? isoCompact(dt) : `${activeDate}T${MCO.pad2(activeHour)}0000`)
            : activeDate;
    return `mesonet-explorer-${activeVar}-${t}.png`;
  }

  // Branding card in the lower-left corner: MCO logo, titles, timestamp, and
  // the color-scale legend (a data map is unreadable without one).
  // The kit's brand assets, at the same pinned tag as the stylesheet (bump
  // with the kit tags in index.html).
  const KIT_ASSETS = 'https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.21.1/assets';
  async function drawBranding(ctx, W, H) {
    const { entry, unit, scale } = _lastRender;
    const bgSurface = cssVar('--bg-surface');
    const borderClr = cssVar('--border');
    const accentLt  = cssVar('--accent-light');
    const textMuted = cssVar('--text-muted');
    const textSec   = cssVar('--text-secondary');

    const BRAND_W = 330, BRAND_BOX_H = 128;
    const BX = 24, BY = H - 24 - BRAND_BOX_H, PAD = 12;
    const LX = BX + PAD, LY = BY + PAD;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = bgSurface;
    ctx.beginPath(); roundRectPath(ctx, BX, BY, BRAND_W, BRAND_BOX_H, 10); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = borderClr; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // The MCO wordmark from the pinned kit tag (0.11.0, HOUSE-STYLE §1:
    // "wordmark in exports", outlined artwork, never "Montana Climate Office"
    // set in a font). The fixed-colour twin is picked by the CARD's
    // background, which follows the export theme. jsDelivr sends CORS, so with
    // crossOrigin the canvas stays exportable; img-src allows the host.
    const onDark = MCO.getTheme() !== 'light';
    const WM_H = 44, WM_W = Math.round(WM_H * 432 / 159);   // the SVG's aspect
    const wordmark = await loadImg(`${KIT_ASSETS}/mco-wordmark-on-${onDark ? 'dark' : 'light'}.svg`);
    if (wordmark) ctx.drawImage(wordmark, LX, LY - 2, WM_W, WM_H);

    const TX = LX + WM_W + 12, TW = BX + BRAND_W - PAD - TX;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentLt;
    ctx.font = "700 13px 'Outfit', system-ui, sans-serif";
    ctx.fillText('Mesonet Explorer', TX, LY + 10, TW);
    ctx.fillStyle = textMuted;
    ctx.font = "400 11px 'Outfit', system-ui, sans-serif";
    ctx.fillText(exportTimeLabel(), TX, LY + 28, TW);

    const aggSuffix = (activeMode !== 'latest' && aggSupported(entry))
      ? ` · ${AGG_LABEL[activeAgg || defaultAggFor(entry)]}` : '';
    ctx.fillStyle = textSec;
    ctx.font = "600 11.5px 'Outfit', system-ui, sans-serif";
    ctx.fillText((unit ? `${entry.label} [${unit}]` : entry.label) + aggSuffix, LX, BY + 72, BRAND_W - 2 * PAD);

    // Color-scale strip, sampled from the live scale (log-aware).
    const GX = LX, GY = BY + 80, GW = BRAND_W - 2 * PAD, GH = 10;
    const grad = ctx.createLinearGradient(GX, 0, GX + GW, 0);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      grad.addColorStop(t, scale(scale.domain[0] + t * (scale.domain[1] - scale.domain[0])));
    }
    ctx.save();
    ctx.beginPath(); roundRectPath(ctx, GX, GY, GW, GH, 3);
    ctx.fillStyle = grad; ctx.fill();
    ctx.globalAlpha = 0.4; ctx.strokeStyle = borderClr; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // Mirror the on-screen legend labels (≤/≥ clamps, compass ends).
    const disp = scale.displayDomain || scale.domain;
    const loLbl = scale.endLabels ? scale.endLabels[0]
                : (scale.clampedLow ? '≤ ' : '') + fmtScaleLimit(disp[0]);
    const hiLbl = scale.endLabels ? scale.endLabels[1]
                : (scale.clampedHigh ? '≥ ' : '') + fmtScaleLimit(disp[1]);
    const midLbl = (scale.mid != null && !scale.xform) ? fmtScaleLimit(scale.mid)
                 : scale.midLabel || null;
    ctx.fillStyle = textSec;
    ctx.font = "9.5px 'Space Mono', monospace";
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(loLbl, GX, GY + GH + 12);
    if (midLbl != null) {
      ctx.textAlign = 'center';
      ctx.fillText(midLbl, GX + GW / 2, GY + GH + 12);
      ctx.textAlign = 'left';
    }
    ctx.textAlign = 'right';
    ctx.fillText(hiLbl, GX + GW, GY + GH + 12);
    ctx.fillStyle = textMuted;
    ctx.font = "italic 10px 'Outfit', system-ui, sans-serif";
    ctx.fillText('climate.umt.edu', BX + BRAND_W - PAD, BY + BRAND_BOX_H - 9);
    ctx.textAlign = 'left';
  }

  // ── URL state push ───────────────────────────────────────────────────────
  // Builds the URL parameters for the current view.
  //
  // `full: false` (the address bar) omits anything sitting at its default, so a
  // default view has no query string at all and the URL stays the shortest
  // description of what changed.
  //
  // `full: true` (the share button) writes every parameter explicitly, so the
  // recipient sees exactly what the sharer saw — independent of their OS theme,
  // their saved preferences, or what "today" happens to be when they open it.
  function viewParams({ full = false } = {}) {
    const params = {};
    const entry = REGISTRY_BY_KEY.get(activeVar);
    const put = (key, value, isDefault) => {
      if (full || !isDefault) params[key] = value;
    };

    put('mode', activeMode, activeMode === 'latest');
    put('var', activeVar, activeVar === 'air_temp');
    // Date and hour only mean anything outside Latest. Their default is the newest
    // data available, which is also what a load with no parameter resolves to —
    // so a shared link pins them explicitly and the address bar does not.
    if (full ? activeMode !== 'latest' : (activeMode !== 'latest' && activeDate !== maxDateForMode())) {
      params.date = activeDate;
    }
    if (full ? activeMode === 'hourly'
             : (activeMode === 'hourly' && activeHour !== MCO.lastCompleteHourMT().hour)) {
      params.hour = String(activeHour);
    }
    put('units', activeUnits, activeUnits === 'us');
    if (aggActive(entry)) params.agg = activeAgg;
    else if (full && activeMode !== 'latest' && aggSupported(entry) && activeAgg) params.agg = activeAgg;
    put('net', [...activeNetworks].map(n => n.toLowerCase()).join(' '),
        activeNetworks.size === KNOWN_NETWORKS.length);
    if (scaleOverride) {
      const f = (v) => Number.isFinite(v) ? String(v) : '-';
      if (scaleLocked() || Number.isFinite(scaleOverride.mid)) {
        params.scale = `${f(scaleOverride.min)},${f(scaleOverride.mid)},${f(scaleOverride.max)}`;
      }
      if (scaleOverride.ramp) params.ramp = scaleOverride.ramp + (scaleOverride.rev ? '-r' : '');
    }
    put('labels', labelsOn ? 'on' : 'off', labelsOn === LABELS_DEFAULT);
    put('radar', radarOn ? 'on' : 'off', !radarOn);
    put('nodata', nodataShown ? 'show' : 'hide', nodataShown);
    put('stale', staleShown ? 'show' : 'hide', !staleShown);
    put('counties', overlayCounties ? 'on' : 'off', !overlayCounties);
    put('watersheds', overlayWatersheds ? 'on' : 'off', !overlayWatersheds);
    put('legend', legendCollapsed ? 'collapsed' : 'open', !legendCollapsed);
    // Only meaningful on desktop, where the sidebar is a fixture rather than a
    // transient drawer — so a share from a phone shouldn't force it on a desktop.
    if (!MCO.viewport.isCompact()) put('sidebar', sidebarOpen ? 'open' : 'closed', sidebarOpen);
    // The theme's default is the viewer's OS preference, so the address bar only
    // shows a deliberate override. A shared link always pins it.
    const theme = document.documentElement.dataset.theme;
    if (theme) put('theme', theme, theme === MCO.osTheme());
    // The camera's default is the fitted Montana extent. All three or none — the
    // parser needs the set to position the map.
    // MCO.map.cameraParamsIfDefault (kit 0.8.0; replaces this file's local
    // at-default-extent test): {} at the fitted extent, computed with the same
    // fitOpts the fit control and zoom floor use, so it stays right as the
    // container resizes. Before the map is ready the camera is the default.
    if (full) Object.assign(params, MCO.map.cameraParams(map));
    else if (_mapReady) Object.assign(params, MCO.map.cameraParamsIfDefault(map, { fitOpts }));
    if (_selectedStation) params.station = _selectedStation;
    // Not previously round-tripped, so it was silently lost on the first
    // writeUrl. It's the WCAG 2.1.4 escape hatch for the single-character
    // shortcut — someone who needs it shouldn't have to re-add it every visit.
    // Deliberately NOT forced into a shared link: it is the sharer's input
    // preference, not part of what they were looking at.
    if (!kbdShortcuts) params.kbd = 'off';
    return params;
  }

  // URL writers (HOUSE-STYLE §4, kit 0.8.0). Every view adjustment (camera,
  // filters, theme, date) REPLACES the current entry; only opening a station
  // from a "no station" state PUSHES one (openPopupFor), so Back closes the
  // panel and Forward reopens it. A default view gets a clean URL, no '?'.
  // replaceUrlState keeps history.state, so the pushed entry keeps its
  // {mcoDetail} mark while the panel stays open.
  function writeUrl() { MCO.replaceUrlState(viewParams()); }

  function shareURL() {
    const qs = new URLSearchParams(viewParams({ full: true })).toString();
    return `${location.origin}${location.pathname}?${qs}`;
  }

  // ── Map events ───────────────────────────────────────────────────────────
  map.on('load', () => {
    addCustomLayers();
    zoomFloor.refresh();
    _mapReady = true;
    // The constructor fit used flat padding (the sidebar's width isn't known
    // that early), so re-fit now that the panels are laid out — unless the URL
    // pinned an explicit camera.
    if (!_hasInitPos) map.fitBounds(MT_FIT_BOUNDS, fitOpts());
    boot();
  });

  let _resizeTimer = null;
  let _lastMapSize = null;
  // Set by setSidebarOpen: a sidebar toggle is a deliberate request for the map to
  // take (or give up) that column, so it re-fits even with a station open. The
  // guards below are for INCIDENTAL resizes — a mobile URL bar, our own chrome
  // re-wrapping — which must never yank the camera.
  let _resizeFromSidebar = false;
  map.on('resize', () => {
    if (!_mapReady) return;
    // Zoom doesn't change when the container resizes, so comparing against the
    // pre-resize fit zoom tells us whether the user was at full extent (e.g.
    // the navbar wrapped on mobile after the chips loaded). If so, keep them
    // fitted to Montana rather than letting the state drift out of frame.
    const wasAtExtent = fitZoom() !== undefined && map.getZoom() <= fitZoom() + 0.1;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      _resizeTimer = null;
      const fromSidebar = _resizeFromSidebar;
      _resizeFromSidebar = false;
      const c = map.getContainer();
      const w = c.clientWidth, h = c.clientHeight;
      // A mobile URL bar showing/hiding, or our own chrome re-wrapping, changes
      // the height only. That must not move the camera.
      const chromeOnly = _lastMapSize && w === _lastMapSize.w && Math.abs(h - _lastMapSize.h) < 120;
      _lastMapSize = { w, h };
      zoomFloor.refresh();
      if (chromeOnly && !fromSidebar) return;
      // Never yank the camera out from under an open detail on an incidental
      // resize — but a sidebar toggle is the user asking for exactly that.
      if (_selectedStation && !fromSidebar) return;
      if (wasAtExtent) map.fitBounds(MT_FIT_BOUNDS, { ...fitOpts(), animate: !MCO.reducedMotion() });
    }, 200);
  });

  map.on('moveend', writeUrl);

  // First-paint hold (kit 0.9.0). The first meaningful state is the station
  // dots ON THE CANVAS, not merely fetched: MapLibre tiles GeoJSON in its web
  // worker, so a worker that never starts (CSP worker-src) leaves the data in
  // hand and the map empty. queryRenderedFeatures only answers once the worker
  // has delivered, so ready() waits for it. A render with nothing to draw (all
  // networks off, an outage, a failed fetch) is itself the state to show.
  // mco-booting is also released by the anti-flash snippet's own 3 s timeout,
  // so this only ever decides WHEN, never WHETHER.
  function releaseHoldWhenDrawn() {
    const c = _lastRender && _lastRender.counts;
    const expected = c ? c.ok + (staleShown ? c.stale : 0) + (nodataShown ? c.nodata : 0) : 0;
    if (!expected) { MCO.ready(); return; }
    const check = () => {
      const layers = ['dots-value', 'dots-stale', 'dots-nodata'].filter(id => map.getLayer(id));
      if (map.queryRenderedFeatures({ layers }).length) MCO.ready();
      else map.once('idle', check);
    };
    check();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function boot() {
    syncModeUI();
    syncUnitsUI();
    populateVariableSelect();
    syncAggUI();
    updateHourReadout();
    showLoading();   // covers the initial station-list fetch; render() takes over

    try {
      const [st, els] = await Promise.all([
        MCO.fetchJSON(`${API}/stations/?type=json`),
        MCO.fetchJSON(`${API}/elements/?type=json`),
      ]);
      stations = st;
      elementDesc = new Map(els.map(e => [e.element, e.description_short]));
    } catch (err) {
      console.error(err);
      hideLoading();
      showErrorCard('Couldn’t reach the Mesonet API. Check your connection.', () => boot());
      window.addEventListener('online',
        () => { if (!stations.length) { clearErrorCard(); boot(); } },
        { once: true });
      MCO.showToast(`Failed to load station list: ${err.message}`, 6000);
      MCO.ready();   // the error card IS the first meaningful state
      return;
    }
    stations = stations.filter(s =>
      typeof s.latitude === 'number' && typeof s.longitude === 'number');
    stationById = new Map(stations.map(s => [s.station, s]));

    // Date bounds from the network's history.
    const installs = stations.map(s => s.date_installed).filter(t => typeof t === 'number');
    if (installs.length) {
      earliestDate = new Date(Math.min(...installs)).toISOString().slice(0, 10);
    }
    dateInput.min = earliestDate;
    dateInput.max = maxDateForMode();
    if (activeDate < earliestDate) activeDate = earliestDate;
    if (activeDate > maxDateForMode()) activeDate = maxDateForMode();
    dateInput.value = activeDate;
    if (activeMode === 'hourly') clampHour();

    buildFilterUI();
    populateSearch();
    if (overlayWatersheds) loadHucOnce().catch(() => {});

    // Warmed before the first render (which takes seconds) so photoFrameWanted()
    // can answer synchronously by the time anyone opens a station.
    fetchPhotoMeta().catch(() => {});   // popups retry on failure

    await render();
    releaseHoldWhenDrawn();
    scheduleRefresh();

    // Headless export (?export=…): trigger once the first render has landed.
    if (_exportParam) setTimeout(exportPNG, 1500);

    if (_initStation && stationById.has(_initStation)) {
      const s = stationById.get(_initStation);
      // A deep link opens in place: no history entry for a station the page
      // was loaded with. With a camera in the URL it opens where it is.
      if (_hasInitPos) openPopupFor(_initStation, [s.longitude, s.latitude], { replace: true });
      else             flyToAndOpen(_initStation, { replace: true });
    } else {
      writeUrl();
    }
  }

