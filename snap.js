/* Bite Forecast — "Snap your moment" catch log + brag-pic frames.
   Privacy-first: everything stays on this phone. No accounts, no uploads,
   no location in shared images. Shared crowd data (if any) is species+count+day only. */
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
    fab: "Snap your moment", mTitle: "Snap your moment",
    photo: "Photo (optional)", take: "Take photo", upload: "Upload",
    species: "Species", count: "Count", date: "Date", spot: "Spot", change: "Change",
    spotNote: "Spot is saved on this phone only — never shared.",
    frame: "Pick a frame",
    privacy: "Your photos never leave this phone. When you're at the fishing spot, an anonymous catch report (species + number + day + spot — no name, no photo, nothing that can identify you) is shared so the forecast can keep improving.",
    save: "Save catch", share: "Share", download: "Download",
    saved: "Saved to your log", needPhoto: "Add a photo first",
    myLog: "My catches", topSpots: "Your top spots", noCatches: "No catches logged yet — go get some!",
    nudge: "Fished today? Log your catch!", nudgeBtn: "Log it",
    del: "Delete", confirmDel: "Delete this entry?",
    shareFail: "Couldn't share — try download instead.",
    times: "times", caught: "caught"
  },
  vi: {
    fab: "Chụp khoảnh khắc", mTitle: "Chụp khoảnh khắc",
    photo: "Ảnh (không bắt buộc)", take: "Chụp ảnh", upload: "Tải ảnh lên",
    species: "Loài cá", count: "Số lượng", date: "Ngày", spot: "Điểm câu", change: "Đổi",
    spotNote: "Điểm câu chỉ lưu trên điện thoại này — không chia sẻ.",
    frame: "Chọn khung",
    privacy: "Ảnh của bạn không bao giờ rời khỏi điện thoại này. Khi bạn đang ở điểm câu, một báo cáo ẩn danh (loài + số con + ngày + điểm câu — không tên, không ảnh, không có gì xác định được bạn) được chia sẻ để dự báo ngày càng chuẩn.",
    save: "Lưu", share: "Chia sẻ", download: "Tải xuống",
    saved: "Đã lưu vào nhật ký", needPhoto: "Thêm ảnh trước đã",
    myLog: "Nhật ký câu cá", topSpots: "Điểm câu quen thuộc", noCatches: "Chưa có gì — đi câu thôi!",
    nudge: "Hôm nay đi câu? Lưu lại nào!", nudgeBtn: "Lưu ngay",
    del: "Xóa", confirmDel: "Xóa mục này?",
    shareFail: "Không chia sẻ được — thử tải xuống nhé.",
    times: "lần", caught: "con"
  }
};
function S() { return STR[lang()] || STR.en; }
var THEME_NAMES = {
  retro: { en: "Retro", vi: "Retro" },
  sticker: { en: "Sticker bomb", vi: "Sticker" },
  wanted: { en: "Wanted", vi: "Truy nã" },
  popart: { en: "Pop art", vi: "Pop art" },
  champion: { en: "Champion", vi: "Vô địch" }
};
function themeName(k) { var t = THEME_NAMES[k]; return (t[lang()] || t.en); }

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
  "#ffSnapPrev{width:100%;border-radius:14px;background:#000;display:block}",
  "#ffSnapPhotoBox{width:100%;aspect-ratio:4/3;border-radius:14px;background:#0a1626;border:2px dashed #2a4d75;",
  "display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;color:#9db8d2;font-size:15px;text-align:center}",
  "#ffSnapPhotoBox img{width:100%;height:100%;object-fit:cover}",
  ".ffPriv{font-size:12.5px;line-height:1.5;background:#0a2a1a;border:1px solid #1f6b43;border-radius:10px;padding:10px 12px;margin:14px 0;color:#bfe8cf}",
  ".ffSpotNote{font-size:12px;opacity:.6;margin-top:6px}",
  ".ffAct{display:flex;gap:8px;margin-top:14px}",
  ".ffAct button{flex:1;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:700;cursor:pointer}",
  "#ffSnapSave{background:#1f9d55;color:#fff}#ffSnapShare{background:#1290c9;color:#fff}#ffSnapDl{background:#243b58;color:#dbe7f3}",
  "#ffSnapClose{position:sticky;top:0;float:right;background:rgba(255,255,255,.12);border:none;color:#fff;",
  "width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}",
  ".ffLogItem{display:flex;gap:10px;align-items:center;background:#0a1626;border:1px solid #1d3550;border-radius:12px;padding:8px;margin:8px 0}",
  ".ffLogItem img{width:56px;height:56px;border-radius:8px;object-fit:cover}",
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
  b.id = "ffSnapFab"; b.textContent = "📸"; b.title = S().fab;
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
F.SPECIES = SPECIES; F.themeName = themeName; F.lsGet = lsGet; F.lsSet = lsSet; F.deviceId = deviceId;
F.getLog = getLog; F.saveLog = saveLog; F.getVisits = getVisits; F.recordVisit = recordVisit;
F.lastShore = lastShore; F.recents = recents; F.injectCSS = injectCSS; F.injectFAB = injectFAB;
})();

