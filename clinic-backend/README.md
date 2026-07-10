# Ganatra Clinic — API backend

Node/Express + PostgreSQL API that the clinic ERP artifact can be pointed at
once you're ready to move off browser-local storage.

## Setup

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
createdb ganatra_clinic      # or create the database in your Postgres provider's dashboard
npm run migrate              # applies sql/schema.sql
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

- `POST /api/auth/register` — `{ userId, password, name, role }` → `{ token, user }`
- `POST /api/auth/login` — `{ userId, password }` → `{ token, user }`

Tokens expire after 12 hours; the frontend should re-login (or you can add a
refresh-token flow later) when a request comes back `401`.

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
| Image upload | `/api/upload` | `POST` multipart field `photo` → `{ url }` (dev-only local disk; see note below) |

Financial-year strings use the same `YYYY-YY` format as the frontend, e.g. `2025-26` for 1 Apr 2025 – 31 Mar 2026.

## Before this goes live

1. **Swap `src/routes/upload.js` for signed cloud storage uploads** (S3 / GCS / R2) instead of writing files to local disk — this route is a working stand-in for local development only.
2. **Put this behind HTTPS** (a reverse proxy like Caddy/Nginx, or your hosting platform's built-in TLS).
3. **Review `CORS_ORIGIN`** so only your actual web and mobile app origins can call the API.
4. **Back up the database on a schedule** and confirm your hosting region satisfies India's data-residency expectations for health data under the DPDP Act, 2023.
5. **Have a chartered accountant review** `src/utils/depreciation.js` and `src/routes/statements.js` against the clinic's actual practice before relying on the numbers for tax filing.
