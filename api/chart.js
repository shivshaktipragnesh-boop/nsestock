const { quote, series, toKite, guard, fail } = require('./_kite');

// GET /api/chart?symbol=RELIANCE&range=1M      range: 1D | 5D | 1M | 6M | 1Y
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const sym = String(req.query.symbol || '');
  const range = String(req.query.range || '1D').toUpperCase();
  try {
    const inst = toKite(sym);
    if (!inst) return res.status(400).json({ error: 'bad symbol' });
    let prev = null;
    if (range === '1D') {                      // previous close is the dashed baseline on the 1D chart
      const q = await quote([inst]);
      prev = q[inst] && q[inst].ohlc ? q[inst].ohlc.close : null;
    }
    const points = await series(sym, range);
    res.status(200).json({ points, prev });
  } catch (e) { fail(res, e); }
};
