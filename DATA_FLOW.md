# Where the clinic's data goes — and where it's blocked from going

This is a plain map of every place data touches something outside your own
database, so there are no surprises. Anything not listed here does **not**
happen — there is no analytics, tracking, or telemetry anywhere in this app.

## Who receives what, and why

| Destination | What it receives | Why | Can you remove it? |
|---|---|---|---|
| **Render** (hosting) | Everything — it's where your database and server run | Unavoidable — this is your infrastructure, not a third party you're sending data *to* | N/A |
| **GitHub** | Only source code | Deploying updates | Make the repo Private (Settings → Danger Zone) so even the code is not public |
| **Gmail SMTP** (once connected) | The admin's email address + a 6-digit OTP code, nothing else | Delivering the one admin verification email | Yes — leave `DEMO_OTP_MODE`/SMTP unset and codes stay server-side only, in logs you alone can see |
| **Twilio** (once connected) | A staff member's mobile number + a 6-digit OTP code, nothing else | Delivering password-reset / User ID recovery texts | Same as above |
| **Google Fonts** (`fonts.googleapis.com`) | Nothing patient-related — just an automatic request every visitor's browser makes for the page's typefaces, which reveals their IP address to Google, like any font CDN | Visual design | Yes, see below if you want this at zero |

**Nothing else leaves this system.** No analytics platform, no ad network, no
error-tracking SaaS, no chat widget, no CDN other than the font one above.

## What's technically blocked, not just promised

- **Uploaded photos (case papers, bills) now require a valid login to view at
  all.** Previously they sat in a public folder anyone with the link could
  open — that's fixed. `GET /api/upload/:filename` sits behind the same
  authentication as every other route.
- **Passwords never leave the server as plain text**, not even to you — they're
  hashed the instant they arrive.
- **OTP codes are never included in any API response** — they only ever print
  to Render's server logs, which only someone with your Render login can see.
- **Every login/registration/OTP endpoint is rate-limited** (10 attempts per
  15 minutes) — a brute-force attempt gets locked out automatically rather
  than being merely "not recommended."
- **Every API route requires a valid access token except health-check and
  login/register** — there is no accidental "open" endpoint serving data.
- **Every action is logged** (User Access Report) — if data *is* viewed, you
  have a record of exactly who, what, and when, after the fact.

## What's a configuration choice, not code — you decide these

- **`CORS_ORIGIN`** currently allows any website to call your API from a
  browser (set to `*`). Narrowing this to your exact frontend address (e.g.
  `https://ganatra-clinic-frontend.onrender.com`) in Render's Environment tab
  reduces the blast radius if a login token were ever stolen elsewhere. This
  doesn't expose data by itself (a valid token is still required) but is a
  reasonable extra lock to turn.
- **GitHub repo visibility** — Public vs Private, a one-click Settings change
  on GitHub, covered in an earlier message.
- **Removing Google Fonts entirely**, if you want literally zero third-party
  network calls: this means falling back to fonts already installed on each
  device (system fonts) instead of the custom typefaces — a visual trade-off,
  not a functional one. Say the word and I'll make that change.

## Data retention

Nothing in this app automatically deletes old data — case records,
collections, and logs accumulate indefinitely unless someone deletes them
through the app. If you want an automatic retention/deletion policy (e.g.
"delete access logs older than 12 months"), that's a specific feature to
build, not something implied by anything above — let me know if you want it.