/* ---------- modal UI ---------- */
(function () {
"use strict";
var F = window.FFSnap;
var $ = F.$, S = F.S, lang = F.lang, todayStr = F.todayStr, fmtDate = F.fmtDate, pageSpecies = F.pageSpecies,
    SPECIES = F.SPECIES, themeName = F.themeName, lsGet = F.lsGet, lsSet = F.lsSet, deviceId = F.deviceId,
    getLog = F.getLog, saveLog = F.saveLog, getVisits = F.getVisits, lastShore = F.lastShore, recents = F.recents;
var cur = null; // {img, species, count, date, spot, theme}

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
    img: null, imgURL: null,
    species: pageSpecies(),
    count: 1,
    date: todayStr(),
    spot: sp ? { name: sp.name, lat: sp.lat, lon: sp.lon } : null,
    theme: "retro"
  };
  F._curRef = function () { return cur; };
  var h = "";
  h += '<button id="ffSnapClose" aria-label="close">✕</button>';
  h += "<h2>📸 " + s.mTitle + "</h2>";
  h += '<div class="ffRow"><label>' + s.photo + '</label>';
  h += '<div id="ffSnapPhotoBox"><span>' + s.upload + '</span></div>';
  h += '<div class="ffBtns" style="margin-top:8px">';
  h += '<button class="ffChip" id="ffUp">🖼 ' + s.upload + '</button></div></div>';
  h += '<input type="file" id="ffFileUp" accept="image/*" hidden>';
  h += '<div class="ffRow"><label>' + s.species + '</label><div class="ffBtns" id="ffSpecies"></div></div>';
  h += '<div class="ffRow"><label>' + s.count + '</label><div class="ffStep">';
  h += '<button id="ffMinus">−</button><b id="ffCountN">1</b><button id="ffPlus">+</button></div></div>';
  h += '<div class="ffRow"><label>' + s.date + '</label><input type="date" class="ffIn" id="ffDate"></div>';
  h += '<div class="ffRow"><label>' + s.spot + '</label><div class="ffBtns">';
  h += '<span class="ffChip" id="ffSpotName" style="flex:1"></span><button class="ffChip" id="ffSpotChg">' + s.change + '</button></div>';
  h += '<div class="ffSpotNote">' + s.spotNote + '</div></div>';
  h += '<div class="ffRow"><label>' + s.frame + '</label><div class="ffBtns" id="ffThemes"></div></div>';
  h += '<div class="ffRow"><canvas id="ffSnapPrev" width="540" height="960"></canvas></div>';
  h += '<div class="ffPriv">🔒 ' + s.privacy + '</div>';
  h += '<div class="ffAct"><button id="ffSnapSave">' + s.save + '</button>';
  h += '<button id="ffSnapShare">' + s.share + '</button><button id="ffSnapDl">' + s.download + '</button></div>';
  h += '<div class="ffRow"><label>' + s.myLog + '</label><div id="ffLogList"></div>';
  h += '<div class="ffSpotNote" id="ffTopSpots"></div></div>';
  sh.innerHTML = h;
  document.body.appendChild(ov);

  $("ffSnapClose").addEventListener("click", closeModal);
  ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(); });
  $("ffDate").value = cur.date;
  $("ffDate").addEventListener("change", function () { cur.date = this.value || todayStr(); renderPreview(); });

  // species chips
  var spw = $("ffSpecies");
  Object.keys(SPECIES).forEach(function (k) {
    var b = document.createElement("button");
    b.className = "ffChip" + (k === cur.species ? " on" : "");
    b.textContent = SPECIES[k].charAt(0) + SPECIES[k].slice(1).toLowerCase();
    b.addEventListener("click", function () {
      cur.species = k;
      Array.prototype.forEach.call(spw.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on"); renderPreview();
    });
    spw.appendChild(b);
  });

  // count stepper
  $("ffMinus").addEventListener("click", function () { cur.count = Math.max(1, cur.count - 1); $("ffCountN").textContent = cur.count; renderPreview(); });
  $("ffPlus").addEventListener("click", function () { cur.count = Math.min(99, cur.count + 1); $("ffCountN").textContent = cur.count; renderPreview(); });

  // photo
  $("ffUp").addEventListener("click", function () { $("ffFileUp").click(); });
  $("ffSnapPhotoBox").addEventListener("click", function () { $("ffFileUp").click(); });
  $("ffFileUp").addEventListener("change", function () { loadPhoto(this.files[0]); this.value = ""; });

  // spot
  paintSpot();
  $("ffSpotChg").addEventListener("click", pickSpot);

  // themes
  var tw = $("ffThemes");
  ["retro", "sticker", "wanted", "popart", "champion"].forEach(function (k) {
    var b = document.createElement("button");
    b.className = "ffChip" + (k === cur.theme ? " on" : "");
    b.textContent = themeName(k);
    b.addEventListener("click", function () {
      cur.theme = k;
      Array.prototype.forEach.call(tw.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on"); renderPreview();
    });
    tw.appendChild(b);
  });

  $("ffSnapSave").addEventListener("click", saveEntry);
  $("ffSnapShare").addEventListener("click", shareFrame);
  $("ffSnapDl").addEventListener("click", downloadFrame);

  renderLog();
  renderPreview();
}
function closeModal() {
  var ov = $("ffSnapOv");
  if (ov) ov.remove();
  if (cur && cur.imgURL) { URL.revokeObjectURL(cur.imgURL); }
  cur = null;
  window.FFSnap._curRef = null;
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
function loadPhoto(file) {
  if (!file || !cur) return;
  if (cur.imgURL) URL.revokeObjectURL(cur.imgURL);
  cur.imgURL = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    cur.img = img;
    var box = $("ffSnapPhotoBox");
    box.innerHTML = "";
    var p = document.createElement("img");
    p.src = cur.imgURL;
    box.appendChild(p);
    // EXIF GPS fallback hint: if no spot yet, keep manual — EXIF read needs a lib; skip, spot already defaults to last shore.
    renderPreview();
  };
  img.src = cur.imgURL;
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
      var im;
      if (e.photo) { im = document.createElement("img"); im.src = e.photo; im.alt = ""; }
      else {
        im = document.createElement("div"); im.textContent = "🐟";
        im.style.cssText = "width:56px;height:56px;flex:none;border-radius:8px;background:#16304d;display:flex;align-items:center;justify-content:center;font-size:28px";
      }
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
function downscale(img, maxDim, q) {
  var r = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  var c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
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
    spot: cur.spot, photo: cur.img ? downscale(cur.img, 1024, 0.82) : null, ts: Date.now()
  });
  saveLog(log);
  reportCatch(cur.species, cur.count, cur.date); // fires only when at the fishing spot; photo not required
  renderLog();
  var b = $("ffSnapSave"), old = b.textContent;
  b.textContent = "✓ " + s.saved;
  setTimeout(function () { b.textContent = old; }, 1600);
}

