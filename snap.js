/* Bite Forecast — catch log.
   Privacy-first: everything stays on this phone. No accounts, no photos.
   Anonymous catch data (species+count+day+spot, only while at the fishing
   spot) goes to our repo via the worker relay to improve the forecast. */
(function () {
"use strict";
if (window.FFSnap) return;
window.FFSnap = {};

/* ---------- helpers ---------- */
function $(id) { return document.getElementById(id); }
function lang() { try { return localStorage.getItem("pf_lang") || "en"; } catch (e) { return "en"; } }
function todayStr(d) {
  d = d || new Date();
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
function fmtDate(ds) {
  var p = ds.split("-");
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}
function pageSpecies() {
  try { return localStorage.getItem("ff_species") || "pompano"; } catch (e) { return "pompano"; }
}
var SPECIES = { pompano: "POMPANO", snook: "SNOOK", mackerel: "MACKEREL" };

/* ---------- strings ---------- */
var STR = {
  en: {
    fab: "Log catch", mTitle: "Log your catch",
    species: "Species", count: "Count", date: "Date", spot: "Spot", change: "Change",
    spotNote: "Spot is saved on this phone only — never shared.",
    privacy: "When you're at the fishing spot, an anonymous catch report (species + number + day + spot — no name, nothing that can identify you) is shared so the forecast can keep improving.",
    save: "Save catch",
    saved: "Saved to your log",
    myLog: "My catches", topSpots: "Your top spots", noCatches: "No catches logged yet — go get some!",
    nudge: "Fished today? Log your catch!", nudgeBtn: "Log it",
    del: "Delete", confirmDel: "Delete this entry?",
    times: "times", caught: "caught"
  },
  vi: {
    fab: "Ghi mẻ cá", mTitle: "Ghi mẻ cá",
    species: "Loài cá", count: "Số lượng", date: "Ngày", spot: "Điểm câu", change: "Đổi",
    spotNote: "Điểm câu chỉ lưu trên điện thoại này — không chia sẻ.",
    privacy: "Khi bạn đang ở điểm câu, một báo cáo ẩn danh (loài + số con + ngày + điểm câu — không tên, không có gì xác định được bạn) được chia sẻ để dự báo ngày càng chuẩn.",
    save: "Lưu",
    saved: "Đã lưu vào nhật ký",
    myLog: "Nhật ký câu cá", topSpots: "Điểm câu quen thuộc", noCatches: "Chưa có gì — đi câu thôi!",
    nudge: "Hôm nay đi câu? Lưu lại nào!", nudgeBtn: "Lưu ngay",
    del: "Xóa", confirmDel: "Xóa mục này?",
    times: "lần", caught: "con"
  }
};
function S() { return STR[lang()] || STR.en; }

/* ---------- on-device store ---------- */
function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function deviceId() {
  var id = lsGet("ff_device_id", null);
  if (!id) { id = "d" + Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet("ff_device_id", id); }
  return id;
}
function getLog() { return lsGet("ff_catchlog", []); }
function saveLog(l) { lsSet("ff_catchlog", l.slice(0, 40)); }
function getVisits() { return lsGet("ff_spotvisits", {}); }
function spotKey(name, lat, lon) {
  if (name) return "n:" + name.toLowerCase().slice(0, 60);
  return "c:" + lat.toFixed(3) + "," + lon.toFixed(3);
}
/* Repeat-visit signal, on-device only: same phone @ same spot 2+ times => they catch fish there. */
function recordVisit(name, lat, lon) {
  var v = getVisits(), k = spotKey(name, lat, lon), t = todayStr();
  var e = v[k] || { name: name || (lat.toFixed(3) + "," + lon.toFixed(3)), lat: lat, lon: lon, visits: 0, days: {} };
  if (!e.days[t]) { e.days[t] = 1; e.visits++; e.lastVisit = t; }
  v[k] = e;
  var keys = Object.keys(v);
  if (keys.length > 60) { keys.sort(function (a, b) { return (v[a].lastVisit || "") < (v[b].lastVisit || "") ? -1 : 1; }); keys.slice(0, keys.length - 60).forEach(function (x) { delete v[x]; }); }
  lsSet("ff_spotvisits", v);
}
function lastShore() { return lsGet("ff_last_shore", null); }
function recents() { return lsGet("ff_recents", []); }

/* watch the page's own location state; log a visit when at a shore spot (once/day/spot) */
function pollState() {
  try {
    var st = window.state;
    if (st && st.ready && st.isShore && st.loc && st.loc.lat != null) {
      recordVisit(st.loc.name, st.loc.lat, st.loc.lon);
    }
  } catch (e) {}
}

/* ---------- styles ---------- */
var CSS = [
  "#ffSnapFab{position:fixed;right:14px;bottom:96px;width:60px;height:60px;border-radius:50%;",
  "background:linear-gradient(135deg,#0b3d66,#1290c9);color:#fff;font-size:27px;border:2px solid rgba(255,255,255,.35);",
  "box-shadow:0 6px 18px rgba(0,0,0,.45);z-index:65;cursor:pointer;display:flex;align-items:center;justify-content:center}",
  "#ffSnapFab:active{transform:scale(.93)}",
  "#ffSnapOv{position:fixed;inset:0;background:rgba(2,8,16,.72);z-index:80;display:flex;align-items:flex-end;justify-content:center}",
  "#ffSnapSheet{background:#0e1e32;color:#eaf3f8;width:100%;max-width:560px;max-height:94vh;overflow-y:auto;",
  "border-radius:20px 20px 0 0;padding:18px 16px 28px;box-shadow:0 -8px 40px rgba(0,0,0,.5)}",
  "#ffSnapSheet h2{margin:0 0 4px;font-size:20px}",
  ".ffRow{margin:12px 0}.ffRow label{display:block;font-size:12px;letter-spacing:1px;opacity:.65;margin-bottom:6px;text-transform:uppercase}",
  ".ffBtns{display:flex;gap:8px;flex-wrap:wrap}",
  ".ffChip{background:#16304d;border:1px solid #2a4d75;color:#eaf3f8;border-radius:999px;padding:9px 16px;font-size:15px;cursor:pointer}",
  ".ffChip.on{background:#1290c9;border-color:#1290c9;font-weight:700}",
  ".ffStep{display:flex;align-items:center;gap:10px}",
  ".ffStep button{width:44px;height:44px;border-radius:50%;font-size:22px;background:#16304d;color:#fff;border:1px solid #2a4d75;cursor:pointer}",
  ".ffStep b{font-size:30px;min-width:52px;text-align:center}",
  ".ffIn{background:#0a1626;border:1px solid #2a4d75;color:#eaf3f8;border-radius:10px;padding:10px 12px;font-size:16px;width:100%;box-sizing:border-box}",
  ".ffPriv{font-size:12.5px;line-height:1.5;background:#0a2a1a;border:1px solid #1f6b43;border-radius:10px;padding:10px 12px;margin:14px 0;color:#bfe8cf}",
  ".ffSpotNote{font-size:12px;opacity:.6;margin-top:6px}",
  ".ffAct{display:flex;gap:8px;margin-top:14px}",
  ".ffAct button{flex:1;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:700;cursor:pointer}",
  "#ffSnapSave{background:#1f9d55;color:#fff}",
  "#ffSnapClose{position:sticky;top:0;float:right;background:rgba(255,255,255,.12);border:none;color:#fff;",
  "width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}",
  ".ffLogItem{display:flex;gap:10px;align-items:center;background:#0a1626;border:1px solid #1d3550;border-radius:12px;padding:8px;margin:8px 0}",
  ".ffLogItem .t{flex:1;font-size:14px}.ffLogItem .t small{opacity:.6}",
  ".ffLogItem button{background:none;border:none;color:#ff8a8a;font-size:13px;cursor:pointer}",
  "#ffNudge{position:sticky;top:0;z-index:70;background:linear-gradient(90deg,#0b3d66,#1290c9);color:#fff;",
  "padding:10px 14px;display:flex;align-items:center;gap:10px;font-size:15px}",
  "#ffNudge button{margin-left:auto;background:#fff;color:#0b3d66;border:none;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer}",
  "#ffNudge .x{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;margin:0}"
].join("\n");
function injectCSS() {
  if ($("ffSnapCSS")) return;
  var st = document.createElement("style");
  st.id = "ffSnapCSS"; st.textContent = CSS;
  document.head.appendChild(st);
}

/* ---------- floating action button (right side) ---------- */
function injectFAB() {
  if ($("ffSnapFab")) return;
  var b = document.createElement("button");
  b.id = "ffSnapFab"; b.textContent = "🎣"; b.title = S().fab;
  b.setAttribute("aria-label", S().fab);
  b.addEventListener("click", function () { window.FFSnap.openModal(); });
  document.body.appendChild(b);
}

/* ---------- evening nudge ---------- */
function maybeNudge() {
  if (new Date().getHours() < 16) return;
  var t = todayStr();
  if (lsGet("ff_nudge_" + t, false)) return;
  var v = getVisits(), visited = Object.keys(v).some(function (k) { return v[k].lastVisit === t; });
  if (!visited) return;
  var logged = getLog().some(function (e) { return e.date === t; });
  if (logged) return;
  var bar = document.createElement("div");
  bar.id = "ffNudge";
  var s = S();
  bar.innerHTML = "<span></span>";
  bar.firstChild.textContent = "🎣 " + s.nudge;
  var go = document.createElement("button"); go.textContent = s.nudgeBtn;
  go.addEventListener("click", function () { lsSet("ff_nudge_" + t, true); bar.remove(); window.FFSnap.openModal(); });
  var x = document.createElement("button"); x.className = "x"; x.textContent = "✕";
  x.setAttribute("aria-label", "dismiss");
  x.addEventListener("click", function () { lsSet("ff_nudge_" + t, true); bar.remove(); });
  bar.appendChild(go); bar.appendChild(x);
  document.body.insertBefore(bar, document.body.firstChild);
}

window.FFSnap._poll = pollState;
window.FFSnap._nudge = maybeNudge;
var F = window.FFSnap;
F.$ = $; F.S = S; F.lang = lang; F.todayStr = todayStr; F.fmtDate = fmtDate; F.pageSpecies = pageSpecies;
F.SPECIES = SPECIES; F.lsGet = lsGet; F.lsSet = lsSet; F.deviceId = deviceId;
F.getLog = getLog; F.saveLog = saveLog; F.getVisits = getVisits; F.recordVisit = recordVisit;
F.lastShore = lastShore; F.recents = recents; F.injectCSS = injectCSS; F.injectFAB = injectFAB;
})();

/* ---------- modal UI ---------- */
(function () {
"use strict";
var F = window.FFSnap;
var $ = F.$, S = F.S, lang = F.lang, todayStr = F.todayStr, fmtDate = F.fmtDate, pageSpecies = F.pageSpecies,
    SPECIES = F.SPECIES, lsGet = F.lsGet, lsSet = F.lsSet, deviceId = F.deviceId,
    getLog = F.getLog, saveLog = F.saveLog, getVisits = F.getVisits, lastShore = F.lastShore, recents = F.recents;
var cur = null; // {species, count, date, spot}

function openModal() {
  if ($("ffSnapOv")) return;
  var s = S();
  var ov = document.createElement("div");
  ov.id = "ffSnapOv";
  var sh = document.createElement("div");
  sh.id = "ffSnapSheet";
  ov.appendChild(sh);
  var sp = lastShore();
  cur = {
    species: pageSpecies(),
    count: 1,
    date: todayStr(),
    spot: sp ? { name: sp.name, lat: sp.lat, lon: sp.lon } : null
  };
  var h = "";
  h += '<button id="ffSnapClose" aria-label="close">✕</button>';
  h += "<h2>🎣 " + s.mTitle + "</h2>";
  h += '<div class="ffRow"><label>' + s.species + '</label><div class="ffBtns" id="ffSpecies"></div></div>';
  h += '<div class="ffRow"><label>' + s.count + '</label><div class="ffStep">';
  h += '<button id="ffMinus">−</button><b id="ffCountN">1</b><button id="ffPlus">+</button></div></div>';
  h += '<div class="ffRow"><label>' + s.date + '</label><input type="date" class="ffIn" id="ffDate"></div>';
  h += '<div class="ffRow"><label>' + s.spot + '</label><div class="ffBtns">';
  h += '<span class="ffChip" id="ffSpotName" style="flex:1"></span><button class="ffChip" id="ffSpotChg">' + s.change + '</button></div>';
  h += '<div class="ffSpotNote">' + s.spotNote + '</div></div>';
  h += '<div class="ffPriv">🔒 ' + s.privacy + '</div>';
  h += '<div class="ffAct"><button id="ffSnapSave">' + s.save + '</button></div>';
  h += '<div class="ffRow"><label>' + s.myLog + '</label><div id="ffLogList"></div>';
  h += '<div class="ffSpotNote" id="ffTopSpots"></div></div>';
  sh.innerHTML = h;
  document.body.appendChild(ov);

  $("ffSnapClose").addEventListener("click", closeModal);
  ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(); });
  $("ffDate").value = cur.date;
  $("ffDate").addEventListener("change", function () { cur.date = this.value || todayStr(); });

  // species chips
  var spw = $("ffSpecies");
  Object.keys(SPECIES).forEach(function (k) {
    var b = document.createElement("button");
    b.className = "ffChip" + (k === cur.species ? " on" : "");
    b.textContent = SPECIES[k].charAt(0) + SPECIES[k].slice(1).toLowerCase();
    b.addEventListener("click", function () {
      cur.species = k;
      Array.prototype.forEach.call(spw.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on");
    });
    spw.appendChild(b);
  });

  // count stepper
  $("ffMinus").addEventListener("click", function () { cur.count = Math.max(1, cur.count - 1); $("ffCountN").textContent = cur.count; });
  $("ffPlus").addEventListener("click", function () { cur.count = Math.min(99, cur.count + 1); $("ffCountN").textContent = cur.count; });

  // spot
  paintSpot();
  $("ffSpotChg").addEventListener("click", pickSpot);

  $("ffSnapSave").addEventListener("click", saveEntry);

  renderLog();
}
function closeModal() {
  var ov = $("ffSnapOv");
  if (ov) ov.remove();
  cur = null;
}
function paintSpot() {
  var el = $("ffSpotName");
  if (!el || !cur) return;
  el.textContent = cur.spot ? "📍 " + cur.spot.name : "—";
}
function pickSpot() {
  var opts = [];
  var ls = lastShore();
  if (ls) opts.push(ls);
  recents().forEach(function (r) {
    if (!opts.some(function (o) { return o.name === r.name; })) opts.push(r);
  });
  if (!opts.length) return;
  var names = opts.map(function (o, i) { return (i + 1) + ". " + o.name; }).join("\n");
  var pick = prompt(names + "\n\n#", "1");
  var i = parseInt(pick, 10) - 1;
  if (opts[i]) { cur.spot = { name: opts[i].name, lat: opts[i].lat, lon: opts[i].lon }; paintSpot(); }
}
/* ---------- my catches log ---------- */
function renderLog() {
  var list = $("ffLogList");
  if (!list) return;
  var s = S(), log = getLog();
  if (!log.length) { list.innerHTML = '<div class="ffSpotNote">' + s.noCatches + "</div>"; }
  else {
    list.innerHTML = "";
    log.forEach(function (e) {
      var d = document.createElement("div");
      d.className = "ffLogItem";
      var im = document.createElement("div"); im.textContent = "🐟";
      im.style.cssText = "width:56px;height:56px;flex:none;border-radius:8px;background:#16304d;display:flex;align-items:center;justify-content:center;font-size:28px";
      var t = document.createElement("div"); t.className = "t";
      var nm = (SPECIES[e.species] || e.species).charAt(0) + (SPECIES[e.species] || e.species).slice(1).toLowerCase();
      t.innerHTML = "<b></b> <small></small><br><small></small>";
      t.children[0].textContent = e.count + " × " + nm;
      t.children[1].textContent = fmtDate(e.date);
      t.children[2].textContent = e.spot ? e.spot.name : "";
      var del = document.createElement("button"); del.textContent = s.del;
      del.addEventListener("click", function () {
        if (!confirm(s.confirmDel)) return;
        saveLog(getLog().filter(function (x) { return x.id !== e.id; }));
        renderLog();
      });
      d.appendChild(im); d.appendChild(t); d.appendChild(del);
      list.appendChild(d);
    });
  }
  var v = getVisits(), keys = Object.keys(v);
  keys.sort(function (a, b) { return v[b].visits - v[a].visits; });
  var top = keys.slice(0, 3).filter(function (k) { return v[k].visits > 1; });
  $("ffTopSpots").textContent = top.length
    ? "⭐ " + s.topSpots + ": " + top.map(function (k) { return v[k].name + " (" + v[k].visits + " " + s.times + ")"; }).join(" · ")
    : "";
}
/* ---------- anonymous catch reporting ----------
   Goes to OUR GitHub repo as data (via the Cloudflare worker relay) so the
   forecast can learn. Anonymous: species + count + day + spot.
   No name, no device id, no photo. Ever.
   FIRES ONLY when the angler is AT a fishing spot right now (live shore
   state) — never from inland or home. */
var REPORT_PATH = "/report-catch";
function reportCatch(species, count, date) {
  try {
    var st = window.state;
    if (!st || !st.ready || !st.isShore || !st.loc || st.loc.lat == null || st.loc.lon == null) return;
    var proxy = window.BUOY_PROXY;
    if (!proxy) return;
    var body = { v: 1, species: species, count: count, date: date };
    var s = { name: String(st.loc.name || "shore").slice(0, 120) };
    if (isFinite(st.loc.lat) && isFinite(st.loc.lon)) {
      s.lat = Math.round(st.loc.lat * 1000) / 1000;
      s.lon = Math.round(st.loc.lon * 1000) / 1000;
    }
    body.spot = s;
    if (window.fetch) {
      fetch(proxy + REPORT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    }
  } catch (e) {}
}
function saveEntry() {
  var s = S();
  var log = getLog();
  log.unshift({
    id: "c" + Date.now().toString(36),
    species: cur.species, count: cur.count, date: cur.date,
    spot: cur.spot, ts: Date.now()
  });
  saveLog(log);
  reportCatch(cur.species, cur.count, cur.date); // fires only when at the fishing spot
  renderLog();
  var b = $("ffSnapSave"), old = b.textContent;
  b.textContent = "✓ " + s.saved;
  setTimeout(function () { b.textContent = old; }, 1600);
}

F.openModal = openModal;
F.closeModal = closeModal;
})();


/* ---------- init ---------- */
(function () {
"use strict";
var F = window.FFSnap;
function init() {
  F.injectCSS();
  F.injectFAB();
  F.deviceId();
  F._nudge();
  F._poll();
  setInterval(F._poll, 4000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
