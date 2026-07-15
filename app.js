  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const API = 'https://mesonet2.climate.umt.edu/api';
  const DASH_URL  = (s) => `https://mesonet.climate.umt.edu/dash/${encodeURIComponent(s)}/`;
  const TZ = 'America/Denver';

  const MT_FIT_BOUNDS = [[-116.10, 44.30], [-104.00, 49.05]];   // [SW, NE]
  const FIT_OPTS      = { padding: 24, animate: false };

  const STALE_MS          = 3 * 60 * 60 * 1000;   // latest mode: hide obs older than 3 h
  const REFRESH_MS        = 5 * 60 * 1000;        // latest-mode auto-refresh cadence
  const SEARCH_FLY_ZOOM   = 11;
  const SEARCH_FLY_SPEED  = 1.4;
  const LABEL_MINZOOM     = 5;
  const BUCKET_PRECISION  = 4;      // co-location bucket (~11 m)
  const SPIDER_RADIUS_PX  = 26;     // distance from anchor to spider foot
  const SPIDER_CLOSE_GRACE_MS = 250;
  const NULL_COLOR        = '#9aa3b3';
  const EARLIEST_DATE     = '2016-01-01';   // refined from station install dates at boot

  const RADAR_TILES = (ts) =>
    'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi' +
    '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=nexrad-n0r&STYLES=' +
    '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256' +
    `&BBOX={bbox-epsg-3857}&_ts=${ts}`;

  // ── Color ramps (hex stops, low → high) ──────────────────────────────────
  // ColorBrewer (colorbrewer2.org) plus a curated subset of Fabio Crameri's
  // Scientific colour maps (perceptually uniform, colour-vision-deficiency
  // safe; the *O maps are cyclic — first stop === last stop).
  // Crameri, F. (2018). Scientific colour maps. Zenodo.
  // doi:10.5281/zenodo.1243862 — MIT license. https://www.fabiocrameri.ch/colourmaps/
  const RAMPS = {
    // ColorBrewer
    RdBu:     ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7','#d1e5f0','#92c5de','#4393c3','#2166ac','#053061'],
    BrBG:     ['#543005','#8c510a','#bf812d','#dfc27d','#f6e8c3','#f5f5f5','#c7eae5','#80cdc1','#35978f','#01665e','#003c30'],
    Spectral: ['#9e0142','#d53e4f','#f46d43','#fdae61','#fee08b','#ffffbf','#e6f598','#abdda4','#66c2a5','#3288bd','#5e4fa2'],
    YlGnBu:   ['#ffffd9','#edf8b1','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0','#225ea8','#253494','#081d58'],
    YlOrRd:   ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'],
    Blues:    ['#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#08519c','#08306b'],
    PuRd:     ['#f7f4f9','#e7e1ef','#d4b9da','#c994c7','#df65b0','#e7298a','#ce1256','#980043','#67001f'],
    // Crameri — sequential
    batlow:   ['#011959','#103d5f','#185562','#30685c','#577647','#828231','#b38e2f','#e09651','#fba689','#fdb9c2','#faccfa'],
    lajolla:  ['#191900','#31220e','#512d1e','#7d3b35','#b34947','#d9604e','#e38050','#e99d53','#f0bd57','#f9e384','#fffecb'],
    davos:    ['#00054a','#102a6f','#234a8c','#3a679b','#547d9c','#6c8e93','#849e89','#a4b68a','#d4dba8','#f5f5d7','#fefefe'],
    bamako:   ['#003b47','#0d4340','#1b4c37','#2e582b','#47681c','#637a0a','#818800','#a2930d','#c6ae39','#e5cb75','#ffe5ad'],
    // Crameri — diverging (odd stop count: neutral center is a stop)
    vik:      ['#001261','#023a7b','#116496','#5496b7','#a7c9da','#ece5e0','#e1b8a0','#cd8961','#b75a26','#852206','#590008'],
    roma:     ['#7e1700','#984e14','#ac7726','#c1a343','#d2d484','#c0eac3','#89dad7','#4db3cf','#2d88be','#1e5fac','#033198'],
    broc:     ['#2c1a4c','#284174','#3f6b99','#7697b7','#b3c5d7','#ebeeec','#dcdbb8','#b6b67c','#81814c','#505023','#262600'],
    cork:     ['#2c194c','#284275','#3d6b98','#6f92b3','#adc1d4','#e6edec','#b7cfb7','#7ba77a','#438142','#195615','#0f2903'],
    // Crameri — cyclic (0° and 360° share a color)
    romaO:    ['#733957','#823c3d','#94502e','#aa752f','#c3a34b','#d5ce81','#cbe1b3','#a4d8cb','#74bbcd','#5495c0','#516da6','#62497d','#733957'],
    vikO:     ['#4f1a3d','#3f2c5b','#334b7f','#4575a1','#759ebc','#aebdc8','#d5beb3','#d7a387','#c57c56','#a34d2d','#7c271e','#611627','#4f1a3d'],
  };
  // Editor picker grouping + display names.
  const RAMP_GROUPS = [
    { label: 'ColorBrewer', ramps: ['RdBu','BrBG','Spectral','YlGnBu','YlOrRd','Blues','PuRd'] },
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
  // col: display-name prefix of the wide column (before any "(...)"/unit suffix)
  // modes: which time modes support the variable
  // scale: {ramp, rev, mid, log} — mid keyed by displayed unit; log → color-map in log10 space
  // fmt: 'p2' = 2 decimals; default auto (integers when range > 5, else 1 dp)
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
    { key:'bp',         label:'Atmospheric Pressure',   group:'Atmosphere', col:'Atmospheric Pressure',  source:'obs',    els:['bp'], modes:ALL_MODES, scale:{ramp:'PuRd'} },
    { key:'sol_rad',    label:'Solar Radiation',        group:'Atmosphere', col:'Solar Radiation',       source:'obs',    els:['sol_rad'], modes:ALL_MODES, scale:{ramp:'YlOrRd'} },
    { key:'vpd',        label:'Vapor Pressure Deficit', group:'Atmosphere', col:'VPD',                   source:'extra',  els:['vpd_atmo'], modes:ALL_MODES, scale:{ramp:'YlOrRd'} },
    { key:'feels_like', label:'Feels-Like Temperature', group:'Atmosphere', col:'Feels Like Temperature',source:'derived', element:'feels_like', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'heat_index', label:'Heat Index',             group:'Atmosphere', col:'Heat Index',            source:'derived', element:'heat_index', modes:ALL_MODES, scale:{ramp:'YlOrRd'} },
    { key:'wind_chill', label:'Wind Chill',             group:'Atmosphere', col:'Wind Chill',            source:'derived', element:'wind_chill', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'wet_bulb',   label:'Wet Bulb Temperature',   group:'Atmosphere', col:'Wet Bulb Temperature',  source:'derived', element:'wet_bulb',   modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'cci',        label:'Comprehensive Climate Index', group:'Atmosphere', col:'Comprehensive Climate Index', source:'derived', element:'cci', modes:ALL_MODES, scale:{ramp:'RdBu', rev:true, mid:MID_FREEZE} },
    { key:'slp',        label:'Sea-Level Pressure',     group:'Atmosphere', col:'Sea Level Corrected Pressure', source:'derived', element:'slp', modes:ALL_MODES, scale:{ramp:'PuRd'} },

    // Wind
    { key:'wind_spd', label:'Wind Speed',     group:'Wind', col:'Wind Speed',     source:'obs', els:['wind_spd_1000','wind_spd_0244'], modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'windgust', label:'Wind Gust',      group:'Wind', col:'Gust Speed',     source:'obs', els:['windgust_1000','windgust_0244'], modes:ALL_MODES, scale:{ramp:'YlGnBu'} },
    { key:'wind_dir', label:'Wind Direction', group:'Wind', col:'Wind Direction', source:'obs', els:['wind_dir_1000','wind_dir_0244'], modes:ALL_MODES, scale:{ramp:'romaO', domain:[0,360], endLabels:['N','N'], midLabel:'S'}, fmt:'p0' },

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
    { key:'sat_shallow', label:'Percent Saturation — Shallow', group:'Soil Moisture', col:'Shallow Percent Saturation',   source:'derived', element:'percent_saturation', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'sat_mid',     label:'Percent Saturation — Mid',     group:'Soil Moisture', col:'Mid Depth Percent Saturation', source:'derived', element:'percent_saturation', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'sat_deep',    label:'Percent Saturation — Deep',    group:'Soil Moisture', col:'Deep Percent Saturation',      source:'derived', element:'percent_saturation', modes:ALL_MODES, scale:{ramp:'BrBG'} },
    { key:'swp_shallow', label:'Soil Water Potential — Shallow', group:'Soil Moisture', col:'Shallow Soil Water Potential',   source:'derived', element:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', log:true}, fmt:'p2' },
    { key:'swp_mid',     label:'Soil Water Potential — Mid',     group:'Soil Moisture', col:'Mid Depth Soil Water Potential', source:'derived', element:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', log:true}, fmt:'p2' },
    { key:'swp_deep',    label:'Soil Water Potential — Deep',    group:'Soil Moisture', col:'Deep Soil Water Potential',      source:'derived', element:'swp', modes:ALL_MODES, scale:{ramp:'BrBG', log:true}, fmt:'p2' },
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

  // Plain-language one-liners shown under the legend title (DRAFT copy —
  // MCO scientists should refine). Depths appear in the labels already.
  const VARIABLE_DESC = {
    air_temp:   'Air temperature measured above ground.',
    rh:         'Moisture in the air, as a share of the most it could hold.',
    bp:         'Air pressure at the station.',
    sol_rad:    'Incoming solar energy.',
    vpd:        'Drying power of the air — higher means faster water loss from plants and soil.',
    feels_like: 'Temperature as it feels, blending heat index and wind chill.',
    heat_index: 'How hot it feels once humidity is factored in.',
    wind_chill: 'How cold it feels once wind is factored in.',
    wet_bulb:   'Lowest temperature evaporation can cool to — a heat-stress indicator.',
    cci:        'Livestock weather-stress index combining temperature, humidity, wind, and sun.',
    slp:        'Air pressure corrected to sea level, comparable across elevations.',
    wind_spd:   'Sustained wind speed.',
    windgust:   'Strongest brief burst of wind in the period.',
    wind_dir:   'Direction the wind blows from (0° = north).',
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
  const EXTRA_ELEMENTS = ['vpd_atmo', 'well_lvl', 'well_tmp', 'well_eco'];

  const bucketKey = (lat, lon) =>
    `${lat.toFixed(BUCKET_PRECISION)},${lon.toFixed(BUCKET_PRECISION)}`;

  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  const _reduceMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = _reduceMotionMq.matches;
  _reduceMotionMq.addEventListener('change', (e) => { reduceMotion = e.matches; });

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const toastEl        = document.getElementById('toast');
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

  let _toastTimer;
  function showToast(msg, ms = 2800) {
    clearTimeout(_toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    _toastTimer = setTimeout(() => toastEl.classList.remove('visible'), ms);
  }

  const srAnnounceEl = document.getElementById('sr-announce');

  // ── Loading indicator (bar under the control bar; the navbar stamp is
  //    display:none on phones, so this is the only loading cue there) ───────
  const loadingBarEl  = document.getElementById('loading-bar');
  const loadingNoteEl = document.getElementById('loading-note');
  function showLoading() { loadingBarEl.classList.add('active'); }
  function hideLoading() {
    loadingBarEl.classList.remove('active');
    loadingNoteEl.hidden = true;
    loadingNoteEl.textContent = '';
  }
  function setLoadingNote(text) {
    // Only narrate long fetches that the user is actually waiting on.
    if (!loadingBarEl.classList.contains('active')) return;
    loadingNoteEl.textContent = text;
    loadingNoteEl.hidden = !text;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function escapeRe(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Mountain-time helpers ────────────────────────────────────────────────
  function todayMT() {
    return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  }
  function currentHourMT() {
    return parseInt(new Intl.DateTimeFormat('en-US',
      { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10);
  }
  function hhmmNowMT() {
    return new Intl.DateTimeFormat('en-GB',
      { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  }
  function shiftDate(dateStr, deltaDays) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  function formatStampMT(ms) {
    return new Date(ms).toLocaleString('en-US', {
      timeZone: TZ,
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  }
  function formatDateMT(ms) {
    return new Date(ms).toLocaleDateString('en-US', {
      timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  function formatDateStr(dateStr) {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  // The last complete clock hour for hourly mode, as {date, hour} in MT.
  function lastCompleteHourMT() {
    const t = todayMT();
    const h = currentHourMT() - 1;
    if (h < 0) return { date: shiftDate(t, -1), hour: 23 };
    return { date: t, hour: h };
  }

  // ── URL state ────────────────────────────────────────────────────────────
  const urlParams = new URLSearchParams(location.search);
  const getLower = (key) => {
    const v = urlParams.get(key);
    return v == null ? null : v.toLowerCase();
  };
  const splitTokens = (raw) =>
    raw == null ? null : raw.split(/[,\s]+/).filter(Boolean).map(s => s.toLowerCase());

  const KNOWN_NETWORKS = ['HydroMet', 'AgriMet'];
  const networkByLowerName = new Map(KNOWN_NETWORKS.map(n => [n.toLowerCase(), n]));

  let activeMode = (() => {
    const u = getLower('mode');
    return (u === 'hourly' || u === 'daily') ? u : 'latest';
  })();

  let activeVar = (() => {
    const u = getLower('var');
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
      const name = rev ? rampRaw.slice(0, -2) : rampRaw;
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
    const saved = localStorage.getItem('mco-explorer-units');
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
    return activeMode === 'hourly' ? lastCompleteHourMT().date : todayMT();
  })();

  let activeHour = (() => {
    const u = parseInt(urlParams.get('hour'), 10);
    if (Number.isInteger(u) && u >= 0 && u <= 23) return u;
    return lastCompleteHourMT().hour;
  })();

  let activeNetworks = (() => {
    const tokens = splitTokens(urlParams.get('net'));
    if (tokens !== null) {
      return new Set(tokens.map(t => networkByLowerName.get(t)).filter(Boolean));
    }
    try {
      const saved = JSON.parse(localStorage.getItem('mco-explorer-networks') || 'null');
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

  let labelsOn = (() => {
    const u = getLower('labels');
    if (u === 'on' || u === 'off') return u === 'on';
    return localStorage.getItem('mco-explorer-labels') === 'on';
  })();

  let radarOn = getLower('radar') === 'on';
  let radarWanted = radarOn;   // user intent — restored when returning to Latest

  let nodataShown = getLower('nodata') !== 'hide';
  let staleShown  = getLower('stale') === 'show';

  let overlayCounties   = getLower('counties') === 'on';
  let overlayWatersheds = getLower('watersheds') === 'on';

  // Headless export hook: ?export=light|dark forces the theme before the map
  // is built, then boot() auto-triggers a PNG export (photo-explorer pattern).
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
  function basemapStyleUrl() {
    const variant = document.documentElement.dataset.theme === 'dark'
      ? 'dark-matter-gl-style' : 'positron-gl-style';
    return `https://basemaps.cartocdn.com/gl/${variant}/style.json`;
  }
  function dotStrokeColor() {
    return document.documentElement.dataset.theme === 'dark' ? '#ffffff' : '#2a2a3a';
  }
  function mutedStrokeColor() {
    // Hollow stale/no-data dots are ONLY a stroke — it must clear 3:1
    // against the basemap in both themes (WCAG 1.4.11).
    return document.documentElement.dataset.theme === 'dark' ? '#7a8aa0' : '#6e7787';
  }
  function syncThemeIcons() {
    const dark = document.documentElement.dataset.theme !== 'light';
    document.getElementById('icon-moon').style.display = dark ? 'none' : '';
    document.getElementById('icon-sun') .style.display = dark ? ''     : 'none';
    document.getElementById('btn-theme').setAttribute('aria-label',
      dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  syncThemeIcons();

  document.getElementById('btn-theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    lsSet('mco-theme', next);
    syncThemeIcons();
    map.setStyle(basemapStyleUrl());
    map.once('style.load', () => {
      addCustomLayers();
      map.getSource('stations')?.setData(_lastFC);
      if (_spiderBucket) rebuildSpider();
    });
    pushState();
  });

  // ── Info modal ───────────────────────────────────────────────────────────
  const btnInfo = document.getElementById('btn-info');
  btnInfo.addEventListener('click', () => infoModal.showModal());
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal || e.target.dataset.closeModal !== undefined) infoModal.close();
  });
  infoModal.addEventListener('close', () => {
    btnInfo.focus();
    lsSet('mco-explorer-seen-intro', '1');
  });
  if (!localStorage.getItem('mco-explorer-seen-intro') && !_exportParam) {
    setTimeout(() => { if (!infoModal.open) infoModal.showModal(); }, 350);
  }

  // ── Share ────────────────────────────────────────────────────────────────
  document.getElementById('btn-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copied to clipboard');
    } catch {
      showToast('Could not copy — copy the URL from the address bar');
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
  function makeFormatter(entry, domain) {
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

  async function fetchJSON(url, timeoutMs = 60_000) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }
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
    const start = `${date}T${pad2(hour)}:00:00`;
    const end = hour < 23 ? `${date}T${pad2(hour + 1)}:00:00` : `${shiftDate(date, 1)}T00:00:00`;
    return { start, end };
  }

  // timeKey identifies the temporal slice a fetch belongs to.
  function timeKeyFor(mode, date, hour) {
    if (mode === 'latest') return 'latest';
    if (mode === 'hourly') return `${date}T${pad2(hour)}`;
    return date;
  }

  // Source fetchers → arrays of wide rows [{station, datetime?, "<Name> [unit]": v, …}]
  function fetchObs(mode, date, hour, units) {
    const tk = timeKeyFor(mode, date, hour);
    return cached(`obs|${units}|${tk}`, () => {
      let url;
      if (mode === 'latest') {
        url = `${API}/observations/grouped/?type=json&latest=true&units=${units}`;
      } else if (mode === 'hourly') {
        const w = hourWindow(date, hour);
        url = `${API}/observations/grouped/?type=json&hour=true&start_time=${w.start}&end_time=${w.end}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      } else {
        url = `${API}/observations/grouped/?type=json&day=true&start_time=${date}&end_time=${shiftDate(date, 1)}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return fetchJSON(url, timeoutForMode(mode));
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
        url = `${API}/derived/daily/?type=json&elements=${element}&grouped=true&wide=true&start_time=${date}&end_time=${shiftDate(date, 1)}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return fetchJSON(url, timeoutForMode(mode));
    });
  }

  function fetchPptWindows(units) {
    // /derived/ppt/ has no units param — U.S. units always; converted client-side.
    return cached(`pptwin|${units}|latest`, () => fetchJSON(`${API}/derived/ppt/?type=json&wide=true`));
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
        url = `${API}/observations/daily/?type=json&${els}&wide=true&start_time=${date}&end_time=${shiftDate(date, 1)}&units=${units}&rm_na=true&tz=${encodeURIComponent(TZ)}`;
      }
      return fetchJSON(url, timeoutForMode(mode));
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
        const rows = await fetchJSON(url, 45_000);
        merged.push(...rows);
      }
      setLoadingNote('');
      return merged;
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
        url = `${API}/observations/daily/?type=json&${els}&wide=true&start_time=${date}&end_time=${shiftDate(date, 1)}&units=${units}&rm_na=true&agg_func=${agg}&tz=${encodeURIComponent(TZ)}`;
      }
      return fetchJSON(url, timeoutForMode(mode));
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
      case 'obs':     return fetchObs(mode, date, hour, units);
      case 'derived': return fetchDerived(entry.element, mode, date, hour, units);
      case 'pptwin':  return fetchPptWindows(units);
      case 'extra':   return fetchExtra(mode, date, hour, units);
      case 'change':  return fetchChange();
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
    const re = new RegExp(`^${escapeRe(entry.col)}(?:\\s*\\([^)]*\\))?\\s*\\[(.+)\\]$`);
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
  function extractAggValues(rows, entry, agg) {
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
      if (v != null) byStation.set(row.station, { v, dt });
    }
    return { byStation, unit, maxDt };
  }

  // ── App state (data) ─────────────────────────────────────────────────────
  let stations    = [];
  let elementDesc = new Map();     // element id → description_short (boot)
  let stationById = new Map();
  // Co-location: static bucket assignment (boot) + per-render visibility-aware
  // membership, so hiding a network/category promotes the next visible member
  // to anchor (ported from mesonet-status).
  let bucketById    = new Map();   // station id → bucket key (static)
  let bucketMembers = new Map();   // bucket key → [station meta, display order]
  let bucketAnchor  = new Map();   // bucket key → anchor station id
  let bucketIndex   = new Map();   // station id → index among visible members
  let _propsById    = new Map();   // station id → feature props from last render
  let _spiderBucket = null;        // bucket key currently fanned out, or null
  let _lastFC = { type: 'FeatureCollection', features: [] };
  let _lastRender = null;          // {entry, unit, scale, fmt, counts, maxDt}
  let _popup = null;
  let _suppressNextPopupClose = false;
  let _popupFocusReturn = null;    // element to refocus when the popup closes
  let earliestDate = EARLIEST_DATE;

  function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

  // ── Map init ─────────────────────────────────────────────────────────────
  const map = new maplibregl.Map({
    container: 'map',
    style: basemapStyleUrl(),
    ...(_hasInitPos
      ? { center: [_initLng, _initLat], zoom: _initZoom }
      : { bounds: MT_FIT_BOUNDS, fitBoundsOptions: FIT_OPTS }),
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  (function addFitToExtentButton() {
    const navGroup = document.querySelector('.maplibregl-ctrl-top-right .maplibregl-ctrl-group');
    if (!navGroup) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maplibregl-ctrl-fit';
    btn.title = 'Zoom to full extent';
    btn.setAttribute('aria-label', 'Zoom to full extent');
    btn.innerHTML = `<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => {
      closeSpider();
      map.fitBounds(MT_FIT_BOUNDS, { ...FIT_OPTS, animate: !reduceMotion });
    });
    navGroup.appendChild(btn);
  })();

  let _fitZoom;
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
    if (!map.getSource('spider')) {
      map.addSource('spider', { type: 'geojson', data: emptyFC() });
    }
    if (!map.getSource('spider-lines')) {
      map.addSource('spider-lines', { type: 'geojson', data: emptyFC() });
    }
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
        id: 'spider-lines-layer', type: 'line', source: 'spider-lines',
        paint: {
          'line-color': ['get', '_strokeColor'],
          'line-width': 1.2,
          'line-opacity': 0.65,
        },
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
    if (!map.getLayer('stations-badge')) {
      map.addLayer({
        id: 'stations-badge', type: 'symbol', source: 'stations',
        layout: {
          'text-field': ['to-string', ['get', 'colocationCount']],
          'text-font':  ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size':  10,
          'text-offset': [0, -1.05],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#1a1a2e',
          'text-halo-width': 1.2,
        },
      });
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
        id: 'spider-layer', type: 'circle', source: 'spider',
        paint: spiderCirclePaint(),
      });
    }
    if (!map.getLayer('spider-label')) {
      map.addLayer({
        id: 'spider-label', type: 'symbol', source: 'spider',
        minzoom: LABEL_MINZOOM,
        layout: dotLabelLayout(),
        paint: labelPaint(),
      });
    }

    applyDotFilters();
  }

  function nodataDotPaint() {
    return {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 7, 3.5, 10, 5, 14, 6.5],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': mutedStrokeColor(),
      'circle-stroke-width': 1.2,
      'circle-opacity': 0,
    };
  }
  function staleDotPaint() {
    return {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 4.5, 10, 6.5, 14, 8.5],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': mutedStrokeColor(),
      'circle-stroke-width': 1.8,
      'circle-opacity': 0,
    };
  }
  function valueDotPaint() {
    return {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 7, 5, 10, 7, 14, 9],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': dotStrokeColor(),
      'circle-stroke-width': 1.2,
      'circle-opacity': 0.95,
    };
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

  function spiderCirclePaint() {
    const byCat = (ok, stale, nodata) =>
      ['match', ['get', 'cat'], 'stale', stale, 'nodata', nodata, ok];
    return {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4,  byCat(3.5, 3,   2.5),
        7,  byCat(5,   4.5, 3.5),
        10, byCat(7,   6.5, 5),
        14, byCat(9,   8.5, 6.5)],
      'circle-color':        ['get', 'color'],
      'circle-opacity':      byCat(0.95, 0, 0),
      'circle-stroke-color': byCat(dotStrokeColor(), mutedStrokeColor(), mutedStrokeColor()),
      'circle-stroke-width': byCat(1.2, 1.8, 1.2),
    };
  }

  // Layer filters per category + network visibility (applied at feature level
  // via the `net` property so the source doesn't need re-emitting). Main dot
  // layers show only bucket anchors; siblings appear via the spider fan-out.
  const ANCHOR_ONLY = ['==', ['get', 'colocationIndex'], 0];
  function netMatch() {
    return ['in', ['get', 'sub_network'], ['literal', [...activeNetworks]]];
  }
  function valueFilter()  { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'ok'],     netMatch()]; }
  function staleFilter()  { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'stale'],  netMatch(), ['literal', staleShown]]; }
  function nodataFilter() { return ['all', ANCHOR_ONLY, ['==', ['get', 'cat'], 'nodata'], netMatch(), ['literal', nodataShown]]; }
  function badgeFilter()  { return ['all', ANCHOR_ONLY, ['>', ['get', 'colocationCount'], 1], netMatch()]; }
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
    if (map.getLayer('stations-badge')) map.setFilter('stations-badge', badgeFilter());
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
  const netRank = (n) => n === 'HydroMet' ? 0 : n === 'AgriMet' ? 1 : 99;
  function catVisible(cat) {
    return cat === 'ok' || (cat === 'stale' && staleShown) || (cat === 'nodata' && nodataShown);
  }
  // A station is a bucket member only while its network AND category are
  // visible — so the badge counts what you can actually expand, and a hidden
  // anchor automatically promotes its sibling.
  function recomputeColocation(catById) {
    bucketMembers.clear(); bucketAnchor.clear(); bucketIndex.clear();
    for (const s of stations) {
      if (s.sub_network && !activeNetworks.has(s.sub_network)) continue;
      if (!catVisible(catById.get(s.station))) continue;
      const k = bucketById.get(s.station);
      let arr = bucketMembers.get(k);
      if (!arr) { arr = []; bucketMembers.set(k, arr); }
      arr.push(s);
    }
    for (const [k, members] of bucketMembers) {
      members.sort((a, b) => netRank(a.sub_network) - netRank(b.sub_network)
                          || a.station.localeCompare(b.station));
      bucketAnchor.set(k, members[0].station);
      members.forEach((s, i) => bucketIndex.set(s.station, i));
    }
  }

  // ── Render pipeline ──────────────────────────────────────────────────────
  function setSyncStamp(text) { refreshStampEl.textContent = text; }

  async function render({ background = false } = {}) {
    const token = ++renderToken;
    const entry = REGISTRY_BY_KEY.get(activeVar);
    if (!entry) return;
    if (!background) { setSyncStamp('loading…'); showLoading(); }

    let rows;
    try {
      rows = await fetchRowsFor(entry, activeMode, activeDate, activeHour, activeUnits);
    } catch (err) {
      if (token !== renderToken) return;
      console.error(err);
      setSyncStamp('error');
      hideLoading();
      if (!background) showRenderError(entry);
      showToast(entry.source === 'change'
        ? 'Soil-moisture change is temporarily unavailable'
        : `Data fetch failed: ${err.message}`, 6000);
      return;
    }
    if (token !== renderToken) return;

    const { byStation, unit, maxDt } = aggActive(entry)
      ? extractAggValues(rows, entry, activeAgg)
      : extractValues(rows, entry, activeUnits);

    // Stale classification (latest mode only; rows lacking a timestamp are
    // treated as current — e.g. precip windows).
    const now = Date.now();
    const isStale = (dt) =>
      activeMode === 'latest' && typeof dt === 'number' && (now - dt) > STALE_MS;

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
    recomputeColocation(catById);

    // Pass 2 — build features at true coordinates (anchors carry the badge).
    const counts = { ok: 0, stale: 0, nodata: 0 };
    const features = [];
    _propsById.clear();
    for (const s of stations) {
      const rec = byStation.get(s.station);
      const cat = catById.get(s.station);
      let color = NULL_COLOR, label = '', value = null, dt = null;
      if (rec) {
        value = rec.v; dt = rec.dt; label = fmt(rec.v);
        if (cat === 'ok') color = scale(scale.xform ? scale.xform(rec.v) : rec.v);
      }
      if (activeNetworks.has(s.sub_network)) counts[cat]++;
      const props = {
        station: s.station, name: s.name, sub_network: s.sub_network,
        cat, color, label, value, dt,
        bucket: bucketById.get(s.station),
        colocationIndex: bucketIndex.get(s.station) ?? 0,
        colocationCount: bucketIndex.has(s.station)
          ? bucketMembers.get(bucketById.get(s.station)).length : 1,
      };
      _propsById.set(s.station, props);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: props,
      });
    }
    _lastFC = { type: 'FeatureCollection', features };
    _lastRender = { entry, unit, scale, fmt, counts, maxDt };
    map.getSource('stations')?.setData(_lastFC);
    applyDotFilters();
    if (_spiderBucket) rebuildSpider();
    renderLegend();
    updateSyncStampFromData();
    hideLoading();
    refreshOpenPopup();
    renderSRTable();
    if (!background) {
      // Tell screen-reader users the map updated — nothing else announces it.
      const disp = scale.displayDomain;
      const scalePart = Number.isFinite(disp[0]) && Number.isFinite(disp[1])
        ? `, scale ${fmt(disp[0])} to ${fmt(disp[1])}${unit ? ' ' + unit : ''}` : '';
      srAnnounceEl.textContent = `${entry.label}: ${counts.ok} stations reporting${scalePart}.`;
    }
  }

  // Non-visual access to the dataset: the WebGL dots are unreachable by
  // keyboard and invisible to AT, so every render also fills a hidden table.
  const srTableEl = document.getElementById('sr-station-table');
  function renderSRTable() {
    if (!_lastRender || !srTableEl) return;
    const { entry, unit } = _lastRender;
    srTableEl.innerHTML = '';
    const caption = document.createElement('caption');
    caption.textContent = `${entry.label}${unit ? ` (${unit})` : ''} by station`;
    srTableEl.appendChild(caption);
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['Station', 'Network', 'Value', 'Observed']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    srTableEl.appendChild(thead);
    const tbody = document.createElement('tbody');
    const rows = _lastFC.features
      .map(f => f.properties)
      .filter(p => activeNetworks.has(p.sub_network))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const p of rows) {
      const tr = document.createElement('tr');
      const cells = [
        `${p.name} (${p.station})`,
        p.sub_network || '—',
        p.cat === 'nodata' || p.value == null
          ? 'no data'
          : `${p.label}${unit ? ' ' + unit : ''}${p.cat === 'stale' ? ' (stale)' : ''}`,
        typeof p.dt === 'number' ? formatStampMT(p.dt) : '—',
      ];
      cells.forEach((text, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = text;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    }
    srTableEl.appendChild(tbody);
  }

  // Keep an open popup in step with the map — variable/time/unit changes and
  // the auto-refresh would otherwise leave it showing a stale snapshot.
  function refreshOpenPopup() {
    if (!_popup || !_selectedStation) return;
    const el = _popup.getElement();
    const hadFocus = el && el.contains(document.activeElement);
    _popup.setHTML(popupHTML(_selectedStation));
    initPhotoCarousel(_popup, _selectedStation);
    wireSiblingLinks(_popup);
    if (hadFocus) focusPopupContent(_popup);
  }

  function updateSyncStampFromData() {
    if (!_lastRender) return;
    const { maxDt } = _lastRender;
    if (activeMode === 'latest') {
      setSyncStamp(maxDt ? `as of ${formatStampMT(maxDt)}` : 'current');
    } else if (activeMode === 'hourly') {
      setSyncStamp(`${activeDate} ${pad2(activeHour)}:00 MT`);
    } else {
      setSyncStamp(activeDate);
    }
  }

  function updateEmptyState() {
    if (!stations.length) { emptyStateEl.hidden = true; return; }
    let msg = null;
    if (activeNetworks.size === 0) {
      msg = '<strong>No networks selected.</strong> Click HydroMet or AgriMet to show stations.';
    } else if (_lastRender && _lastRender.counts.ok === 0) {
      const label = _lastRender.entry.label;
      msg = `<strong>No data</strong> for ${escapeHTML(label)} at this time. Try another variable, date, or time mode.`;
    }
    if (msg) {
      emptyStateEl.innerHTML = `<div class="empty-state-card">${msg}</div>`;
      emptyStateEl.hidden = false;
    } else {
      emptyStateEl.hidden = true;
    }
  }

  // Persistent error cards in the empty-state slot (a 2.8 s toast is the only
  // other signal, and the navbar stamp is hidden on phones). A later
  // successful render clears them via updateEmptyState().
  function showErrorCard(msgHTML, onRetry) {
    emptyStateEl.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'empty-state-card';
    const span = document.createElement('span');
    span.innerHTML = msgHTML;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'empty-state-retry';
    btn.textContent = 'Retry';
    btn.addEventListener('click', () => { emptyStateEl.hidden = true; onRetry(); });
    card.append(span, btn);
    emptyStateEl.appendChild(card);
    emptyStateEl.hidden = false;
  }
  function showRenderError(entry) {
    showErrorCard(
      `<strong>Couldn’t load ${escapeHTML(entry.label)}.</strong> The map still shows the previous selection.`,
      () => render());
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
    legendGradientEl.style.background = `linear-gradient(to right, ${stops.join(', ')})`;

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
        applyDotFilters(); render({ background: true }); pushState();
      },
    });
    if (activeMode === 'latest') {
      addLegendRow(legendRowsEl, {
        label: `Stale > 3 h (${counts.stale})`,
        swatchClass: 'stale',
        pressed: staleShown,
        onToggle: () => {
          staleShown = !staleShown;
          applyDotFilters(); render({ background: true }); pushState();
        },
      });
    }

    renderOverlayChecks();

    // Meta line
    if (activeMode === 'latest') {
      let meta = maxDt
        ? `Data current as of ${formatStampMT(maxDt)}`
        : 'Current accumulations';
      if (!staleShown && counts.stale > 0) {
        meta += ` · ${counts.stale} station${counts.stale === 1 ? '' : 's'} hidden (no report in 3 h)`;
      }
      legendMetaEl.textContent = meta;
    } else if (activeMode === 'hourly') {
      legendMetaEl.textContent = `Hour beginning ${formatDateStr(activeDate)}, ${pad2(activeHour)}:00 MT`;
    } else {
      legendMetaEl.textContent = `Daily aggregate for ${formatDateStr(activeDate)}${dailyPartialSuffix()}`;
    }

  }

  // "Today" in Daily mode is an aggregate of an incomplete day — label it so
  // a 9 AM view of daily precipitation isn't read as a full-day total.
  function dailyPartialSuffix() {
    return (activeMode === 'daily' && activeDate === todayMT())
      ? ` (partial day, through ${hhmmNowMT()} MT)` : '';
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
    row.className = 'legend-row';
    row.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    if (!pressed) row.classList.add('off');
    const sw = document.createElement('span');
    sw.className = `legend-swatch ${swatchClass}`;
    sw.setAttribute('aria-hidden', 'true');
    const lb = document.createElement('span');
    lb.className = 'legend-lbl';
    lb.textContent = label;
    row.appendChild(sw);
    row.appendChild(lb);
    row.addEventListener('click', onToggle);
    parent.appendChild(row);
  }

  function renderOverlayChecks() {
    legendOverlaysEl.innerHTML = '';
    const mk = (label, checked, disabled, onChange, title) => {
      const wrap = document.createElement('label');
      wrap.className = `legend-check${disabled ? ' disabled' : ''}`;
      if (title) wrap.title = title;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.disabled = disabled;
      cb.addEventListener('change', () => onChange(cb.checked));
      const sp = document.createElement('span');
      sp.textContent = label;
      wrap.appendChild(cb);
      wrap.appendChild(sp);
      legendOverlaysEl.appendChild(wrap);
    };
    mk('Counties', overlayCounties, false, (on) => {
      overlayCounties = on;
      setOverlayVisibility();
      pushState();
    });
    mk('Watersheds', overlayWatersheds, false, (on) => {
      overlayWatersheds = on;
      setOverlayVisibility();
      pushState();
      if (on && !_hucFC) {
        loadHucOnce().catch(() => showToast('Watershed boundaries failed to load'));
      }
    });
    mk('Radar (live)', radarOn, activeMode !== 'latest', (on) => {
      radarWanted = on;
      setRadar(on);
    }, activeMode !== 'latest' ? 'Radar is available in Latest mode' : 'NEXRAD base reflectivity');
  }

  function setOverlayVisibility() {
    const vis = (on) => on ? 'visible' : 'none';
    if (map.getLayer('county-line')) map.setLayoutProperty('county-line', 'visibility', vis(overlayCounties));
    if (map.getLayer('huc-line'))    map.setLayoutProperty('huc-line',    'visibility', vis(overlayWatersheds));
  }

  // ── Radar overlay (legend checkbox is the only toggle) ──────────────────
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
    pushState();
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
        opt.textContent = e.label;
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
    pushState();
  });

  // ── Aggregation selector ─────────────────────────────────────────────────
  function syncAggUI() {
    aggGroup.hidden = activeMode === 'latest';
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
    pushState();
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
    updateControlBarFade();
  }

  function setMode(mode) {
    if (mode === activeMode) return;
    activeMode = mode;
    // Clamp the time selection into range for the new mode.
    if (mode === 'hourly') {
      const last = lastCompleteHourMT();
      if (activeDate > last.date || (activeDate === last.date && activeHour > last.hour)) {
        activeDate = last.date; activeHour = last.hour;
      }
      dateInput.value = activeDate;
      updateHourReadout();
    } else if (mode === 'daily') {
      if (activeDate > todayMT()) activeDate = todayMT();
      dateInput.value = activeDate;
    }
    dateInput.max = maxDateForMode();   // hourly excludes the incomplete hour's day
    // Fall back if the current variable isn't available in this mode.
    const entry = REGISTRY_BY_KEY.get(activeVar);
    if (!entry.modes.includes(mode)) {
      activeVar = 'air_temp';
      showToast(`${entry.label} isn't available in ${mode} mode — showing Air Temperature`);
    }
    populateVariableSelect();
    syncAggUI();
    syncModeUI();
    if (mode === 'latest' && radarWanted && !radarOn) setRadar(true);
    scheduleRefresh();
    render();
    pushState();
  }
  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  }

  function maxDateForMode() {
    return activeMode === 'hourly' ? lastCompleteHourMT().date : todayMT();
  }
  function setDate(dateStr) {
    let d = dateStr;
    const maxD = maxDateForMode();
    if (d < earliestDate) { d = earliestDate; showToast(`Earliest available date: ${formatDateStr(d)}`); }
    if (d > maxD)         { d = maxD;         showToast('No future dates available'); }
    activeDate = d;
    dateInput.value = d;
    if (activeMode === 'hourly') clampHour();
    render();
    pushState();
  }
  dateInput.addEventListener('change', () => setDate(dateInput.value));

  // Pointer hold-to-repeat via a timer; Enter/Space step too (held keys
  // repeat through the OS key-repeat, so the timer is pointer-only).
  function makeStepper(btnId, step) {
    const btn = document.getElementById(btnId);
    let timeout, interval;
    const start = () => {
      step();
      timeout = setTimeout(() => { interval = setInterval(step, 150); }, 450);
    };
    const stop = () => { clearTimeout(timeout); clearInterval(interval); };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(); }
    });
  }
  makeStepper('btn-date-next', () => setDate(shiftDate(activeDate, +1)));
  makeStepper('btn-date-prev', () => setDate(shiftDate(activeDate, -1)));

  function updateHourReadout() {
    hourReadout.textContent = `${pad2(activeHour)}:00`;
  }
  function clampHour() {
    const last = lastCompleteHourMT();
    if (activeDate === last.date && activeHour > last.hour) activeHour = last.hour;
    if (activeDate > last.date) { activeDate = last.date; dateInput.value = activeDate; }
    updateHourReadout();
  }
  function stepHour(delta) {
    let h = activeHour + delta;
    let d = activeDate;
    if (h > 23) { h = 0; d = shiftDate(d, 1); }
    if (h < 0)  { h = 23; d = shiftDate(d, -1); }
    const last = lastCompleteHourMT();
    if (d > last.date || (d === last.date && h > last.hour)) {
      showToast('That hour isn\'t complete yet');
      return;
    }
    if (d < earliestDate) { showToast(`Earliest available date: ${formatDateStr(earliestDate)}`); return; }
    activeHour = h;
    if (d !== activeDate) { activeDate = d; dateInput.value = d; }
    updateHourReadout();
    render();
    pushState();
  }
  makeStepper('btn-hour-next', () => stepHour(+1));
  makeStepper('btn-hour-prev', () => stepHour(-1));

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
      lsSet('mco-explorer-units', activeUnits);
      if (scaleLocked()) {
        scaleOverride = scaleOverride.ramp
          ? { ramp: scaleOverride.ramp, rev: scaleOverride.rev }  // keep the ramp choice
          : null;
        showToast('Custom scale range cleared — units changed');
      }
      syncUnitsUI();
      render();
      pushState();
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
      chip.className = 'chip';
      chip.dataset.network = net;
      chip.setAttribute('aria-pressed', activeNetworks.has(net) ? 'true' : 'false');
      chip.title = NETWORK_DESC[net] || `Show or hide ${net} stations`;
      const lbl = document.createElement('span');
      lbl.textContent = net;
      const count = document.createElement('span');
      count.className = 'chip-count';
      count.textContent = String(byNet[net] || 0);
      chip.appendChild(lbl);
      chip.appendChild(count);
      chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) activeNetworks.add(net);
        else    activeNetworks.delete(net);
        lsSet('mco-explorer-networks', JSON.stringify([...activeNetworks]));
        applyDotFilters();
        render({ background: true });   // recompute scale domain for visible nets
        pushState();
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
    lsSet('mco-explorer-labels', labelsOn ? 'on' : 'off');
    for (const lid of ['dots-label', 'spider-label']) {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', labelsOn ? 'visible' : 'none');
    }
    pushState();
  });

  // ── Legend collapse ──────────────────────────────────────────────────────
  const legendEl        = document.getElementById('legend');
  const legendToggleBtn = document.getElementById('legend-toggle-btn');
  let legendCollapsed = (() => {
    const u = getLower('legend');
    if (u === 'open' || u === 'collapsed') return u === 'collapsed';
    const saved = localStorage.getItem('mco-explorer-legend');
    if (saved === 'collapsed' || saved === 'expanded') return saved === 'collapsed';
    // First visit on a small screen: start collapsed so the map isn't covered.
    return window.matchMedia('(max-width: 640px)').matches;
  })();
  function setLegendCollapsed(collapsed) {
    legendCollapsed = !!collapsed;
    legendEl.classList.toggle('collapsed', legendCollapsed);
    legendToggleBtn.setAttribute('aria-expanded', legendCollapsed ? 'false' : 'true');
    legendToggleBtn.setAttribute('aria-label', legendCollapsed ? 'Expand legend' : 'Collapse legend');
    lsSet('mco-explorer-legend', legendCollapsed ? 'collapsed' : 'expanded');
    updateLegendTitle();   // the collapsed title carries the hidden-stale count
  }
  setLegendCollapsed(legendCollapsed);
  legendToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();   // the header row toggles too — don't double-fire
    setLegendCollapsed(!legendCollapsed);
    pushState();
  });
  // The whole header row is a natural click target, not just the 22px chevron.
  document.getElementById('legend-header').addEventListener('click', () => {
    setLegendCollapsed(!legendCollapsed);
    pushState();
  });

  // ── Scale editor (click the legend gradient) ─────────────────────────────
  const scaleModal   = document.getElementById('scale-modal');
  const scaleRampSel = document.getElementById('scale-ramp');
  const scaleRevCb   = document.getElementById('scale-rev');
  const scaleMinIn   = document.getElementById('scale-min');
  const scaleMidIn   = document.getElementById('scale-mid');
  const scaleMaxIn   = document.getElementById('scale-max');
  const scaleHintEl  = document.getElementById('scale-hint');

  for (const g of RAMP_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const r of g.ramps) {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = r;
      og.appendChild(o);
    }
    scaleRampSel.appendChild(og);
  }

  function paintScalePreview() {
    let stops = RAMPS[scaleRampSel.value] || RAMPS.YlGnBu;
    if (scaleRevCb.checked) stops = [...stops].reverse();
    const parts = stops.map((c, i) => `${c} ${(i / (stops.length - 1) * 100).toFixed(1)}%`);
    document.getElementById('scale-preview').style.background =
      `linear-gradient(to right, ${parts.join(', ')})`;
  }

  function openScaleEditor() {
    if (!_lastRender) return;
    const { entry, unit, scale } = _lastRender;
    document.getElementById('scale-modal-var').textContent =
      unit ? `${entry.label} [${unit}]` : entry.label;
    scaleRampSel.value = scaleOverride?.ramp || entry.scale.ramp;
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
    scaleModal.showModal();
  }
  legendGradientBtn.addEventListener('click', openScaleEditor);
  scaleRampSel.addEventListener('change', paintScalePreview);
  scaleRevCb.addEventListener('change', paintScalePreview);
  scaleModal.addEventListener('click', (e) => {
    if (e.target === scaleModal || e.target.dataset.closeModal !== undefined) scaleModal.close();
  });
  scaleModal.addEventListener('close', () => legendGradientBtn.focus());

  document.getElementById('scale-apply').addEventListener('click', () => {
    const entry = REGISTRY_BY_KEY.get(activeVar);
    const fixed = !!entry.scale.domain;
    const isLog = !!entry.scale.log;
    const o = {};
    if (scaleRampSel.value !== entry.scale.ramp || scaleRevCb.checked !== !!entry.scale.rev) {
      o.ramp = scaleRampSel.value;
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
    pushState();
  });
  document.getElementById('scale-reset').addEventListener('click', () => {
    scaleOverride = null;
    scaleModal.close();
    showToast('Scale reset to automatic');
    render({ background: true });
    pushState();
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
      showToast('Scale unlocked — range follows the data again');
    } else if (_lastRender) {
      const [lo, hi] = _lastRender.scale.displayDomain;
      scaleOverride = { ...(scaleOverride || {}), min: lo, max: hi };
      showToast('Scale locked — it will stay put as you change dates');
    }
    // Reflect the new state immediately — the render below may wait on a fetch.
    legendPinBtn.setAttribute('aria-pressed', scaleLocked() ? 'true' : 'false');
    render({ background: true });   // data is cached; just recolor + relabel
    pushState();
  }

  // ── Search ───────────────────────────────────────────────────────────────
  let _searchSorted = [];
  let _activeSearchIndex = -1;
  const SEARCH_MAX_RESULTS = 8;

  function populateSearch() {
    _searchSorted = [...stations].sort((a, b) => a.name.localeCompare(b.name));
  }

  function matchScore(s, q) {
    const n = s.name.toLowerCase();
    const id = s.station.toLowerCase();
    if (n === q || id === q)   return 0;
    if (n.startsWith(q))       return 1;
    if (id.startsWith(q))      return 2;
    if (n.includes(q))         return 3;
    if (id.includes(q))        return 4;
    return Infinity;
  }

  function showSearchDropdown(rawQuery) {
    const q = rawQuery.trim().toLowerCase();
    if (!q) { hideSearchDropdown(); return; }
    const matches = _searchSorted
      .map(s => ({ s, score: matchScore(s, q) }))
      .filter(m => m.score < Infinity)
      .sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name))
      .slice(0, SEARCH_MAX_RESULTS)
      .map(m => m.s);
    searchDropdown.innerHTML = '';
    if (matches.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.setAttribute('role', 'option');   // listbox children must be options
      li.setAttribute('aria-disabled', 'true');
      li.textContent = `No stations match "${rawQuery.trim()}"`;
      searchDropdown.appendChild(li);
      searchDropdown.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
      _activeSearchIndex = -1;
      srAnnounceEl.textContent = 'No matching stations.';
      return;
    }
    for (const s of matches) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.stationId = s.station;
      li.id = `search-opt-${s.station}`;
      const name = document.createElement('span');
      name.className = 'search-name';
      name.textContent = s.name;
      const meta = document.createElement('span');
      meta.className = 'search-meta';
      meta.textContent = `${s.station} · ${s.sub_network || '—'}`;
      li.appendChild(name);
      li.appendChild(meta);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectStation(s.station);
      });
      searchDropdown.appendChild(li);
    }
    searchDropdown.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    _activeSearchIndex = -1;
    searchInput.removeAttribute('aria-activedescendant');
    srAnnounceEl.textContent =
      `${matches.length} station${matches.length === 1 ? '' : 's'} found.`;
  }

  function hideSearchDropdown() {
    searchDropdown.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    _activeSearchIndex = -1;
    searchInput.removeAttribute('aria-activedescendant');
  }

  function selectStation(stationId) {
    hideSearchDropdown();
    _popupFocusReturn = searchInput;   // hand focus back here when the popup closes
    flyToAndOpen(stationId);
    searchInput.value = '';
  }

  function setActiveSearchItem(idx) {
    const items = searchDropdown.querySelectorAll('li');
    if (!items.length) return;
    if (idx < 0)             idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    _activeSearchIndex = idx;
    items.forEach((it, i) => {
      it.classList.toggle('active', i === idx);
      it.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    items[idx].scrollIntoView({ block: 'nearest' });
    searchInput.setAttribute('aria-activedescendant', items[idx].id);
  }

  searchInput.addEventListener('input',  () => showSearchDropdown(searchInput.value));
  searchInput.addEventListener('focus',  () => { if (searchInput.value) showSearchDropdown(searchInput.value); });
  searchInput.addEventListener('blur',   () => setTimeout(hideSearchDropdown, 120));

  function flyToAndOpen(stationId) {
    const s = stationById.get(stationId);
    if (!s) { showToast('Station not found'); return; }
    if (s.sub_network && !activeNetworks.has(s.sub_network)) {
      activeNetworks.add(s.sub_network);
      lsSet('mco-explorer-networks', JSON.stringify([...activeNetworks]));
      for (const chip of subnetFiltersEl.querySelectorAll('.chip')) {
        if (chip.dataset.network === s.sub_network) chip.setAttribute('aria-pressed', 'true');
      }
      applyDotFilters();
      render({ background: true });   // recompute colocation for the re-enabled network
    }
    closeSpider();
    map.flyTo({
      center: [s.longitude, s.latitude],
      zoom: SEARCH_FLY_ZOOM, speed: SEARCH_FLY_SPEED, animate: !reduceMotion,
    });
    map.once('moveend', () => openPopupFor(stationId));
  }

  // ── Popup ────────────────────────────────────────────────────────────────
  function stationRecord(stationId) {
    // Current variable's value record for the popup/tooltip, from the last FC.
    const f = _lastFC.features.find(x => x.properties.station === stationId);
    return f ? f.properties : null;
  }

  function popupHTML(stationId) {
    const s = stationById.get(stationId);
    if (!s) return '';
    const rec = stationRecord(stationId);
    const lr = _lastRender;
    const elev = (typeof s.elevation === 'number')
      ? (activeUnits === 'us' ? `${Math.round(s.elevation * 3.28084)} ft` : `${Math.round(s.elevation)} m`)
      : '—';
    const installed = (typeof s.date_installed === 'number') ? formatDateMT(s.date_installed) : '—';

    let valueBlock = '';
    if (lr && rec) {
      const varLabel = escapeHTML(lr.entry.label);
      const unit = lr.unit ? escapeHTML(lr.unit) : '';
      let num, timeLine = '', accent = 'var(--accent)';
      if (rec.cat === 'nodata' || rec.value == null) {
        num = '—';
        timeLine = 'No data for this selection';
      } else {
        num = `${escapeHTML(lr.fmt(rec.value))}<span class="pop-unit">${unit}</span>`;
        if (rec.color && rec.cat === 'ok') accent = rec.color;
        if (rec.dt) {
          timeLine = activeMode === 'daily'
            ? escapeHTML(formatDateMT(rec.dt))
            : escapeHTML(formatStampMT(rec.dt));
          if (rec.cat === 'stale') timeLine += ' · stale';
        }
      }
      valueBlock = `
        <div class="pop-value" style="--pop-accent:${escapeHTML(accent)}">
          <div class="pop-value-var">${varLabel}</div>
          <div class="pop-value-num">${num}</div>
          ${timeLine ? `<div class="pop-value-time">${timeLine}</div>` : ''}
        </div>`;
    }

    // Co-located stations, reachable without the pointer-only spider.
    const sibs = (bucketMembers.get(bucketById.get(stationId)) || [])
      .filter(m => m.station !== stationId);
    const sibBlock = sibs.length ? `
      <div class="pop-siblings">Also at this site: ${sibs.map(m =>
        `<button type="button" class="pop-sibling-link" data-station="${escapeHTML(m.station)}">${escapeHTML(m.name)} (${escapeHTML(m.sub_network || '—')})</button>`
      ).join(', ')}</div>` : '';

    return `
      <div class="pop-title">${escapeHTML(s.name)}</div>
      <div class="pop-sub">${escapeHTML(s.station)}${s.county ? ` · ${escapeHTML(s.county)} County` : ''}</div>
      <div style="margin-top:6px">
        <span class="pop-badge">${escapeHTML(s.sub_network || '—')}</span>
      </div>
      ${valueBlock}
      <div class="pop-meta">
        <div><strong>Elevation:</strong> ${elev}</div>
        <div><strong>Installed:</strong> ${installed}</div>
      </div>
      ${sibBlock}
      <div class="pop-links">
        <a href="${DASH_URL(stationId)}" target="_blank" rel="noopener">Station dashboard →</a>
        <a href="${API}/latest/?stations=${encodeURIComponent(stationId)}" target="_blank" rel="noopener">Latest data (API) →</a>
      </div>
      <div class="pop-carousel" hidden>
        <div class="pop-carousel-frame">
          <img class="pop-carousel-img" alt="Station camera photo">
          <button type="button" class="pop-carousel-btn prev" aria-label="Previous photo">&#8249;</button>
          <button type="button" class="pop-carousel-btn next" aria-label="Next photo">&#8250;</button>
        </div>
        <div class="pop-carousel-caption" role="status">
          <span class="pop-carousel-dir"></span>
          <span class="pop-carousel-counter"></span>
        </div>
      </div>
    `;
  }

  // ── Photo carousel ───────────────────────────────────────────────────────
  // /photos/ metadata lists each station's camera directions; images are
  // served time-matched via the dt param. One metadata fetch serves all
  // popups; a failure clears the cache so a later popup retries.
  let _photoMetaPromise = null;
  function fetchPhotoMeta() {
    if (!_photoMetaPromise) {
      _photoMetaPromise = fetchJSON(`${API}/photos/?type=json`).then(rows => new Map(
        rows.map(r => [r['Station ID'], {
          start: r['Photo Start Date'] || null,
          dirs: (r['Photo Directions'] || []).map(d => {
            const m = d.match(/^(\S+)\s*\(([^)]*)\)/);   // "NS (North Sky)" → ns / North Sky
            return { code: (m ? m[1] : d).toLowerCase(), label: m ? m[2] : d };
          }),
        }]))
      ).catch(err => { _photoMetaPromise = null; throw err; });
    }
    return _photoMetaPromise;
  }

  function photoFrames(stationId, dirs) {
    const url = (code, dt) =>
      `${API}/photos/${encodeURIComponent(stationId)}/${encodeURIComponent(code)}/?web=true` +
      (dt ? `&dt=${dt}&tz=${encodeURIComponent(TZ)}` : '');
    if (activeMode === 'latest') {
      return dirs.map(d => ({ url: url(d.code), caption: d.label, state: 'pending' }));
    }
    if (activeMode === 'hourly') {
      const dt = hourWindow(activeDate, activeHour).end;
      return dirs.map(d => ({ url: url(d.code, dt), caption: d.label, state: 'pending' }));
    }
    return dirs.flatMap(d => [
      { url: url(d.code, `${activeDate}T09:00:00`), caption: `${d.label} · Morning`,   state: 'pending' },
      { url: url(d.code, `${activeDate}T15:00:00`), caption: `${d.label} · Afternoon`, state: 'pending' },
    ]);
  }

  async function initPhotoCarousel(popup, stationId) {
    let meta;
    try { meta = (await fetchPhotoMeta()).get(stationId); } catch { return; }
    if (!meta || !meta.dirs.length) return;
    if (activeMode !== 'latest' && meta.start && activeDate < meta.start) return;
    if (_popup !== popup || !popup.isOpen()) return;    // replaced while awaiting
    const root = popup.getElement()?.querySelector('.pop-carousel');
    if (!root) return;

    const frames = photoFrames(stationId, meta.dirs);
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
      if (frames.every(f => f.state === 'bad')) { root.hidden = true; return; }
      show(idx + 1);   // auto-skip; each error removes a frame from rotation
    });
    root.querySelector('.prev').addEventListener('click', () => show(idx - 1));
    root.querySelector('.next').addEventListener('click', () => show(idx + 1));
    if (frames.length < 2) root.querySelectorAll('.pop-carousel-btn').forEach(b => b.hidden = true);
    root.hidden = false;
    show(0);
  }

  function openPopupFor(stationId, lngLat) {
    const s = stationById.get(stationId);
    if (!s) return;
    if (_popup) { _suppressNextPopupClose = true; _popup.remove(); _popup = null; }
    _selectedStation = stationId;
    const p = new maplibregl.Popup({ closeOnClick: false, maxWidth: '320px', offset: 12 })
      .setLngLat(lngLat || [s.longitude, s.latitude])
      .setHTML(popupHTML(stationId))
      .addTo(map);
    p.on('close', () => {
      if (_suppressNextPopupClose) { _suppressNextPopupClose = false; return; }
      if (_popup === p) {
        _popup = null;
        _selectedStation = null;
        restorePopupFocus();
        pushState();
      }
    });
    _popup = p;
    initPhotoCarousel(p, stationId);
    wireSiblingLinks(p);
    announcePopup(stationId);
    focusPopupContent(p);
    pushState();
  }

  // Focus the content container (not the close button — MapLibre appends it
  // as the LAST tabbable, so Tab would immediately exit the popup).
  function focusPopupContent(p) {
    const content = p.getElement()?.querySelector('.maplibregl-popup-content');
    if (content) { content.tabIndex = -1; content.focus(); }
  }

  function restorePopupFocus() {
    const target = _popupFocusReturn || map.getCanvas();
    _popupFocusReturn = null;
    // Only restore when removal stranded focus on <body> (it was inside the
    // popup); a click elsewhere already put focus where the user wants it.
    if (document.activeElement && document.activeElement !== document.body) return;
    target.focus?.();
  }

  // Keyboard path to co-located stations (the canvas spider is pointer-only).
  function wireSiblingLinks(p) {
    p.getElement().querySelectorAll('.pop-sibling-link').forEach(btn => {
      btn.addEventListener('click', () => openPopupFor(btn.dataset.station));
    });
  }

  function announcePopup(stationId) {
    const s = stationById.get(stationId);
    if (!s || !srAnnounceEl) return;
    const rec = stationRecord(stationId);
    const lr = _lastRender;
    let valPart = 'no data';
    if (rec && rec.value != null && lr) {
      valPart = `${lr.entry.label} ${lr.fmt(rec.value)} ${lr.unit || ''}`;
    }
    srAnnounceEl.textContent = `${s.name} (${s.station}), ${s.sub_network || 'station'}, ${valPart}.`;
  }

  function closePopup() {
    if (!_popup) return;
    _suppressNextPopupClose = true;
    _popup.remove();
    _popup = null;
    restorePopupFocus();
    if (_selectedStation) {
      _selectedStation = null;
      pushState();
    }
  }

  // ── Spider fan-out lifecycle (ported from mesonet-status) ────────────────
  function openSpider(key, anchorLngLat) {
    _spiderBucket = key;
    rebuildSpider(anchorLngLat);
  }
  function closeSpider() {
    if (_spiderBucket == null) return;
    _spiderBucket = null;
    map.getSource('spider')?.setData(emptyFC());
    map.getSource('spider-lines')?.setData(emptyFC());
  }
  function rebuildSpider(anchorLngLatHint) {
    if (_spiderBucket == null || !map.getSource('spider')) return;
    const members = bucketMembers.get(_spiderBucket) || [];
    if (members.length <= 1) { closeSpider(); return; }

    const anchorId   = bucketAnchor.get(_spiderBucket);
    const anchorMeta = stationById.get(anchorId);
    const anchorLngLat = anchorLngLatHint || [anchorMeta.longitude, anchorMeta.latitude];
    const anchorPx = map.project(anchorLngLat);
    const others = members.filter(m => m.station !== anchorId).map(m => m.station);
    const stroke = dotStrokeColor();

    const feet = [];
    const lines = [];
    others.forEach((sid, i) => {
      const theta = (i / others.length) * 2 * Math.PI - Math.PI / 2;   // start at top
      const ll = map.unproject({
        x: anchorPx.x + SPIDER_RADIUS_PX * Math.cos(theta),
        y: anchorPx.y + SPIDER_RADIUS_PX * Math.sin(theta),
      });
      const base = _propsById.get(sid);
      if (!base) return;
      feet.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        properties: { ...base, colocationCount: 1, colocationIndex: 0 },
      });
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [anchorLngLat, [ll.lng, ll.lat]] },
        properties: { _strokeColor: stroke },
      });
    });
    map.getSource('spider').setData({ type: 'FeatureCollection', features: feet });
    map.getSource('spider-lines').setData({ type: 'FeatureCollection', features: lines });
  }

  // Grace period so the cursor can travel from the anchor to a foot.
  let _spiderCloseTimer = null;
  function scheduleSpiderClose() {
    if (_spiderCloseTimer) clearTimeout(_spiderCloseTimer);
    _spiderCloseTimer = setTimeout(() => { _spiderCloseTimer = null; closeSpider(); }, SPIDER_CLOSE_GRACE_MS);
  }
  function cancelSpiderClose() {
    if (_spiderCloseTimer) { clearTimeout(_spiderCloseTimer); _spiderCloseTimer = null; }
  }

  // Keep spider feet at constant pixel offset while the camera moves.
  let _spiderMoveRaf = 0;
  map.on('move', () => {
    if (!_spiderBucket || _spiderMoveRaf) return;
    _spiderMoveRaf = requestAnimationFrame(() => { _spiderMoveRaf = 0; rebuildSpider(); });
  });

  // ── Click & hover ────────────────────────────────────────────────────────
  const DOT_LAYERS    = ['dots-value', 'dots-stale', 'dots-nodata', 'dots-label'];
  const ANCHOR_LAYERS = [...DOT_LAYERS, 'stations-badge'];
  const HOVER_LAYERS  = ['spider-layer', 'spider-label', ...ANCHOR_LAYERS];
  const ANCHOR_LAYER_IDS = new Set(ANCHOR_LAYERS);

  // Single dispatcher: foot click opens its popup; anchor click opens the
  // spider AND the anchor's popup (mobile-friendly); empty click closes both.
  map.on('click', (e) => {
    const layers = HOVER_LAYERS.filter(lid => map.getLayer(lid));
    const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
    if (feats.length === 0) {
      closeSpider();
      closePopup();
      return;
    }
    const f =
      feats.find(x => x.layer.id === 'spider-layer' || x.layer.id === 'spider-label') ||
      feats.find(x => x.layer.id === 'dots-value') ||
      feats[0];
    const props  = f.properties;
    const lngLat = f.geometry.coordinates.slice();
    if (f.layer.id === 'spider-layer' || f.layer.id === 'spider-label') {
      openPopupFor(props.station, lngLat);
      return;
    }
    if (props.colocationCount > 1) {
      cancelSpiderClose();
      if (_spiderBucket !== props.bucket) openSpider(props.bucket, lngLat);
      openPopupFor(props.station, lngLat);
      return;
    }
    if (_spiderBucket) closeSpider();
    openPopupFor(props.station, lngLat);
  });

  const tooltipEl = document.getElementById('tooltip');
  function showTooltip(props, e) {
    const lr = _lastRender;
    let valLine = '';
    if (lr) {
      const unit = lr.unit ? ` ${lr.unit}` : '';
      valLine = props.value != null && props.label
        ? `<span class="tooltip-val">${escapeHTML(props.label)}${escapeHTML(unit)}${props.cat === 'stale' ? ' · stale' : ''}</span>`
        : `<span class="tooltip-val">no data</span>`;
    }
    tooltipEl.innerHTML =
      `<span class="tooltip-name">${escapeHTML(props.name)}</span>` +
      `<span class="tooltip-sub">${escapeHTML(props.station)}</span>` +
      valLine;
    tooltipEl.classList.add('visible');
    // Flip to the other side of the cursor near the right/bottom viewport
    // edges so the value isn't clipped.
    const cx = e.originalEvent.clientX, cy = e.originalEvent.clientY, pad = 14;
    let x = cx + pad, y = cy + pad;
    if (x + tooltipEl.offsetWidth  > window.innerWidth  - 8) x = cx - tooltipEl.offsetWidth  - pad;
    if (y + tooltipEl.offsetHeight > window.innerHeight - 8) y = cy - tooltipEl.offsetHeight - pad;
    tooltipEl.style.left = `${Math.max(4, x)}px`;
    tooltipEl.style.top  = `${Math.max(4, y)}px`;
  }
  function hideTooltip() { tooltipEl.classList.remove('visible'); }

  let _hovered = false;
  map.on('mousemove', (e) => {
    const layers = HOVER_LAYERS.filter(lid => map.getLayer(lid));
    const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
    const f = feats[0] || null;
    if (f) {
      map.getCanvas().style.cursor = 'pointer';
      cancelSpiderClose();
      showTooltip(f.properties, e);
      _hovered = true;
      if (ANCHOR_LAYER_IDS.has(f.layer.id)
          && f.properties.colocationCount > 1
          && _spiderBucket !== f.properties.bucket) {
        openSpider(f.properties.bucket, f.geometry.coordinates.slice());
      }
    } else if (_hovered) {
      map.getCanvas().style.cursor = '';
      hideTooltip();
      scheduleSpiderClose();
      _hovered = false;
    }
  });
  map.getCanvas().addEventListener('mouseleave', () => {
    map.getCanvas().style.cursor = '';
    hideTooltip();
    scheduleSpiderClose();
    _hovered = false;
  });

  // ── Control-bar overflow affordance ──────────────────────────────────────
  // ≤640px the bar scrolls horizontally with the scrollbar hidden; fade the
  // right edge while more controls sit off-screen.
  const controlBarEl = document.getElementById('control-bar');
  function updateControlBarFade() {
    const more = controlBarEl.scrollWidth - controlBarEl.clientWidth - controlBarEl.scrollLeft > 4;
    controlBarEl.classList.toggle('scroll-fade', more);
  }
  controlBarEl.addEventListener('scroll', updateControlBarFade, { passive: true });
  window.addEventListener('resize', updateControlBarFade);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // ?kbd=off disables the single-character shortcut (WCAG 2.1.4 — speech-input
  // users can misfire it); Escape handling is unaffected.
  const kbdShortcuts = getLower('kbd') !== 'off';
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (infoModal.open || scaleModal.open) return;   // native dialogs own their Escape
      closeSpider(); closePopup(); return;
    }
    if (kbdShortcuts && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target;
      const inField =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (inField) return;
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();   // dismiss the search only — don't also close a popup
      searchInput.value = '';
      hideSearchDropdown();
      searchInput.blur();
      return;
    }
    if (searchDropdown.hidden) return;
    const items = searchDropdown.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSearchItem(_activeSearchIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSearchItem(_activeSearchIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = _activeSearchIndex >= 0 ? _activeSearchIndex : 0;
      const el = items[idx];
      if (el && el.dataset.stationId) selectStation(el.dataset.stationId);
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
    if (!_lastRender) { showToast('Map not loaded yet.'); return; }
    if (_exporting) return;
    _exporting = true;
    showToast('Exporting…');
    const W = EXPORT_W, H = EXPORT_H;

    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
    document.body.appendChild(holder);

    const xm = new maplibregl.Map({
      container: holder,
      style: basemapStyleUrl(),
      bounds: MT_FIT_BOUNDS,
      fitBoundsOptions: { padding: 24, animate: false },
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,   // required for getCanvas() readback
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
      if (!blob) { showToast('Export failed.'); return; }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: exportFilename() });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Exported!');
    } catch (err) {
      console.error(err);
      showToast('Export failed.');
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
                : `${activeDate}T${pad2(activeHour)}:00:00 MT`;
    }
    return `Daily · ${formatDateStr(activeDate)}${dailyPartialSuffix()}`;
  }
  function exportFilename() {
    const isoCompact = (ms) => isoStampMT(ms).replace(/:/g, '');   // filesystem-safe
    const dt = _lastRender?.maxDt;
    const t = activeMode === 'latest' ? (dt ? isoCompact(dt) : `latest-${todayMT()}`)
            : activeMode === 'hourly' ? (dt ? isoCompact(dt) : `${activeDate}T${pad2(activeHour)}0000`)
            : activeDate;
    return `mesonet-explorer-${activeVar}-${t}.png`;
  }

  // Branding card in the lower-left corner: MCO logo, titles, timestamp, and
  // the color-scale legend (a data map is unreadable without one).
  async function drawBranding(ctx, W, H) {
    const { entry, unit, scale } = _lastRender;
    const bgSurface = cssVar('--bg-surface');
    const borderClr = cssVar('--border');
    const accentLt  = cssVar('--accent-light');
    const textMuted = cssVar('--text-muted');
    const textSec   = cssVar('--text-secondary');

    const BRAND_W = 310, BRAND_BOX_H = 128;
    const BX = 24, BY = H - 24 - BRAND_BOX_H, PAD = 12, LOGO = 46;
    const LX = BX + PAD, LY = BY + PAD;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = bgSurface;
    ctx.beginPath(); roundRectPath(ctx, BX, BY, BRAND_W, BRAND_BOX_H, 10); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = borderClr; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    const logoImg = await loadImg('https://climate.umt.edu/assets/images/MCO_logo_icon_only.png');
    if (logoImg) {
      ctx.save();
      ctx.beginPath(); roundRectPath(ctx, LX, LY, LOGO, LOGO, 8); ctx.clip();
      ctx.drawImage(logoImg, LX, LY, LOGO, LOGO);
      ctx.restore();
    }

    const TX = LX + LOGO + 10, TW = BX + BRAND_W - PAD - TX;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentLt;
    ctx.font = "700 13px 'Outfit', system-ui, sans-serif";
    ctx.fillText('Mesonet Explorer', TX, LY + 8, TW);
    ctx.fillStyle = textMuted;
    ctx.font = "400 11px 'Outfit', system-ui, sans-serif";
    ctx.fillText('Montana Climate Office', TX, LY + 23, TW);
    ctx.fillText(exportTimeLabel(), TX, LY + 37, TW);

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
  function pushState() {
    const params = {};
    if (activeMode !== 'latest') params.mode = activeMode;
    if (activeVar !== 'air_temp') params.var = activeVar;
    if (activeMode !== 'latest') params.date = activeDate;
    if (activeMode === 'hourly') params.hour = String(activeHour);
    if (activeUnits !== 'us') params.units = activeUnits;
    if (aggActive(REGISTRY_BY_KEY.get(activeVar))) params.agg = activeAgg;
    params.net = [...activeNetworks].map(n => n.toLowerCase()).join(' ');
    if (scaleOverride) {
      const f = (v) => Number.isFinite(v) ? String(v) : '-';
      if (scaleLocked() || Number.isFinite(scaleOverride.mid)) {
        params.scale = `${f(scaleOverride.min)},${f(scaleOverride.mid)},${f(scaleOverride.max)}`;
      }
      if (scaleOverride.ramp) params.ramp = scaleOverride.ramp + (scaleOverride.rev ? '-r' : '');
    }
    if (labelsOn) params.labels = 'on';
    if (radarOn) params.radar = 'on';
    if (!nodataShown) params.nodata = 'hide';
    if (staleShown) params.stale = 'show';
    if (overlayCounties) params.counties = 'on';
    if (overlayWatersheds) params.watersheds = 'on';
    if (legendCollapsed) params.legend = 'collapsed';
    const theme = document.documentElement.dataset.theme;
    if (theme) params.theme = theme;
    const c = map.getCenter();
    params.lng  = c.lng.toFixed(4);
    params.lat  = c.lat.toFixed(4);
    params.zoom = map.getZoom().toFixed(2);
    if (_selectedStation) params.station = _selectedStation;
    history.replaceState(null, '', `?${new URLSearchParams(params)}`);
  }

  // ── Map events ───────────────────────────────────────────────────────────
  map.on('load', () => {
    addCustomLayers();
    _fitZoom = map.cameraForBounds(MT_FIT_BOUNDS, FIT_OPTS).zoom;
    _mapReady = true;
    boot();
  });

  map.on('zoomend', () => {
    if (_mapReady && _fitZoom !== undefined && map.getZoom() < _fitZoom) {
      map.fitBounds(MT_FIT_BOUNDS, { ...FIT_OPTS, animate: !reduceMotion });
    }
  });

  let _resizeTimer = null;
  map.on('resize', () => {
    if (!_mapReady) return;
    // Zoom doesn't change when the container resizes, so comparing against the
    // pre-resize fit zoom tells us whether the user was at full extent (e.g.
    // the navbar wrapped on mobile after the chips loaded). If so, keep them
    // fitted to Montana rather than letting the state drift out of frame.
    const wasAtExtent = _fitZoom !== undefined && map.getZoom() <= _fitZoom + 0.1;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      _resizeTimer = null;
      _fitZoom = map.cameraForBounds(MT_FIT_BOUNDS, FIT_OPTS).zoom;
      if (wasAtExtent || map.getZoom() < _fitZoom) {
        map.fitBounds(MT_FIT_BOUNDS, { ...FIT_OPTS, animate: !reduceMotion });
      }
    }, 200);
  });

  map.on('moveend', pushState);

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
        fetchJSON(`${API}/stations/?type=json`),
        fetchJSON(`${API}/elements/?type=json`),
      ]);
      stations = st;
      elementDesc = new Map(els.map(e => [e.element, e.description_short]));
    } catch (err) {
      console.error(err);
      setSyncStamp('error');
      hideLoading();
      showErrorCard(
        '<strong>Couldn’t reach the Mesonet API.</strong> Check your connection.',
        () => boot());
      window.addEventListener('online',
        () => { if (!stations.length) { emptyStateEl.hidden = true; boot(); } },
        { once: true });
      showToast(`Failed to load station list: ${err.message}`, 6000);
      return;
    }
    stations = stations.filter(s =>
      typeof s.latitude === 'number' && typeof s.longitude === 'number');
    stationById = new Map(stations.map(s => [s.station, s]));

    // Static co-location buckets; per-render membership computed in render().
    for (const s of stations) bucketById.set(s.station, bucketKey(s.latitude, s.longitude));

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

    await render();
    scheduleRefresh();

    fetchPhotoMeta().catch(() => {});   // warm the cache; popups retry on failure

    // Headless export (?export=…): trigger once the first render has landed.
    if (_exportParam) setTimeout(exportPNG, 1500);

    if (_initStation && stationById.has(_initStation)) {
      const s = stationById.get(_initStation);
      if (_hasInitPos) openPopupFor(_initStation, [s.longitude, s.latitude]);
      else             flyToAndOpen(_initStation);
    } else {
      pushState();
    }
  }

