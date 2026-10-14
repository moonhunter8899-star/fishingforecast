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
function clarityMod(kd, ageDays, species) {
  // Species-specific clarity scoring. Small modifier; halve weight if data is stale.
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
  if (ageDays > 7) m = Math.round(m / 2);
  return m;
}
