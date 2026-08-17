# DS Gunasekara Group — Store Management System

Multi-location inventory system for **DS Gunasekara Group** bus spare parts. Store operators post receipts, issues, returns, and local purchases; administrators manage users, stores, reorder levels, and inventory corrections. Posted stock history is append-only and cannot be rewritten.

The app is branded **StoreOps** in the UI.

---

## Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Inventory integrity](#inventory-integrity)
- [Authentication and authorization](#authentication-and-authorization)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Development seed](#development-seed)
- [Commands](#commands)
- [Application routes](#application-routes)
- [Project layout](#project-layout)
- [Database and migrations](#database-and-migrations)
- [Testing](#testing)
- [Production](#production)
- [Health checks](#health-checks)
- [Development conventions](#development-conventions)

---

## What it does

Workshops and stores keep spare parts across locations (for example Colombo and Kandy). This system tracks **what is on hand at each store**, **what was issued to which bus**, and **how stock got there**, with an immutable ledger.

Typical day-to-day use:

1. An operator signs in and only sees stores they are assigned to.
2. They open a **job card** when a bus comes into the workshop, then receive stock, issue parts against that card, or return unused / worn items. A barcode scan matches SKU or the printed QR value and asks for a store when the part is on hand in more than one location.
3. Low-stock alerts compare on-hand balances to per-store reorder levels.
4. Bus history shows job cards, parts, tyre positions, DAG retreads, and oil changes.
5. Admins correct mistakes with **adjustments** or **reversals** — never by editing posted documents.

---

## Features

### Operations

| Area                    | What you can do                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**           | Store, part, bus, and transaction counts, a receipts-vs-issues trend, and links from low-stock / top-consumed rows into stock-in or issue                              |
| **Balances**            | On-hand quantity per store and part, with unit, reorder level, and issue / stock-in links                                                                              |
| **Scan barcode**        | Match a printed QR (SKU or barcode), pick the store when the part exists in more than one location, then jump to issue or stock-in with the part and store preselected |
| **Stock in**            | Post a stock receipt into a store (optional supplier and unit cost)                                                                                                    |
| **Bus issue**           | Issue parts against an **open job card**; stock cannot go below zero                                                                                                   |
| **Bus return**          | Return unused parts or worn items from a bus against the open job card                                                                                                 |
| **Job cards**           | Open / close workshop cards (one open per bus). Required for new issues and returns                                                                                    |
| **Tyres**               | Register serials against on-hand tyre SKUs, fit/replace on a job card (positions FL/FR/RLI/RLO/RRI/RRO/SPARE)                                                          |
| **DAG**                 | Send a store serial to retread and receive it as the next stage (ORG → DAG1 → DAG2 → DAG3, then scrap)                                                                 |
| **Oil change**          | Issue litres of an OIL-category part on a job card and log km/date                                                                                                     |
| **Bus history**         | Per-bus timeline of job cards, stock, tyres, and oil, plus the current tyre map                                                                                        |
| **Returns & reversals** | Reverse a posted document with a compensating movement                                                                                                                 |
| **Tire conversion**     | Convert tire stock from one lifecycle SKU to another (for example original to retread)                                                                                 |
| **Purchases**           | Record a local purchase and post the linked stock receipt in one transaction                                                                                           |
| **Low stock**           | Parts at or below `store_part_settings.reorder_level` (computed; no alerts table), with a stock-in link                                                                |
| **Receipts**            | Printable posted-document view. Linked from movements, daily movement, bus usage, purchases, and the admin audit log                                                   |

### Master data

- **Parts** — SKU, name, barcode, unit, brand, category, active flag. Operators can browse; only admins add or activate/deactivate.
- **Categories** — group parts (Engine, Brakes, Electrical, and so on). Mutations are admin-only.
- **Part selector** — searchable dropdown grouped by category (name, SKU, or barcode), used on stock forms, purchases, tire conversion, and corrections
- **Print labels** — QR labels (`barcode` or SKU). Select which active parts to print, including uncategorized items.
- **Buses** — fleet number, registration, make/model (admin mutations). Each bus has a history page.
- **Suppliers** — local procurement counterparts (admin mutations)

### Reports

- **Movements** — immutable stock movement history. Document numbers open `/receipts/:id`. `?posted=` and `?purchase=` filter to that document (empty state if nothing matches).
- **Daily movement** — activity for a chosen business date, with receipt links
- **Fast-moving items** — parts with the most issue activity, with an issue link
- **Bus usage** — parts consumed by fleet number, with receipt links
- **Purchases** — local purchase history, with a link to the posted receipt

### Administration (Admin only)

- **Users** — create operators/admins, assign stores, disable accounts
- **Stores** — location codes, names, addresses
- **Reorder levels** — per-store, per-part minimums and bin locations
- **Corrections** — increase/decrease adjustments and document reversals
- **Audit log** — recent `audit_events` (posts, reversals, purchases, low-stock alerts). Stock-document rows open the receipt. Reversals show which document was reversed.

---

## Tech stack

| Layer              | Choice                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| App                | [React Router 8](https://reactrouter.com/) Framework Mode (SSR)              |
| UI                 | React 19, Tailwind CSS 4, Recharts, react-select, react-qr-code              |
| Language           | TypeScript                                                                   |
| Database           | PostgreSQL 17                                                                |
| ORM                | Drizzle ORM                                                                  |
| Validation         | Zod                                                                          |
| Quantities / money | `numeric` columns + [decimal.js](https://mikemcl.github.io/decimal.js/)      |
| Passwords          | Argon2 (`@node-rs/argon2`)                                                   |
| Sessions           | HttpOnly cookie (`ds_store_session`), hashed token in `sessions`             |
| Package manager    | pnpm 11                                                                      |
| Tests              | Vitest (unit/integration), Playwright (e2e smoke)                            |
| Deploy             | Docker image (`pnpm start`) or Netlify (`@netlify/vite-plugin-react-router`) |

Server-only modules use the `.server.ts` suffix so client bundles never pull database or auth secrets. The import alias `~/*` maps to `app/*`.

---

## Architecture

```
Browser
  │  form POST + CSRF
  ▼
Route module (app/routes/*)
  │  loader → requireUser / requireAdmin → feature queries
  │  action → requireValidCsrf → feature posting
  ▼
Feature layer (app/features/*/ *.server.ts)
  │  Zod schemas, store-scope checks, posting
  ▼
Drizzle + PostgreSQL
  │  stock_documents → stock_document_lines → stock_movements
  │  inventory_balances cache (must match the ledger)
  ▼
DB triggers (database/migrations/*.sql)
     block UPDATE/DELETE of posted history
```

| Area                              | Role                                                                     |
| --------------------------------- | ------------------------------------------------------------------------ |
| `app/routes.ts`                   | Route table (auth, health, app layout, admin)                            |
| `app/routes/*`                    | Loaders (reads), actions (mutations), page UI                            |
| `app/features/*`                  | Domain logic: inventory, master data, dashboard, workshop                |
| `app/db/schema/*`                 | Drizzle tables: auth, master-data, inventory, purchases, workshop, audit |
| `app/db/client.server.ts`         | Shared `pg` Pool + Drizzle client                                        |
| `app/lib/auth/*`                  | Session cookie, password hashing, store scope                            |
| `app/lib/csrf.server.ts`          | Origin + session CSRF checks for form posts                              |
| `app/components/*`                | Shared UI (stock form, part selector, CSRF field)                        |
| `app/config/env.server.ts`        | Process-env validation (no `VITE_*` secrets)                             |
| `database/migrations/generated`   | Drizzle-generated SQL                                                    |
| `database/migrations/*.sql`       | Hand-written invariants (triggers, FKs)                                  |
| `database/scripts/*`              | migrate, bootstrap-admin, reconcile                                      |
| `tests/unit`, `tests/integration` | Vitest                                                                   |
| `e2e/`                            | Playwright smoke                                                         |

**Request flow**

1. Layout/route `loader` calls `requireUser` or `requireAdmin`, then a feature query.
2. Mutations live in route `action`s and call posting helpers such as `postStock` — never in loaders.
3. Operators only see stores from `user_store_assignments`. Admins get unrestricted access (`getAuthorizedStoreIds` returns `null`). Stock writes call `requireStoreAccess` first.

Core posting path: `app/features/inventory/posting.server.ts`.  
Queries: `app/features/inventory/queries.server.ts`.

---

## Inventory integrity

These rules are non-negotiable. The application and database both enforce them.

| Rule                      | How it works                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ledger**                | `stock_movements` is append-only. Each row has a signed `quantity_delta` and `balance_after`.                                                                                                                               |
| **Balance cache**         | `inventory_balances` is keyed by `(store_id, part_id)` and must match the ledger. Check with `pnpm db:reconcile`.                                                                                                           |
| **Documents**             | `stock_documents` + lines. Status is `DRAFT` → `POSTED`.                                                                                                                                                                    |
| **No negative stock**     | Issues and decreases cannot drive a balance below zero (app + DB).                                                                                                                                                          |
| **No rewrite of history** | Triggers in `database/migrations/0001_inventory_invariants.sql` and `0003_workshop_invariants.sql` block UPDATE/DELETE of posted documents, lines, movements, audit events, tyre events, oil changes, and closed job cards. |
| **Idempotency**           | Unique on `(created_by, idempotency_key)` so a double-submit does not post twice.                                                                                                                                           |
| **Decimals**              | Quantities use PostgreSQL `numeric` and decimal.js. Inputs are validated with Zod in `app/features/inventory/schemas.ts`.                                                                                                   |

**Document types**

| Type               | Prefix                | Who              | Effect                                                                                |
| ------------------ | --------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `STOCK_RECEIPT`    | `SIN-{store}-{year}-` | Operator / Admin | Increases on-hand                                                                     |
| `BUS_ISSUE`        | `ISS-{store}-{year}-` | Operator / Admin | Decreases on-hand; requires a bus and an open job card                                |
| `BUS_RETURN`       | `BSR-{store}-{year}-` | Operator / Admin | Increases on-hand; requires a bus and an open job card                                |
| `TYRE_DAG_SEND`    | `TDS-{store}-{year}-` | Operator / Admin | Decreases on-hand when a serial leaves for retread                                    |
| `TYRE_DAG_RECEIVE` | `TDR-{store}-{year}-` | Operator / Admin | Increases on-hand when a serial returns from DAG                                      |
| `ADJUSTMENT`       | `ADJ-{store}-{year}-` | Admin            | Increase or decrease; reason required. Line quantity stays positive; delta is signed. |
| `REVERSAL`         | `REV-{store}-{year}-` | Operator / Admin | Compensating document that points at the original                                     |

Fix mistakes with an **adjustment** or **reversal**. Never UPDATE or DELETE posted rows.

---

## Authentication and authorization

**Roles** (`app/db/schema/auth.ts`)

| Role       | Access                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `ADMIN`    | All stores. Users, stores, reorder levels, and corrections.                                             |
| `OPERATOR` | Only assigned stores. Day-to-day stock, master data they can reach, and reports scoped to those stores. |

**Session**

- Cookie name: `ds_store_session`
- HttpOnly, `SameSite=Lax`, `Secure` in production
- Absolute TTL: **12 hours**
- Raw token is never stored; `sessions.token_hash` is SHA-256
- Disabled users (`status = DISABLED`) cannot use an existing session
- `mustChangePassword` redirects every page except `/change-password`

**CSRF**

Form posts must include the session CSRF secret and come from `APP_ORIGIN` or the current request origin (so preview/Netlify URLs still work). See `app/lib/csrf.server.ts`.

**Passwords**

Hashed with Argon2. New and bootstrapped admins must change the temporary password on first login.

---

## Requirements

- **Node.js 24+** (Dockerfile uses `node:24-alpine`)
- **pnpm 11** (`packageManager` is `pnpm@11.15.1`; Corepack can activate it)
- **Docker** for the local PostgreSQL 17 service, _or_ an external PostgreSQL 17 database
- **PowerShell** examples below match Windows; the same commands work in bash if you adapt env assignment

---

## Local setup

### 1. Clone and install

```powershell
git clone <repository-url>
cd "Store Management System"
pnpm install
```

### 2. Environment file

```powershell
Copy-Item .env.example .env
```

Replace `SESSION_COOKIE_SECRET` with at least **32 random characters**. Leave the other defaults if you use the Compose database.

### 3. Start PostgreSQL

```powershell
docker compose up -d db
```

This starts `postgres:17-alpine` as `store_management` / `store_user` / `store_password` on port `5432`. Data is stored in the `store_management_pgdata` volume.

Wait until the healthcheck is ready (`pg_isready`), then migrate and seed.

### 4. Migrate, seed, run

```powershell
$env:DATABASE_URL = "postgresql://store_user:store_password@localhost:5432/store_management"
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

### External PostgreSQL

Skip Compose. Set `DATABASE_URL` to your connection string (must start with `postgresql://`), then:

```powershell
pnpm db:migrate
pnpm db:seed   # development only; refused when NODE_ENV=production
pnpm dev
```

---

## Environment variables

Read only from **process env** in `app/config/env.server.ts`. Do not put secrets in `VITE_*` variables.

| Variable                   | Required       | Default                 | Purpose                                                  |
| -------------------------- | -------------- | ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`             | Yes            | —                       | PostgreSQL URL (`postgresql://…`)                        |
| `SESSION_COOKIE_SECRET`    | Yes            | —                       | Cookie signing secret, **≥ 32 characters**               |
| `APP_ORIGIN`               | Yes            | —                       | Canonical origin for CSRF (e.g. `http://localhost:5173`) |
| `NODE_ENV`                 | No             | `development`           | `development` \| `test` \| `production`                  |
| `APP_TIME_ZONE`            | No             | `Asia/Colombo`          | Display / business time zone                             |
| `LOG_LEVEL`                | No             | `info`                  | `debug` \| `info` \| `warn` \| `error`                   |
| `TRUST_PROXY`              | No             | `false`                 | Set `true` behind a reverse proxy                        |
| `DEV_ADMIN_PASSWORD`       | Seed only      | `ChangeMe123!`          | Password for the development admin                       |
| `BOOTSTRAP_ADMIN_PASSWORD` | Bootstrap only | —                       | Temporary production admin password, **≥ 12 characters** |
| `E2E_BASE_URL`             | E2E only       | `http://localhost:5178` | Playwright base URL                                      |

`.env.example`:

```env
NODE_ENV=development
DATABASE_URL=postgresql://store_user:store_password@localhost:5432/store_management
SESSION_COOKIE_SECRET=replace-with-at-least-32-random-characters
APP_ORIGIN=http://localhost:5173
APP_TIME_ZONE=Asia/Colombo
LOG_LEVEL=info
TRUST_PROXY=false
```

Compose can also override `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_PORT`.

---

## Development seed

`pnpm db:seed` is **blocked in production**. It upserts master data and, on the first run, posts mock workshop/inventory history (skipped if seed documents already exist):

| Entity | Seed value |
| --- | --- |
| Stores | `CMB` Colombo Central Store, `KDY` Kandy Store |
| Admin | `admin@dsgunasekara.local` / `ChangeMe123!` (or `DEV_ADMIN_PASSWORD`) |
| Operator | `operator@dsgunasekara.local` / same password, assigned to Colombo |
| Categories | Engine, Brakes, Electrical, Tyres, Oil |
| Parts | Filters, brake pads/shoes, belt, battery, headlamp, ORG/DAG1/DAG2 tyres, 15W-40 and gear oil (with barcodes) |
| Suppliers | Local Supplier, Ceat Kelani Tyres, Lanka IOC Lubricants |
| Buses | `BUS-001` … `BUS-006` (Leyland / Tata, WP / CP / KY / NW plates) |
| Reorder | Per-part levels and bin locations for both stores |
| Stock | Opening receipts, bus issues, DAG send/receive, balances |
| Purchases | One posted Ceat tyre purchase linked to a Colombo receipt |
| Job cards | Three closed cards plus one open card on `BUS-003` |
| Tyres | Serials fitted on `BUS-001`, in-store ORG stock, one casing at DAG, one DAG1 returned |
| Oil | 18 L change logged on `BUS-001` |

The admin is created with `must_change_password = true`. You will be sent to `/change-password` on first login. Re-running the seed does **not** reset an existing admin password.

---

## Commands

```powershell
pnpm install              # Install dependencies
pnpm dev                  # SSR dev server → http://localhost:5173
pnpm build                # Production build
pnpm start                # Serve build (react-router-serve)
pnpm typecheck            # react-router typegen + tsc --noEmit
pnpm lint                 # ESLint
pnpm format               # Prettier write
pnpm format:check         # Prettier check
pnpm test                 # Vitest unit/integration (once)
pnpm test:watch           # Vitest watch
pnpm test -- password     # Tests matching a file or name
pnpm test:integration     # Vitest under tests/integration
pnpm test:e2e             # Playwright (default baseURL http://localhost:5178)
pnpm verify               # format:check + lint + typecheck + test + build
pnpm db:generate          # Drizzle kit → database/migrations/generated
pnpm db:migrate           # Apply generated + custom SQL
pnpm db:seed              # Development seed (not production)
pnpm db:bootstrap-admin   # First Admin when none exists
pnpm db:reconcile         # Compare inventory_balances to the movement ledger
```

---

## Application routes

Unauthenticated users are sent to `/login`. Forced password change applies to every authenticated route except `/change-password`.

| Path                      | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `/login`                  | Sign in                                                              |
| `/logout`                 | End session                                                          |
| `/change-password`        | Required after first login or admin reset                            |
| `/health/live`            | Process liveness (`{ status: "ok" }`)                                |
| `/health/ready`           | Database readiness (`503` if `SELECT 1` fails)                       |
| `/`                       | Dashboard                                                            |
| `/balances`               | On-hand balances                                                     |
| `/scan`                   | Barcode / QR quick action (SKU or barcode; store picker when needed) |
| `/stock-in/new`           | Post stock receipt                                                   |
| `/issues/new`             | Post bus issue (open job card required)                              |
| `/returns/bus`            | Post bus return (open job card required)                             |
| `/returns`                | Reverse a posted document                                            |
| `/receipts/:id`           | Posted document detail (from reports, purchases, and audit)          |
| `/job-cards`              | Job card list                                                        |
| `/job-cards/new`          | Open a job card                                                      |
| `/job-cards/:id`          | Job card detail (issue, tyre, oil, close, print)                     |
| `/tyres`                  | Tyre serial register                                                 |
| `/tyres/dag`              | DAG send / receive                                                   |
| `/tires/conversion`       | Admin bulk tire SKU conversion                                       |
| `/purchases`              | Local purchase list                                                  |
| `/purchases/new`          | Post local purchase + receipt                                        |
| `/alerts/low-stock`       | Below reorder level                                                  |
| `/parts`                  | Parts catalogue                                                      |
| `/parts/print-labels`     | QR labels (select which parts to print)                              |
| `/categories`             | Part categories                                                      |
| `/buses`                  | Fleet                                                                |
| `/buses/:id`              | Bus history (job cards, tyres, oil)                                  |
| `/suppliers`              | Suppliers                                                            |
| `/reports/movements`      | Movement history (`?posted=` / `?purchase=` filters)                 |
| `/reports/daily-movement` | Daily activity                                                       |
| `/reports/fast-moving`    | Fast-moving parts                                                    |
| `/reports/bus-usage`      | Usage by bus                                                         |
| `/reports/purchases`      | Purchase report                                                      |
| `/admin/users`            | Users and store assignments                                          |
| `/admin/stores`           | Stores                                                               |
| `/admin/reorder`          | Reorder levels                                                       |
| `/admin/corrections`      | Adjustments and reversals                                            |
| `/admin/audit`            | Audit event log                                                      |

Admin routes are wrapped by `app/routes/admin.tsx` and call `requireAdmin`.

---

## Project layout

```text
app/
  components/          Shared UI
  config/              Env validation (server)
  db/                  Drizzle client + schema
  features/            Inventory, master-data, dashboard, workshop (*.server.ts)
  lib/                 Auth, CSRF
  routes/              Route modules
  routes.ts            Route table
  root.tsx             HTML shell
  app.css              Global styles
database/
  migrations/          Custom invariant SQL
  migrations/generated Drizzle-generated SQL
  scripts/             migrate, bootstrap-admin, reconcile
  seeds/               Development seed
e2e/                   Playwright
tests/
  unit/
  integration/
compose.yaml           Local PostgreSQL 17
Dockerfile             Multi-stage Node 24 + pnpm production image
netlify.toml           Netlify build (publish build/client)
```

---

## Database and migrations

`pnpm db:migrate` applies SQL from both:

1. `database/migrations/generated` (Drizzle)
2. `database/migrations` (hand-written triggers and constraints)

Files are applied in sorted filename order. Applied files are recorded in `app_migrations`.

After you change schema TypeScript:

```powershell
pnpm db:generate
pnpm db:migrate
```

Put trigger or constraint SQL that Drizzle cannot express in a new file under `database/migrations/`.

**Main schema groups**

- **Auth** — `stores`, `users`, `user_store_assignments`, `sessions`
- **Master data** — `part_categories`, `parts`, `store_part_settings`, `buses`, `suppliers`
- **Inventory** — `stock_documents`, `stock_document_lines`, `stock_movements`, `inventory_balances`, `document_sequences`
- **Purchases** — `local_purchases`, `local_purchase_lines` (linked to a receipt document)
- **Audit** — `audit_events`

---

## Testing

| Suite       | Command                 | What it covers                                                                                                                                       |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `pnpm test`             | Password hashing, inventory command/schema, scan matching, audit detail text, movement query-param filters, action error mapping, master-data errors |
| Integration | `pnpm test:integration` | Posting path against the database                                                                                                                    |
| E2E         | `pnpm test:e2e`         | Admin login → forced password change → dashboard                                                                                                     |
| Full gate   | `pnpm verify`           | Format, lint, types, tests, production build                                                                                                         |

Playwright defaults to `http://localhost:5178`. Point it at another server with `E2E_BASE_URL`.

After inventory logic changes, run unit tests and consider `pnpm db:reconcile` on a seeded database.

---

## Production

### First admin (empty database)

After migrations, when **no Admin** exists:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "a-secure-temporary-password"
pnpm db:bootstrap-admin -- --email admin@example.com --name "System Administrator"
```

The password must be at least 12 characters. The user must change it at first login. The script refuses to run if an Admin already exists.

Do **not** run `pnpm db:seed` in production.

### Docker image

```powershell
docker build -t store-management .
```

The image is multi-stage (Node 24 Alpine, pnpm 11.15.1). It copies the production `node_modules` and `build/`, then runs `pnpm start`. Provide `DATABASE_URL`, `SESSION_COOKIE_SECRET`, `APP_ORIGIN`, and the other env vars at runtime. Run migrations as a separate job before the first start.

### Netlify

`netlify.toml` builds with `pnpm run build` and publishes `build/client`. The React Router Netlify plugin serves the SSR handler. Set the same server env vars in the Netlify site settings. `APP_ORIGIN` should be the public site URL; CSRF also accepts the live request origin so deploy previews work.

---

## Health checks

| Endpoint            | Meaning                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `GET /health/live`  | Process is up. Always `{ "status": "ok" }`.                                                  |
| `GET /health/ready` | Database accepts `SELECT 1`. `{ "status": "ready" }` or `503` `{ "status": "unavailable" }`. |

Use `/health/live` for liveness and `/health/ready` for readiness / load-balancer checks.

---

## Development conventions

- Keep database and auth in `*.server.ts`. Routes stay thin.
- Scope every inventory read and write to the actor’s authorized stores.
- Prefer form posts with CSRF for mutations.
- Do not edit posted stock rows; add a compensating movement.
- Quantities and money: Zod + decimal.js, never raw floating-point arithmetic.
- After inventory changes: unit tests, and `pnpm db:reconcile` on a seeded DB when the ledger or balance cache is involved.
