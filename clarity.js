// clarity.js — satellite water clarity (Kd490) for Fishing Forecast
// Loads via the Cloudflare worker (BUOY_PROXY). Silent null on any failure.
function loadClarity(lat, lon) {
  // Kd490 in m^-1 (lower = clearer). Tries NRT daily (~3-day latency),
  // falls back to weekly composite. Uses median of valid 4km cells in a box.
  if (typeof BUOY_PROXY === "undefined" || !BUOY_PROXY) return Promise.resolve(null);
  var px = BUOY_PROXY.replace(/\/$/, "") + "/?url=";
  function boxURL(dataset, d) {
    var q = "kd_490%5B(last):1:(last)%5D%5B(0.0):1:(0.0)%5D" +
      "%5B(" + (lat - d).toFixed(2) + "):1:(" + (lat + d).toFixed(2) + ")%5D" +
      "%5B(" + (lon - d).toFixed(2) + "):1:(" + (lon + d).toFixed(2) + ")%5D";
    return "https://coastwatch.pfeg.noaa.gov/erddap/griddap/" + dataset + ".json?" + q;
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
  function get(url, maxAge) {
    return fetch(px + encodeURIComponent(url)).then(function(r) {
      if (!r.ok) throw 0; return r.text();
    }).then(function(t) { return parseClarity(t, maxAge); });
  }
  return get(boxURL("nesdisVHNkd490Daily", 0.12), 7).then(function(c) {
    if (c) return c;
    return get(boxURL("nesdisVHNkd490Weekly", 0.12), 21);
  }).catch(function() { return null; });
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
