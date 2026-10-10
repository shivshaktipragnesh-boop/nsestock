const { quote, series, toKite, guard, fail } = require('./_kite');

const sparkCache = new Map();   // symbol -> { at, v }
let memo = { k: '', at: 0, v: null };

// GET /api/quotes?symbols=RELIANCE,TCS,^NSEI
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const syms = String(req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 40);
  const key = syms.join(',');
  res.setHeader('Cache-Control', 'private, no-store');

  // Collapse bursts (Kite allows about 1 quote request per second)
  if (memo.k === key && Date.now() - memo.at < 1500) return res.status(200).json(memo.v);

  try {
    const insts = syms.map(toKite).filter(Boolean);
    if (!insts.length) return res.status(200).json({ quotes: {} });
    const data = await quote(insts);

    const quotes = {};
    syms.forEach(s => {
      const d = data[toKite(s)];
      if (d && d.last_price != null && d.ohlc) quotes[s] = { price: d.last_price, prev: d.ohlc.close };
    });

    // Sparklines come from 5-minute candles. Fill a few per request to stay under Kite's history rate limit.
    const stale = Object.keys(quotes).filter(s => { const c = sparkCache.get(s); return !c || Date.now() - c.at > 120e3; }).slice(0, 3);
    await Promise.all(stale.map(async s => {
      try { const pts = await series(s, '1D'); sparkCache.set(s, { at: Date.now(), v: pts.slice(-40).map(p => p.c) }); } catch (e) { /* spark is optional */ }
    }));
    Object.keys(quotes).forEach(s => { const c = sparkCache.get(s); if (c) quotes[s].spark = c.v; });

    memo = { k: key, at: Date.now(), v: { quotes } };
    res.status(200).json({ quotes });
  } catch (e) { fail(res, e); }
};
