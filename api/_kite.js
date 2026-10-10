// Shared Kite Connect helper (files starting with "_" are not routed by Vercel).
// Read-only: this app only calls /quote and /instruments/historical. It never places orders.
const crypto = require('crypto');

const API_KEY = process.env.KITE_API_KEY || '';
const API_SECRET = process.env.KITE_API_SECRET || '';
const BASE = 'https://api.kite.trade';
const IST = 5.5 * 3600e3;

/* ---------- Access-token storage ----------
   Kite access tokens expire around 6 AM IST every day, so the token is kept in Upstash Redis
   (Vercel Marketplace > Upstash Redis). Fallback: set KITE_ACCESS_TOKEN by hand. */
const R_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
let mem = { token: '', until: 0 };

async function redis(cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: `Bearer ${R_TOK}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
function secondsToNext6amIST() {
  const s = new Date(Date.now() + IST);
  let t = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 6, 0, 0);
  if (s.getTime() >= t) t += 86400000;
  return Math.max(300, Math.floor((t - s.getTime()) / 1000) - 300);
}
async function saveToken(token) {
  const ttl = secondsToNext6amIST();
  mem = { token, until: Date.now() + ttl * 1000 };
  if (R_URL && R_TOK) await redis(['SET', 'kite_access_token', token, 'EX', ttl]);
}
async function getToken() {
  if (mem.token && Date.now() < mem.until) return mem.token;
  if (R_URL && R_TOK) {
    try {
      const t = await redis(['GET', 'kite_access_token']);
      if (t) { mem = { token: t, until: Date.now() + 60e3 }; return t; }
    } catch (e) { /* fall through */ }
  }
  return process.env.KITE_ACCESS_TOKEN || '';
}

/* ---------- Errors, access guard ---------- */
class LoginRequired extends Error {}

// Optional shared secret so strangers can't spend your Kite quota. Set APP_KEY in Vercel,
// then open the app once with ?key=<APP_KEY>; the page remembers it.
function guard(req, res) {
  const need = process.env.APP_KEY;
  if (!need) return true;
  const got = Buffer.from(String(req.headers['x-app-key'] || req.query.key || ''));
  const want = Buffer.from(need);
  if (got.length === want.length && crypto.timingSafeEqual(got, want)) return true;
  res.status(401).json({ error: 'unauthorized' });
  return false;
}
function fail(res, e) {
  if (e instanceof LoginRequired) return res.status(401).json({ error: 'login_required' });
  res.status(502).json({ error: String((e && e.message) || e) });
}

/* ---------- REST wrapper ---------- */
async function kite(path) {
  const token = await getToken();
  if (!token) throw new LoginRequired();
  const r = await fetch(BASE + path, { headers: { 'X-Kite-Version': '3', Authorization: `token ${API_KEY}:${token}` } });
  let j = {};
  try { j = await r.json(); } catch (e) { /* non-JSON error body */ }
  if (j.error_type === 'TokenException') { mem = { token: '', until: 0 }; throw new LoginRequired(); }
  if (!r.ok || j.status !== 'success') throw new Error(j.message || 'Kite error ' + r.status);
  return j.data;
}

/* ---------- Symbols ---------- */
const INDEX = { '^NSEI': 'NSE:NIFTY 50', '^NSEBANK': 'NSE:NIFTY BANK', '^BSESN': 'BSE:SENSEX' };
const VALID = /^[A-Z0-9&\-]{1,20}$/i;
const toKite = s => INDEX[s] || (VALID.test(s) ? 'NSE:' + s.toUpperCase() : null);

const tokens = new Map(); // "NSE:INFY" -> instrument_token (comes back in every quote response)
async function quote(insts) {
  const data = await kite('/quote?' + insts.map(i => 'i=' + encodeURIComponent(i)).join('&'));
  for (const k in data) tokens.set(k, data[k].instrument_token);
  return data;
}

/* ---------- History ---------- */
const RANGES = {
  '1D': { iv: '5minute',  days: 6,   ttl: 20e3 },
  '5D': { iv: '15minute', days: 12,  ttl: 60e3 },
  '1M': { iv: 'day',      days: 35,  ttl: 600e3 },
  '6M': { iv: 'day',      days: 190, ttl: 600e3 },
  '1Y': { iv: 'day',      days: 370, ttl: 600e3 },
};
const istStamp = daysAgo => new Date(Date.now() - daysAgo * 86400000).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD HH:mm:ss
const scache = new Map();

async function series(sym, range) {
  const cfg = RANGES[range] || RANGES['1D'];
  const inst = toKite(sym);
  if (!inst) throw new Error('bad symbol');
  const ck = inst + range, hit = scache.get(ck);
  if (hit && Date.now() - hit.at < cfg.ttl) return hit.v;
  if (!tokens.has(inst)) await quote([inst]);
  const path = `/instruments/historical/${tokens.get(inst)}/${cfg.iv}?from=${encodeURIComponent(istStamp(cfg.days))}&to=${encodeURIComponent(istStamp(0))}`;
  const data = await kite(path);
  // candle = [timestamp, open, high, low, close, volume]; timestamp looks like 2026-10-09T09:15:00+0530
  let c = (data.candles || []).map(x => ({ d: String(x[0]).slice(0, 10), t: Date.parse(String(x[0]).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')), c: x[4] }));
  if (range === '1D') { const last = c.length && c[c.length - 1].d; c = c.filter(p => p.d === last); }
  else if (range === '5D') { const days = [...new Set(c.map(p => p.d))].slice(-5); c = c.filter(p => days.includes(p.d)); }
  else if (range === '1M') c = c.slice(-22);
  const v = c.map(p => ({ t: p.t, c: p.c }));
  scache.set(ck, { at: Date.now(), v });
  return v;
}

module.exports = { API_KEY, API_SECRET, BASE, kite, quote, series, toKite, guard, fail, saveToken, LoginRequired };
