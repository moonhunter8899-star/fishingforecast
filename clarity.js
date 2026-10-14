// clarity.js — satellite water clarity (Kd490) for Fishing Forecast
// Loads via the Cloudflare worker (BUOY_PROXY). Silent null on any failure.
// Source: NOAA CoastWatch ERDDAP (coastwatch.noaa.gov), VIIRS Kd490.
// Chain: freshest 750m daily -> 750m US-sector dailies -> gapfilled 2km daily -> 4km weekly.
var CLARITY_SOURCES = [
  { id: "noaacwNPPVIIRSkd490SectorVYDaily", maxAge: 7 },     // 750m NRT daily, freshest
  { id: "noaacwN20VIIRSkd490SectorUSDaily", maxAge: 14 },    // 750m NRT daily (NOAA-20)
  { id: "noaacwN21VIIRSkd490SectorUSDaily", maxAge: 14 },    // 750m NRT daily (NOAA-21)
  { id: "noaacwNPPN20S3AkdSCIDINEOF2kmDaily", maxAge: 30 },  // 2km gapfilled daily
  { id: "noaacwNPPVIIRSkd490Weekly", maxAge: 45 }            // 4km weekly fallback
];
function loadClarity(lat, lon) {
  // Kd490 in m^-1 (lower = clearer). Tries sources freshest-first,
  // uses median of valid cells in a ~0.24° box around the spot.
  if (typeof BUOY_PROXY === "undefined" || !BUOY_PROXY) return Promise.resolve(null);
  var px = BUOY_PROXY.replace(/\/$/, "") + "/?url=";
  var ERDDAP = "https://coastwatch.noaa.gov/erddap/griddap/";
  function boxURL(id, d) {
    var q = "kd_490%5B(last)%5D%5B(0)%5D" +
      "%5B(" + (lat - d).toFixed(2) + "):(" + (lat + d).toFixed(2) + ")%5D" +
      "%5B(" + (lon - d).toFixed(2) + "):(" + (lon + d).toFixed(2) + ")%5D";
    return ERDDAP + id + ".json?" + q;
  }
  function parseClarity(text, maxAgeDays) {
    try {
      var rows = JSON.parse(text).table.rows;
      if (!rows || !rows.length) return null;
      var vals = [], t0 = null;
      for (var i = 0; i < rows.length; i++) {
        var v = rows[i][4];
        if (v != null && !isNaN(v) && v > 0 && v < 30) { vals.push(v); if (!t0) t0 = rows[i][0]; }
      }
      if (vals.length < 3 || !t0) return null;
      vals.sort(function(a, b) { return a - b; });
      var ageDays = (Date.now() - Date.parse(t0)) / 86400000;
      if (!(ageDays >= 0 && ageDays <= maxAgeDays)) return null;
      return { kd: vals[Math.floor(vals.length / 2)], ageDays: ageDays };
    } catch (e) { return null; }
  }
  function get(src) {
    return fetch(px + encodeURIComponent(boxURL(src.id, 0.12))).then(function(r) {
      if (!r.ok) throw 0; return r.text();
    }).then(function(t) { return parseClarity(t, src.maxAge); });
  }
  var p = Promise.resolve(null);
  CLARITY_SOURCES.forEach(function(src) {
    p = p.then(function(c) { return c ? c : get(src).catch(function() { return null; }); });
  });
  return p.catch(function() { return null; });
}
function clarityMod(kd, ageDays, species, surfFt) {
  // Species-specific clarity scoring. Small modifier; halve weight if data is stale.
  // surfFt (optional): current surf height in feet — surf stirs sand in the
  // shallows, so the beach runs murkier than the satellite's offshore reading.
  if (kd == null) return 0;
  var m = 0;
  if (species === "snook") {
    m = kd > 0.35 ? 1 : 0;  // stained water helps ambush
  } else {
    // pompano & mackerel are sight feeders: clear helps, murky hurts
    if (kd < 0.15) m = 2;
    else if (kd < 0.35) m = 0;
    else if (kd < 0.7) m = species === "mackerel" ? -3 : -2;
    else m = species === "mackerel" ? -5 : -4;
  }
  if (surfFt != null && !isNaN(surfFt)) {
    if (species === "snook") {
      if (surfFt > 3) m = Math.max(m, 1);        // churned shallows help ambush
    } else if (surfFt > 3) {
      m = Math.min(m, -2);                        // rough: beach churned whatever the satellite says
    } else if (surfFt >= 2) {
      m = Math.min(m, 0);                         // moderate: clear-water bonus doesn't reach the beach
    }
  }
  if (ageDays > 7) m = Math.round(m / 2);
  return m;
}

