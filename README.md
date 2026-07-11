# Ganatra Clinic — API backend

Node/Express + PostgreSQL API that the clinic ERP artifact can be pointed at
once you're ready to move off browser-local storage.

## Setup

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
createdb ganatra_clinic      # or create the database in your Postgres provider's dashboard
npm run migrate              # applies sql/schema.sql
npm run migrate:permissions  # applies sql/002_permissions.sql (roles & OTP tables)
npm run migrate:audit        # applies sql/003_audit_log.sql (user access report)
npm run migrate:gifts        # applies sql/004_gift_amount.sql (gift income)
npm run dev                  # starts the API on http://localhost:4000
```

`JWT_SECRET` should be a long random string — generate one with:
```bash
openssl rand -hex 32
```

## Authentication

All routes except `/api/health` and `/api/auth/*` require a bearer token:

```
Authorization: Bearer <token>
```

- `POST /api/auth/register` — `{ userId, password, name, email?, mobile? }`. Registering as
  `userId: "pratik"` with `email: "ganatra.p@gmail.com"` triggers the one-time admin
  bootstrap (see below). Everyone else must supply a `mobile` number and is created with
  `status: "pending_approval"` and no permissions — an Admin has to approve them.
- `POST /api/auth/verify-admin-otp` — `{ userId, code }` → activates the bootstrap admin account.
- `POST /api/auth/login` — `{ userId, password }` → `{ token, user }`. Fails with a clear
  message if the account is still pending OTP verification or admin approval.
- `POST /api/auth/forgot-password` — `{ userId }` → texts an OTP to the user's registered mobile.
- `POST /api/auth/reset-password` — `{ userId, code, newPassword }`.

Passwords must be at least 8 characters and include a letter, a number, and a special character.

### OTP delivery

OTPs are generated and checked server-side regardless of configuration. Whether they're
actually emailed/texted depends on `.env`:

- `DEMO_OTP_MODE=true` (the default) — no real email/SMS is sent; the code is logged to
  the server console and also returned in the API response as `devCode`, so you can test
  the whole flow immediately.
- Set `DEMO_OTP_MODE=false` and fill in the `SMTP_*` variables to actually email admin
  verification codes, and the `TWILIO_*` variables to actually text password-reset codes.

## Permissions

Non-admin users have no access to any module until an Admin sets it. Each of the nine
modules (`cases`, `collections`, `doctorPay`, `referrals`, `gifts`, `expenses`, `assets`,
`statements`, `auditLog`) gets an access **level** — `none`, `view`, `write`, `edit`, or
`delete` (each level includes everything before it) — plus an independent `export` flag.
`auditLog` governs the User Access Report itself, so viewing/exporting who-did-what is
just as rule-based as every other module.

- `GET /api/audit-log?from=&to=&module=&userId=` — every module route logs an entry here
  (who, which module, what action, when) the moment a permission check passes. Requires
  `auditLog: view` (or Admin).

- `GET /api/admin/users` — list every user, including ones awaiting approval (Admin only).
- `PUT /api/admin/users/:id/permissions` — `{ role?, permissions?, activate? }` (Admin only).
- `PUT /api/admin/users/:id/deactivate` — moves a user back to pending (Admin only).

## Routes

| Module | Base path | Notes |
|---|---|---|
| Clinic profile | `/api/settings` | `GET`, `PUT` (Admin/Doctor only) |
| Doctors | `/api/doctors` | `GET`, `POST`, `DELETE /:id` (soft-deletes) |
| Case records | `/api/cases` | `GET ?from&to`, `POST` (auto-generates `case_no`, accepts nested `medicines[]`), `DELETE /:id` |
| Collections | `/api/collections` | `GET ?from&to`, `GET /rollup?period=daily\|weekly\|monthly`, `POST`, `DELETE /:id` |
| Doctor pay | `/api/doctor-pays` | `GET`, `POST`, `DELETE /:id`, `GET /daily-net?from&to` |
| Referrals | `/api/referrals` | `GET`, `POST`, `DELETE /:id` |
| Gifts register | `/api/gifts` | `GET`, `POST`, `DELETE /:id` — disclosure only, never included in statements |
| Expenses | `/api/expenses` | `GET ?from&to`, `GET /category-totals?from&to`, `POST`, `DELETE /:id` |
| Fixed assets | `/api/assets` | `GET`, `GET /depreciation?fy=2025-26`, `POST`, `DELETE /:id` |
| Capital | `/api/capital` | `GET`, `POST { date, type: 'Introduced'\|'Drawings', amount, note }`, `DELETE /:id` |
| Statements | `/api/statements` | `GET /income?fy=`, `GET /capital-account?fy=`, `GET /balance-sheet?fy=` |
| Patient history | `/api/patients` | `GET /search?q=` (name or mobile), `GET /history?name=&phone=&from=&to=` — merged case + collection timeline |
| Image upload | `/api/upload` | `POST` multipart field `photo` → `{ url }` (dev-only local disk; see note below) |

Financial-year strings use the same `YYYY-YY` format as the frontend, e.g. `2025-26` for 1 Apr 2025 – 31 Mar 2026.

## Before this goes live

1. **Swap `src/routes/upload.js` for signed cloud storage uploads** (S3 / GCS / R2) instead of writing files to local disk — this route is a working stand-in for local development only.
2. **Put this behind HTTPS** (a reverse proxy like Caddy/Nginx, or your hosting platform's built-in TLS).
3. **Review `CORS_ORIGIN`** so only your actual web and mobile app origins can call the API.
4. **Back up the database on a schedule** and confirm your hosting region satisfies India's data-residency expectations for health data under the DPDP Act, 2023.
5. **Have a chartered accountant review** `src/utils/depreciation.js` and `src/routes/statements.js` against the clinic's actual practice before relying on the numbers for tax filing.
