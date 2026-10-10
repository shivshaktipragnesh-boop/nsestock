# Indian Stocks for Meta Ray-Ban Display (Zerodha Kite Connect)

A 600x600 glanceable NSE watchlist with live prices, sparklines and charts for the Neural Band.
Data comes from the Kite Connect API through small Vercel API routes. The app is read-only: it never places orders.

## Files
- `index.html` - the whole front end
- `api/quotes.js` - prices for the watchlist and indices (Kite `/quote`)
- `api/chart.js` - 1D / 5D / 1M / 6M / 1Y history (Kite `/instruments/historical`)
- `api/kite/login.js`, `api/kite/callback.js` - the daily Zerodha login
- `api/_kite.js` - shared helper (token storage, REST wrapper, symbol mapping)
- `.env.example` - the environment variables to set

## 1. Get Kite Connect access
1. Sign in at https://developers.kite.trade with your Zerodha account.
2. Create an app of type **Connect**. Market data and history need this paid plan; the free Personal plan has no data.
   Check the current price on the Kite site before subscribing.
3. Fill in the form:
   - **App name:** anything (e.g. Glasses Stocks)
   - **Zerodha Client ID:** your client ID
   - **Redirect URL:** `https://YOUR-DOMAIN.vercel.app/api/kite/callback` (must match exactly)
   - **Postback URL:** leave blank
4. Copy the **API key** and **API secret** from the app page.

## 2. Deploy on Vercel
1. Push this folder to a Git repo and import it in Vercel (or run `npx vercel --prod` inside it).
2. Add storage: Vercel dashboard > Storage / Marketplace > **Upstash Redis**, and connect it to the project.
   This keeps the daily Kite token between requests. The `UPSTASH_REDIS_REST_*` (or `KV_REST_API_*`) variables are added for you.
3. Project > Settings > Environment Variables, add:

| Variable | Value |
|---|---|
| `KITE_API_KEY` | API key from step 1 |
| `KITE_API_SECRET` | API secret from step 1 |
| `KITE_USER_ID` | Your Zerodha client ID (only your account can complete the login) |
| `APP_KEY` | A long random string (the app and login URL then require `?key=`) |

4. Redeploy, then make sure the Redirect URL in the Kite app matches your final domain.

## 3. Log in (once per day)
Kite access tokens expire around 6 AM IST every day, so open this on your phone before the market opens:

    https://YOUR-DOMAIN.vercel.app/api/kite/login?key=YOUR_APP_KEY

Log in to Zerodha (password + 2FA). You land on a "Connected" page and the token is saved.
Until you do, the header chip on the glasses shows **LOGIN** and the footer says where to go.

## 4. Open it on the glasses
Open `https://YOUR-DOMAIN.vercel.app/?key=YOUR_APP_KEY` once. The page remembers the key afterwards.
If the chip says **KEY?**, the key is missing or wrong.

## Controls
| Where | Input | Action |
|---|---|---|
| Watchlist | Up / Down, Enter | Select / open |
| Watchlist | Enter on "Edit list" | Remove mode (Enter removes, Left finishes) |
| Chart | Up | Next stock |
| Chart | Down | Next period (1D, 5D, 1M, 6M, 1Y) |
| Chart | Left / Right | Scrub through the chart |
| Add stock | Arrows, Enter | Move / add (Left at the edge or Back cancels) |
| Anywhere | Back (Esc / Backspace) | Go back |

## Notes and limits
- **Polling, not streaming.** Kite's real-time feed is a WebSocket, which serverless functions can't hold open,
  so the page polls every 5 seconds during market hours (every minute when closed).
- **Rate limits.** Kite allows roughly 1 quote request per second and 3 history requests per second (verify in the
  Kite docs). The routes batch symbols and cache short bursts to stay under that.
- **Demo mode.** If the `/api` routes are unreachable (for example opening `index.html` locally), or you add `?demo`
  to the URL, the app runs on simulated prices and shows a DEMO chip.
- **Data use.** Exchange data is licensed to you through Zerodha. Keep `APP_KEY` set so the URL isn't public.
- **Adding stocks.** Extend the `SYMS` list at the top of the script in `index.html` with NSE trading symbols.
- Market hours are the NSE regular session (09:15-15:30 IST, Mon-Fri). Exchange holidays aren't tracked.