// ---- Seasonal & event scoring helpers (shared by all species pages) ----
// Mullet run, cold-front pulse, and water-level anomaly. All fail-safe:
// any missing data returns 0/null and the forecast continues without it.

function mulletRunBoost(date) {
  // Fall mullet run: Sep 15 - Nov 15, peaking in October.
  // Returns {snook, mackerel} point boosts, or null outside the run.
  var m = date.getMonth() + 1, d = date.getDate();
  var inRun = (m === 9 && d >= 15) || (m === 10) || (m === 11 && d <= 15);
  if (!inRun) return null;
  var peak = (m === 10);
  return { snook: peak ? 6 : 4, mackerel: peak ? 5 : 3 };
}

function detectFronts() {
  // Cold-front passage days from: pressure trough + northerly wind shift + temp drop.
  // Uses state.wx.hourly (includes past_days history when the page requests it).
  var h = (typeof state !== "undefined" && state.wx) ? state.wx.hourly : null;
  if (!h || !h.time || !h.pressure_msl || !h.winddirection_10m || !h.temperature_2m) return [];
  var days = {};
  for (var i = 0; i < h.time.length; i++) {
    var dt = new Date(h.time[i]);
    var k = dt.getFullYear() + "-" + dt.getMonth() + "-" + dt.getDate();
    var g = days[k];
    if (!g) g = days[k] = { minP: 1e9, maxP: -1e9, sumT: 0, nT: 0, north: 0, nW: 0 };
    var p = h.pressure_msl[i];
    if (p != null && !isNaN(p)) { if (p < g.minP) g.minP = p; if (p > g.maxP) g.maxP = p; }
    var t = h.temperature_2m[i];
    if (t != null && !isNaN(t)) { g.sumT += t; g.nT++; }
    var wd = h.winddirection_10m[i];
    if (wd != null && !isNaN(wd)) { g.nW++; if (wd >= 315 || wd <= 67.5) g.north++; }
  }
  var keys = Object.keys(days).sort();
  var fronts = [];
  for (var j = 1; j < keys.length; j++) {
    var prev = days[keys[j - 1]], cur = days[keys[j]];
    if (!prev.nT || !cur.nT || !cur.nW) continue;
    var trough = prev.maxP - cur.minP;
    var tempDrop = (prev.sumT / prev.nT) - (cur.sumT / cur.nT);
    var northFrac = cur.north / cur.nW;
    if (trough >= 4 && tempDrop >= 4 && northFrac >= 0.5) {
      var parts = keys[j].split("-");
      fronts.push(new Date(+parts[0], +parts[1], +parts[2]));
    }
  }
  return fronts;
}

function frontPulseBoost(date, fronts) {
  // Pompano's #1 trigger per FL guides: +5/+3/+2 on days 1-3 after a cold front.
  var best = 0;
  for (var i = 0; i < fronts.length; i++) {
    var dd = Math.round((date - fronts[i]) / 86400000);
    if (dd === 1) best = Math.max(best, 5);
    else if (dd === 2) best = Math.max(best, 3);
    else if (dd === 3) best = Math.max(best, 2);
  }
  return best;
}