F.openModal = openModal;
F.closeModal = closeModal;
})();

/* ---------- canvas frame renderers (1080x1920) ---------- */
(function () {
"use strict";
var F = window.FFSnap;
var $ = F.$, S = F.S, fmtDate = F.fmtDate, SPECIES = F.SPECIES, lsGet = F.lsGet;
var W = 1080, H = 1920;
var SERIF = 'Georgia,"Times New Roman",serif';
var SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

function cover(ctx, img, x, y, w, h) {
  var ir = img.naturalWidth / img.naturalHeight, r = w / h, dw, dh;
  if (ir > r) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function burst(ctx, cx, cy, ro, ri, n) {
  ctx.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var r = i % 2 ? ri : ro, a = (Math.PI * i) / n - Math.PI / 2;
    var px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function stamp(ctx, text, x, y, size, color, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.font = "bold " + size + "px " + SANS;
  ctx.strokeStyle = color; ctx.lineWidth = size * 0.09;
  var w = ctx.measureText(text).width + size * 1.1;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-w / 2, -size * 0.95, w, size * 1.9, size * 0.25); }
  else ctx.rect(-w / 2, -size * 0.95, w, size * 1.9);
  ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 0, size * 0.06);
  ctx.restore();
}
function tape(ctx, x, y, w, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = "rgba(235,225,195,.75)";
  ctx.fillRect(-w / 2, -26, w, 52);
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(-w / 2, -26, w, 14);
  ctx.restore();
}
function speckle(ctx, n, color, aMax) {
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.random() * aMax;
    var r = 1 + Math.random() * 3;
    ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function seededRand(seed) {
  var s = seed;
  return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function ls(ctx, px) { try { ctx.letterSpacing = px + "px"; } catch (e) {} }

/* frame data: {species:'POMPANO', count:6, dateStr:'OCT 13, 2026'} */
function themeRetro(ctx, img, d) {
  ctx.fillStyle = "#f3e8cf"; ctx.fillRect(0, 0, W, H);
  speckle(ctx, 500, "#8a6f4d", 0.08);
  ctx.save();
  try { ctx.filter = "sepia(.55) contrast(1.03)"; } catch (e) {}
  cover(ctx, img, 70, 70, W - 140, 1000);
  try { ctx.filter = "none"; } catch (e) {}
  ctx.restore();
  ctx.strokeStyle = "#4a3220"; ctx.lineWidth = 6; ctx.strokeRect(70, 70, W - 140, 1000);
  ctx.fillStyle = "#4a3220"; ctx.textAlign = "center";
  ls(ctx, 10); ctx.font = "bold 78px " + SERIF;
  ctx.fillText("GONE FISHIN'", W / 2, 1200); ls(ctx, 0);
  ctx.fillStyle = "#b3402a"; ctx.font = "bold 168px " + SERIF;
  ctx.fillText(d.count + " " + d.species + "!", W / 2, 1390);
  ctx.fillStyle = "#4a3220"; ctx.font = "bold 46px " + SANS;
  ctx.fillText(d.dateStr, W / 2, 1470);
  /* fish skeleton doodle */
  ctx.strokeStyle = "#4a3220"; ctx.lineWidth = 7; ctx.lineCap = "round";
  var fy = 1620, fx = 330;
  ctx.beginPath(); ctx.ellipse(fx, fy, 110, 46, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fx + 105, fy); ctx.lineTo(fx + 200, fy - 60); ctx.lineTo(fx + 200, fy + 60); ctx.closePath(); ctx.stroke();
  for (var i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(fx - 40 + i * 32, fy - 40); ctx.lineTo(fx - 40 + i * 32, fy + 40); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(fx - 70, fy - 12, 7, 0, 7); ctx.fillStyle = "#4a3220"; ctx.fill();
  stamp(ctx, "BITE FORECAST", 800, 1630, 50, "#4a3220", -0.14);
}

function themeSticker(ctx, img, d) {
  cover(ctx, img, 0, 0, W, H);
  var grd = ctx.createLinearGradient(0, H * 0.55, 0, H);
  grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,.45)");
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  /* starburst */
  ctx.save(); ctx.translate(790, 400); ctx.rotate(-0.12);
  burst(ctx, 0, 0, 320, 235, 16);
  ctx.fillStyle = "#ffd21f"; ctx.fill();
  ctx.lineWidth = 16; ctx.strokeStyle = "#d62828"; ctx.stroke();
  ctx.fillStyle = "#111"; ctx.textAlign = "center";
  ctx.font = "bold 118px " + SANS;
  ctx.fillText("I GOT", 0, -30);
  ctx.font = "bold 200px " + SANS;
  ctx.fillText(d.count + "!!", 0, 150);
  ctx.restore();
  tape(ctx, 180, 130, 220, 0.5); tape(ctx, 940, 900, 200, -0.4);
  /* species sticker */
  ctx.save(); ctx.translate(300, 1560); ctx.rotate(-0.07);
  ctx.fillStyle = "#fff"; rr(ctx, -260, -130, 520, 260, 36); ctx.fill();
  ctx.setLineDash([18, 12]); ctx.strokeStyle = "#7b5fc7"; ctx.lineWidth = 8;
  rr(ctx, -240, -110, 480, 220, 28); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#111"; ctx.textAlign = "center";
  ctx.font = "bold 62px " + SANS; ctx.fillText(d.species, 0, -30);
  ctx.font = "bold 92px " + SANS; ctx.fillText(d.dateStr.replace(", 2026", "").replace(" 2026", ""), 0, 70);
  ctx.restore();
  stamp(ctx, "BITE FORECAST APPROVED", 770, 1620, 44, "#1f9d55", 0.1);
  /* hook doodle */
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 10; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(150, 700, 44, 0.4, 2.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(150, 620); ctx.lineTo(150, 700); ctx.stroke();
}

function themeWanted(ctx, img, d) {
  ctx.fillStyle = "#e6d3a8"; ctx.fillRect(0, 0, W, H);
  speckle(ctx, 700, "#6b4a26", 0.1);
  ctx.strokeStyle = "#6b4a26"; ctx.lineWidth = 5;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  /* oval portrait */
  ctx.save();
  ctx.beginPath(); ctx.ellipse(W / 2, 600, 360, 420, 0, 0, 7); ctx.clip();
  cover(ctx, img, W / 2 - 360, 180, 720, 840);
  ctx.restore();
  ctx.lineWidth = 14; ctx.strokeStyle = "#6b4a26";
  ctx.beginPath(); ctx.ellipse(W / 2, 600, 360, 420, 0, 0, 7); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(W / 2, 600, 388, 448, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = "#3d2a14"; ctx.textAlign = "center";
  ls(ctx, 14); ctx.font = "bold 168px " + SERIF;
  ctx.fillText("WANTED", W / 2, 1220); ls(ctx, 0);
  ctx.font = "bold 72px " + SERIF;
  ctx.fillText("THE " + d.species + " SLAYER", W / 2, 1310);
  ctx.strokeStyle = "#3d2a14"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(180, 1370); ctx.lineTo(900, 1370); ctx.stroke();
  ctx.save(); ctx.translate(W / 2, 1370); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#3d2a14"; ctx.fillRect(-12, -12, 24, 24); ctx.restore();
  ctx.font = "bold 50px " + SANS;
  ctx.fillText("REWARD: " + d.count + " FISH • " + d.dateStr, W / 2, 1440);
  /* sheriff seal */
  ctx.save(); ctx.translate(W / 2, 1640);
  ctx.strokeStyle = "#3d2a14"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, 110, 0, 7); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 92, 0, 7); ctx.stroke();
  burst(ctx, 0, -8, 62, 30, 5); ctx.fillStyle = "#3d2a14"; ctx.fill();
  ctx.fillStyle = "#3d2a14"; ctx.font = "bold 30px " + SANS;
  ctx.restore();
  ctx.fillStyle = "#3d2a14"; ctx.textAlign = "center"; ctx.font = "bold 34px " + SANS;
  ctx.fillText("★ BITE FORECAST ★", W / 2, 1800);
}

function themePopart(ctx, img, d) {
  ctx.fillStyle = "#19b5d6"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e63a7b";
  for (var y = 0; y < H; y += 46) for (var x = 0; x < W; x += 46) {
    var r = 7 + 5 * Math.abs(Math.sin((x + y) / 130));
    ctx.beginPath(); ctx.arc(x + (y % 92 ? 23 : 0), y, r, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#19b5d6"; ctx.fillRect(90, 470, W - 180, 1010);
  ctx.save();
  rr(ctx, 90, 470, W - 180, 1010, 24); ctx.clip();
  try { ctx.filter = "saturate(1.5) contrast(1.1)"; } catch (e) {}
  cover(ctx, img, 90, 470, W - 180, 1010);
  try { ctx.filter = "none"; } catch (e) {}
  ctx.restore();
  ctx.lineWidth = 16; ctx.strokeStyle = "#111";
  rr(ctx, 90, 470, W - 180, 1010, 24); ctx.stroke();
  /* burst */
  ctx.save(); ctx.translate(W / 2, 260);
  burst(ctx, 0, 0, 400, 300, 14);
  ctx.fillStyle = "#ffd21f"; ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = "#111"; ctx.stroke();
  ctx.textAlign = "center";
  ctx.lineWidth = 10; ctx.strokeStyle = "#111";
  ctx.font = "bold 150px " + SANS;
  ctx.strokeText("POW!", 0, -40); ctx.fillStyle = "#d62828"; ctx.fillText("POW!", 0, -40);
  ctx.font = "bold 104px " + SANS;
  var t2 = d.count + " " + d.species + "!";
  ctx.strokeText(t2, 0, 90); ctx.fillStyle = "#d62828"; ctx.fillText(t2, 0, 90);
  ctx.restore();
  /* caption box */
  ctx.fillStyle = "#ffd21f"; rr(ctx, 140, 1560, W - 280, 130, 10); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = "#111"; rr(ctx, 140, 1560, W - 280, 130, 10); ctx.stroke();
  ctx.fillStyle = "#111"; ctx.textAlign = "center"; ctx.font = "bold 52px " + SANS;
  ctx.fillText(d.dateStr + " • BITE FORECAST", W / 2, 1642);
}

function themeChampion(ctx, img, d) {
  var rnd = seededRand(d.count * 7919 + 13);
  ctx.fillStyle = "#0b1a30"; ctx.fillRect(0, 0, W, H);
  var vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1100);
  vg.addColorStop(0, "rgba(30,60,110,.55)"); vg.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  /* gold corners */
  ctx.strokeStyle = "#e8b64c"; ctx.lineWidth = 6;
  [[60, 60, 1, 1], [W - 60, 60, -1, 1], [60, H - 60, 1, -1], [W - 60, H - 60, -1, -1]].forEach(function (c) {
    ctx.beginPath();
    ctx.moveTo(c[0] + 130 * c[2], c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + 130 * c[3]);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(c[0] + 150 * c[2], c[1], 10, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(c[0], c[1] + 150 * c[3], 10, 0, 7); ctx.stroke();
  });
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(232,182,76,.7)"; ctx.shadowBlur = 30;
  ctx.fillStyle = "#e8b64c"; ls(ctx, 8);
  ctx.font = "bold 128px " + SERIF;
  ctx.fillText("CATCH", W / 2, 250);
  ctx.fillText("CHAMPION", W / 2, 380);
  ls(ctx, 0); ctx.shadowBlur = 0;
  /* ribbon */
  var ry = 470;
  ctx.fillStyle = "#a87c1e";
  ctx.beginPath(); ctx.moveTo(90, ry); ctx.lineTo(170, ry + 55); ctx.lineTo(90, ry + 110); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(990, ry); ctx.lineTo(910, ry + 55); ctx.lineTo(990, ry + 110); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#e8b64c"; ctx.fillRect(110, ry, 860, 110);
  ctx.fillStyle = "#0b1a30"; ctx.font = "bold 56px " + SERIF;
  ctx.fillText(d.count + " " + d.species + " • " + d.dateStr, W / 2, ry + 72);
  /* photo */
  ctx.save(); rr(ctx, 140, 660, W - 280, 800, 26); ctx.clip();
  cover(ctx, img, 140, 660, W - 280, 800);
  ctx.restore();
  ctx.lineWidth = 10; ctx.strokeStyle = "#e8b64c"; rr(ctx, 140, 660, W - 280, 800, 26); ctx.stroke();
  /* confetti */
  var cols = ["#e8b64c", "#ffffff", "#d62828", "#7fd4ff"];
  for (var i = 0; i < 130; i++) {
    ctx.save();
    ctx.translate(rnd() * W, rnd() * H); ctx.rotate(rnd() * 6.3);
    ctx.fillStyle = cols[(rnd() * 4) | 0];
    ctx.fillRect(-9, -5, 18, 10);
    ctx.restore();
  }
  ctx.fillStyle = "#e8b64c"; ls(ctx, 12); ctx.font = "bold 44px " + SANS;
  ctx.fillText("BITE FORECAST", W / 2, 1800); ls(ctx, 0);
}

var THEMES = { retro: themeRetro, sticker: themeSticker, wanted: themeWanted, popart: themePopart, champion: themeChampion };
F._themes = THEMES; /* test hook: lets verification render frames headlessly */

function frameData(cur) {
  return {
    species: SPECIES[cur.species] || "POMPANO",
    count: cur.count,
    dateStr: fmtDate(cur.date)
  };
}
function renderFrameTo(canvas, cur) {
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var d = frameData(cur);
  if (!cur.img) {
    ctx.fillStyle = "#0a1626"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#5b7a99"; ctx.textAlign = "center";
    ctx.font = "bold 40px " + SANS;
    ctx.fillText("Add a photo to preview", canvas.width / 2, canvas.height / 2);
    return;
  }
  /* draw at 1080x1920 then scale */
  var full = document.createElement("canvas");
  full.width = W; full.height = H;
  (THEMES[cur.theme] || themeRetro)(full.getContext("2d"), cur.img, d);
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
}
function renderPreview() {
  var c = $("ffSnapPrev");
  var F2 = window.FFSnap;
  if (c && F2._curRef && F2._curRef()) renderFrameTo(c, F2._curRef());
}
function fullFrame(cur) {
  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  renderFrameTo(c, cur);
  return c;
}
function shareFrame() {
  var cur = window.FFSnap._curRef && window.FFSnap._curRef();
  var s = S();
  if (!cur || !cur.img) { alert(s.needPhoto); return; }
  fullFrame(cur).toBlob(function (blob) {
    if (!blob) return;
    /* canvas re-encode strips EXIF (incl. GPS) — shared image carries no location */
    var file = new File([blob], "bite-forecast-" + cur.date + ".png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Bite Forecast" }).catch(function () {});
    } else {
      downloadFrame();
      if (!/iPhone|iPad|Android/i.test(navigator.userAgent)) alert(s.shareFail);
    }
  }, "image/png");
}
function downloadFrame() {
  var cur = window.FFSnap._curRef && window.FFSnap._curRef();
  var s = S();
  if (!cur || !cur.img) { alert(s.needPhoto); return; }
  fullFrame(cur).toBlob(function (blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bite-forecast-" + cur.date + ".png";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }, "image/png");
}

/* expose for chunk 2's modal */
window.renderPreview = renderPreview;
window.shareFrame = shareFrame;
window.downloadFrame = downloadFrame;
F.renderPreview = renderPreview;

/* ---------- init ---------- */
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
