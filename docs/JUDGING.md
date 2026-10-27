# Judge access and evaluation guide

## Evaluation route

Momo is a locally runnable desktop-browser application. The complete source, browser assets, and mocked tests are included. Public web hosting is unnecessary for this route. The submission also requires its project description and a separate demonstration video.

Follow [LOCAL_SETUP.md](LOCAL_SETUP.md). The backend must run for AI and checkout. The guided preset experience alone does not demonstrate the live integrations.

## Private live test access

**Source-package status: live evaluation credentials are not bundled or provisioned.** Before submitting, the maintainer must arrange access for organizers and judges. Writing instructions does not complete that credential handoff.

Provide a dedicated evaluation bundle through a private channel confirmed by the organizers. Do not publish it in a repository, issue, README, video, or publicly visible submission field. If no clearly private field is available, contact the organizers to confirm the handoff channel.

The bundle needs:

- A dedicated DeepSeek key with sufficient balance and access to the configured chat model and Search API. Judges should not need to purchase API access.
- A Sandbox REST app's Client ID and Secret associated with the Business test seller.
- A **different Personal Sandbox buyer** email and password with test funds available.
- The model name, any account-specific Search limitations, and the local setup instructions.

Do not include personal account passwords, Live credentials, real card details, existing private order files, or unrelated secrets. Validate the bundle on a fresh source copy and keep it working through the judging period. If replacement access is necessary, arrange it with the organizers before revoking access during review.

For judges: copy `.env.example` to `.env`, enter the supplied backend values locally, and run `node server.cjs`. Use the Personal Sandbox buyer only when PayPal asks the buyer to log in. If the bundle is missing or no longer works, request access through the submission's organizer contact route. There is no hidden fallback key in the public source.

Independent developers may use their own provider accounts instead. That is not the intended requirement for competition judges.

## Test 1 — Fresh source with no credentials

1. Extract or clone the source into a fresh directory and start `node server.cjs`.
2. Open http://127.0.0.1:4173/ and confirm the English interface loads.
3. Choose **Try guided demo**. Explore a preset wish, the mascot, preference flow, and saving an option.
4. Confirm AI and checkout remain explicitly unconfigured instead of reporting fake success.
5. Run `node --test test/*.test.cjs` in a separate terminal. No provider accounts or actual payments are used.

## Test 2 — Live planning and source-backed search

With backend credentials configured:

1. Send: `Find beginner-friendly online English lessons under USD 20 per lesson.`
2. Inspect the need summary, options, and original source links. Search results vary; a particular provider is not guaranteed.
3. Use **Edit needs** or send: `Only weekends, and I prefer a patient teacher.`
4. Inspect a source. A reference price requires matching source evidence. Unknown prices, availability, or location must stay unconfirmed.
5. Where next-step choices are offered, select useful items and use **Submit choices**. If a contact message is generated, edit or copy it. It is not automatically sent to anyone.

Ordinary web results are external leads. Momo does not accept payments for those providers, promise a reservation, or replace missing source evidence with fictional merchants.

## Test 3 — AI-to-PayPal Sandbox

1. Send: `I want an English speaking partner, at most USD 15, weekends only. Use the demo catalog.`
2. The current fictional catalog has one matching item: **Sam, USD 12**, with a weekend test slot. More expensive or weekday-only items must not be valid matches.
3. Open **Review option**. Check the item, test time, USD amount, and Sandbox label.
4. Use the official PayPal button, or **Open checkout** if the button SDK is unavailable.
5. Log in with the separate **Personal Sandbox buyer** and approve the test payment yourself.
6. Return to the same browser and origin. Inspect **Payment history** for verified **Completed** status, order ID, and capture ID.

The top-bar **Sandbox checkout** entry exercises payment without an AI call. Buyer approval is explicit. Only fictional catalog items can enter this checkout.

## Test 4 — Cancellation and retries

- Cancel a new checkout before approval; it must not produce a completed receipt.
- Retrying an existing checkout should reuse or reconcile its order rather than silently create another charge.
- The backend verifies amount, currency, purchase-unit identity, and completed capture before accepting success.
- Pending or uncertain results remain unconfirmed. Use **Check payment** in the original checkout.
- After restarting the backend, retain `.local/` and the original browser session to reconcile pending orders using persisted idempotency state.

These cases also have mocked automated coverage. A live provider's delayed response can require another status check.

## Current scope

This is an English, single-instance prototype. There is no real merchant onboarding, Live payment mode, fulfillment, reservation inventory, or webhook integration. Search does not guarantee current prices or availability. Mocked tests and real integration checks are distinct.
