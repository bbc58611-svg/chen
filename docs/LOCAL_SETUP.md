# Local setup and troubleshooting

Run the complete browser application and Node.js backend on your computer. No cloud account, hosting subscription, database service, package installation, or build step is needed.

## Requirements

- Node.js 22 or later; Node.js 24 is recommended. Check with `node --version`.
- A current Chrome, Edge, Firefox, or Safari browser.
- Network access to DeepSeek and PayPal Sandbox for live testing. The guided demo and mocked tests need no provider account.

Extract or clone the source. The directory must contain `server.cjs`, `package.json`, `dist/`, and `backend/` at the same level. Run commands from that directory.

## Start without credentials

Windows PowerShell:

```powershell
Copy-Item .env.example .env
node server.cjs
```

macOS / Linux:

```sh
cp .env.example .env
node server.cjs
```

Copy the template only for a fresh setup; keep an existing configured `.env`. Open http://127.0.0.1:4173/ and choose **Try guided demo**. Inspect the preset catalog, mascot, preference flow, and local favorites. Live AI and checkout require actual provider configuration and show an explicit error if unavailable.

On Windows, `start-momo.cmd` is an alternative launcher. It starts Node in watch mode so backend source edits restart the process. Do not run two servers on the same port.

## Configure DeepSeek

Independent developers can obtain an API key from the [DeepSeek platform](https://platform.deepseek.com/). Verify that the account can use the configured chat model and Search API. API calls may incur provider charges. Judges should use the privately supplied evaluation bundle in [JUDGING.md](JUDGING.md), rather than needing to purchase API access.

In the local `.env`:

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_SEARCH_ENABLED=true
```

Fill in the key after `DEEPSEEK_API_KEY=`. Do not put it in browser JavaScript, commit it, or record it in a video. `deepseek-flash` is the current application default; another model must support the structured chat responses used by this code. The backend calls `https://api.deepseek.com/chat/completions` and `https://api.deepseek.com/v1/tools/search`.

If Search is unavailable, the app shows the failure instead of inventing searched resources. For an intentional planning-only test, set `DEEPSEEK_SEARCH_ENABLED=false`; do not describe that as live search.

Stop the server with Ctrl+C and restart after changing `.env`. Watch mode does not reliably reload environment-file edits. Refresh the browser, choose **Check connection**, and send a message to verify an actual AI response. A configured indicator alone does not prove a successful provider call.

## Configure PayPal Sandbox

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) and select **Sandbox**.
2. In **Apps & Credentials**, use or create a Sandbox REST application. Put its credentials into the local backend `.env`:

```dotenv
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
```

3. Both values must belong to the same Sandbox app. Do not use Live credentials.
4. Under the dashboard's Sandbox testing tools, obtain a **Personal** Sandbox buyer. It must differ from the **Business** Sandbox seller receiving the test payment. See [Sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts).
5. Restart Node, refresh Momo, and use **Sandbox checkout** to open a fictional item. Review the amount and option.
6. In PayPal, log in using the Personal Sandbox buyer email and password. Do not use your developer-dashboard login or Sandbox seller account. Approve the test payment yourself. A real card is not needed for this account-based test flow.
7. Return to Momo in the same browser. **Completed** requires a completed capture with matching amount, currency, and order identity. Cancelling or closing checkout does not complete a payment.

The backend is fixed to `https://api-m.sandbox.paypal.com`; there is no Live mode. Catalog people, gifts, prices, and times are fictional. The official button SDK loads from `www.paypal.com`; that SDK hostname alone does not imply a Live payment.

## Configuration reference

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | Backend-only key for real chat and search |
| `DEEPSEEK_MODEL` | Chat model; default `deepseek-flash` |
| `DEEPSEEK_SEARCH_ENABLED` | `true` for search; `false` for planning-only testing |
| `PAYPAL_CLIENT_ID` | Sandbox app ID used by the official SDK |
| `PAYPAL_CLIENT_SECRET` | Backend-only Secret from the same app |
| `PORT` | Local HTTP port; default `4173` |
| `PUBLIC_ORIGIN` | Leave blank locally; an HTTPS origin enables the optional hosted runtime |
| `DATA_DIR` | Leave blank to use the private `.local/` order directory |

http://127.0.0.1:4173/healthz should return `{"ok":true}`. It checks the HTTP service only and does not call providers. `/api/config` returns configuration flags, not secrets.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node` is not recognized | Install Node.js, reopen the terminal, and check `node --version` |
| Port 4173 is in use | Reuse the running server. If it is an older instance of this project, stop that instance before restarting; alternatively change `PORT` and use the matching URL |
| Backend is offline | Run `node server.cjs` and open its HTTP URL. Opening `dist/index.html` as a file does not provide an API backend |
| DeepSeek is unauthorized or unconfigured | Check `.env` and restart. Do not paste keys or sensitive provider responses into public issues |
| Insufficient AI/search balance | Use the evaluation bundle or check provider access and balance. Guided demo and mocked tests remain available |
| Search has no cards | Read the failure or empty-result notice, refine the request, and inspect original sources. No evidence means no confirmed reference price |
| PayPal button does not load | Use **Open checkout** to retrieve an official approval link without the button SDK. PayPal Sandbox still must be reachable |
| PayPal says you are the seller | Sign out of Sandbox checkout and use the separate **Personal** buyer |
| Payment is pending or uncertain | Keep the original browser session, reopen the same test item if needed, and choose **Check payment**. Do not delete `.local/` or session storage |
| Backend version mismatch | Stop the older project process and restart `node server.cjs` from this source folder |
| Another device cannot open localhost | Local mode binds to the same computer's loopback address. Evaluate in a browser on that computer |

## Tests and data

Run `node --test test/*.test.cjs`. Tests use synthetic data and mocked upstream APIs. No credentials, AI charges, or Sandbox transfers are involved.

`.local/paypal-sandbox-orders.json` contains private checkout capability tokens and idempotency state. Keep it out of Git, public archives, and screenshots. Preserve it while orders may need reconciliation. Use one process per store file.

Browser favorites and receipts are stored per origin: `localhost`, `127.0.0.1`, and different ports have separate storage. Use the same origin throughout a checkout. Conversations are held in page memory and lost on refresh.
