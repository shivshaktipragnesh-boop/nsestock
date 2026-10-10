const { API_KEY, guard } = require('../_kite');

// GET /api/kite/login?key=<APP_KEY>   -> sends you to Zerodha's login page
module.exports = (req, res) => {
  if (!guard(req, res)) return;
  if (!API_KEY) return res.status(500).send('KITE_API_KEY is not set in the Vercel environment.');
  res.redirect(302, `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(API_KEY)}`);
};
