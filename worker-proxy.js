// Cloudflare Worker proxy for Fishing Forecast (free tier: 100k req/day)
// Lets the app fetch NDBC buoys + CoastWatch satellite data (both block browser CORS).
// Setup: cloudflare.com → Workers → Create Worker → paste this → Deploy.
// Your proxy URL will look like: https://fishing-proxy.<you>.workers.dev
// App calls it as: <worker-url>/?url=https://www.ndbc.noaa.gov/data/realtime2/41009.txt
//
// /report-catch (new): anonymous catch reports → our GitHub repo as data.
//   POST {v:1, species:"pompano"|"snook"|"mackerel", count:1..99, date:"YYYY-MM-DD",
//         spot:{name, lat?, lon?} (optional)}
//   Validated, then committed as data/catches/<date>/<uuid>.json via the
//   Contents API. Needs a repo secret: GITHUB_TOKEN = fine-grained PAT with
//   Contents read+write on the repo. One file per report → no SHA races.
//   NOTE: repo is public — reports carry no name/device/photo, spot only.

const ALLOW = [
  { host: 'www.ndbc.noaa.gov', prefix: '/data/realtime2/' },       // buoy observations
  { host: 'coastwatch.pfeg.noaa.gov', prefix: '/erddap/' },        // satellite SST/chlorophyll
];

const CATCH_SPECIES = ['pompano', 'snook', 'mackerel'];
const GH_OWNER = 'moonhunter8899-star';
const GH_REPO = 'fishingforecast';

function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }, extra || {});
}
function validCatch(b) {
  if (!b || typeof b !== 'object') return false;
  if (CATCH_SPECIES.indexOf(b.species) < 0) return false;
  if (!Number.isInteger(b.count) || b.count < 1 || b.count > 99) return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  const d = new Date(b.date + 'T12:00:00Z');
  if (isNaN(d)) return false;
  const now = Date.now(), t = d.getTime();
  if (t > now + 864e5) return false;                 // not in the future
  if (t < now - 14 * 864e5) return false;            // not older than 14 days
  if (b.spot !== undefined) {                        // spot optional, validated when present
    const s = b.spot;
    if (!s || typeof s !== 'object') return false;
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120) return false;
    if (s.lat !== undefined && (typeof s.lat !== 'number' || s.lat < -90 || s.lat > 90)) return false;
    if (s.lon !== undefined && (typeof s.lon !== 'number' || s.lon < -180 || s.lon > 180)) return false;
  }
  return true;
}
// best-effort per-IP throttle (per-isolate; Cloudflare rate limits add more)
const hits = new Map();
function throttled(ip) {
  const now = Date.now(), w = 6e4, max = 10;
  let arr = hits.get(ip) || [];
  arr = arr.filter(t => now - t < w);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 2000) hits.clear();
  return arr.length > max;
}

async function handleReportCatch(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors() });
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (throttled(ip)) return new Response('slow down', { status: 429, headers: cors() });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400, headers: cors() }); }
  if (!validCatch(body)) return new Response('bad report', { status: 400, headers: cors() });
  if (!env.GITHUB_TOKEN) return new Response('not configured', { status: 500, headers: cors() });

  const uuid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const path = `data/catches/${body.date}/${uuid}.json`;
  const payload = {
    species: body.species, count: body.count, date: body.date,
    reported_at: new Date().toISOString(),
  };
  if (body.spot) payload.spot = body.spot;
  const content = btoa(JSON.stringify(payload));
  let gh;
  try {
    gh = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'BiteForecast-CatchRelay/1.0',
      },
      body: JSON.stringify({ message: `catch report ${body.date} ${body.species}x${body.count}`, content }),
    });
  } catch { return new Response('upstream error', { status: 502, headers: cors() }); }
  if (!gh.ok) return new Response('github error', { status: 502, headers: cors() });
  return new Response(JSON.stringify({ ok: true }), { headers: cors({ 'Content-Type': 'application/json' }) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/report-catch') return handleReportCatch(request, env || {});

    const target = url.searchParams.get('url');
    if (!target) return new Response('missing url', { status: 400 });

    let t;
    try { t = new URL(target); } catch { return new Response('bad url', { status: 400 }); }
    if (t.protocol !== 'https:') return new Response('https only', { status: 400 });

    const ok = ALLOW.some(a =>
      t.hostname.toLowerCase() === a.host && t.pathname.startsWith(a.prefix));
    if (!ok) return new Response('not allowed', { status: 403 });

    let resp;
    try {
      resp = await fetch(t.toString(), { headers: { 'User-Agent': 'FishingForecast/1.0' } });
    } catch { return new Response('upstream error', { status: 502 }); }
    if (!resp.ok) return new Response('upstream error', { status: 502 });

    return new Response(resp.body, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': resp.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
};