function applySeasonalBoosts(species) {
  // Mullet-run + post-front pulse. Call after buildDays(); adjusts state.days scores.
  if (typeof state === "undefined" || !state.days || !state.days.length) return;
  var fronts = (species === "pompano") ? detectFronts() : [];
  var now = new Date();
  for (var i = 0; i < state.days.length; i++) {
    var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var b = 0;
    var mr = mulletRunBoost(date);
    if (mr) b += (species === "snook") ? mr.snook : (species === "mackerel" ? mr.mackerel : 0);
    if (species === "pompano") b += frontPulseBoost(date, fronts);
    if (b) state.days[i].score = Math.max(0, Math.min(100, state.days[i].score + b));
  }
}

// ---- Water-level anomaly (NOAA CO-OPS, station 8722670 Lake Worth Pier) ----
var COOPS_LAT = 26.612, COOPS_LON = -80.034;

function loadWaterLevel() {
  // Observed minus predicted water level (ft), mean over the last ~6h.
  // Positive = wind-stacked; negative = blown out. Null on any failure.
  if (typeof BUOY_PROXY === "undefined" || !BUOY_PROXY) return Promise.resolve(null);
  var px = BUOY_PROXY.replace(/\/$/, "") + "/?url=";
  function coops(product) {
    var u = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=" + product +
      "&station=8722670&datum=MLLW&time_zone=gmt&units=english&format=json&date=recent";
    return fetch(px + encodeURIComponent(u)).then(function(r) {
      if (!r.ok) throw 0; return r.json();
    });
  }
  return Promise.all([coops("water_level"), coops("predictions")]).then(function(res) {
    var ob = {}, pr = {};
    (res[0].data || []).forEach(function(d) { if (d.v) ob[d.t] = parseFloat(d.v); });
    (res[1].predictions || []).forEach(function(d) { pr[d.t] = parseFloat(d.v); });
    var anoms = [];
    for (var t in ob) {
      if (pr[t] != null && !isNaN(pr[t])) anoms.push({ t: t, a: ob[t] - pr[t] });
    }
    if (anoms.length < 12) return null;
    anoms.sort(function(x, y) { return x.t < y.t ? -1 : 1; });
    var tail = anoms.slice(-60), sum = 0;
    tail.forEach(function(x) { sum += x.a; });
    return { anomalyFt: sum / tail.length };
  }).catch(function() { return null; });
}

function waterLevelMod(anomalyFt) {
  if (anomalyFt == null || isNaN(anomalyFt)) return 0;
  if (anomalyFt >= 1.0) return -2;  // stacked way high, surf blown out
  if (anomalyFt >= 0.4) return 2;   // nicely stacked, bait pushed inshore
  if (anomalyFt <= -1.0) return -4; // blown out, troughs drained
  if (anomalyFt <= -0.4) return -2; // running low
  return 0;
}

function withTimeout(promise, ms) {
  // Rejects if promise doesn't settle in ms. The underlying fetch keeps
  // running but its late result is ignored.
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error("timeout")); }, ms);
    })
  ]);
}

function rebuildScores(species) {
  // (Re)build day scores from current state. Idempotent: buildDays makes
  // fresh day objects, so re-applying adjustments is safe.
  var bi = hourlyIndex(state.mar.hourly, Date.now());
  state.days = buildDays(state.wx, state.mar);
  if (state.clarity && state.days.length) {
    var _cm = clarityMod(state.clarity.kd, state.clarity.ageDays, species,
      (state.mar.hourly.wave_height[bi] || 0) * 3.28084);
    if (_cm) state.days[0].score = Math.max(0, Math.min(100, state.days[0].score + _cm));
  }
  if (state.waterlevel && state.days.length) {
    var _wl = waterLevelMod(state.waterlevel.anomalyFt);
    var _wld = distMi(state.loc.lat, state.loc.lon, COOPS_LAT, COOPS_LON);
    if (_wld > 60) _wl = 0; else if (_wld > 30) _wl = Math.round(_wl / 2);
    if (_wl) state.days[0].score = Math.max(0, Math.min(100, state.days[0].score + _wl));
  }
  applySeasonalBoosts(species);
}
