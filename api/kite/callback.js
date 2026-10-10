const crypto = require('crypto');
const { API_KEY, API_SECRET, BASE, saveToken } = require('../_kite');

// Kite redirects here after login: /api/kite/callback?request_token=...&status=success
module.exports = async (req, res) => {
  const page = (title, msg) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:32px;background:#000;color:#fff"><h2>${title}</h2><p>${msg}</p></body>`);
  };
  const rt = String(req.query.request_token || '');
  if (req.query.status !== 'success' || !rt) return page('Login not completed', 'Kite did not return a request token. Open /api/kite/login to try again.');
  try {
    const checksum = crypto.createHash('sha256').update(API_KEY + rt + API_SECRET).digest('hex');
    const r = await fetch(BASE + '/session/token', {
      method: 'POST',
      headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_key: API_KEY, request_token: rt, checksum }),
    });
    const j = await r.json();
    if (j.status !== 'success') throw new Error(j.message || 'Token exchange failed');
    const only = process.env.KITE_USER_ID;   // optional: lock the app to your own Zerodha client ID
    if (only && j.data.user_id !== only) return page('Wrong Zerodha account', 'This app is locked to a different Zerodha user.');
    await saveToken(j.data.access_token);
    page('Connected ✓', `Kite session saved for ${String(j.data.user_id).replace(/</g, '&lt;')}. It expires around 6 AM IST tomorrow.`);
  } catch (e) {
    page('Login failed', String((e && e.message) || e).replace(/</g, '&lt;'));
  }
};
