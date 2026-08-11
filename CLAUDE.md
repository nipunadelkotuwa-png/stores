# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
pnpm install                 # Install dependencies (pnpm@11)
pnpm dev                     # React Router SSR dev server → http://localhost:5173
pnpm build                   # Production build
pnpm start                   # Serve built app (react-router-serve)
pnpm typecheck               # react-router typegen + tsc --noEmit
pnpm lint                    # ESLint
pnpm format                  # Prettier write
pnpm format:check            # Prettier check
pnpm test                    # Vitest unit/integration (run once)
pnpm test:watch              # Vitest watch mode
pnpm test -- password        # Run tests matching a file/name pattern
pnpm test:integration        # Vitest tests under tests/integration
pnpm test:e2e                # Playwright (e2e/; default baseURL http://localhost:5178)
pnpm verify                  # format:check + lint + typecheck + test + build
pnpm db:generate             # Drizzle kit → database/migrations/generated
pnpm db:migrate              # Apply generated + custom SQL migrations
pnpm db:seed                 # Development seed data
pnpm db:bootstrap-admin      # Create first Admin when none exists
pnpm db:reconcile            # Compare inventory_balances to movement ledger
```

Local DB (Docker):

```powershell
Copy-Item .env.example .env   # set SESSION_COOKIE_SECRET ≥ 32 chars
docker compose up -d db
$env:DATABASE_URL = "postgresql://store_user:store_password@localhost:5432/store_management"
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Seed admin: `admin@dsgunasekara.local` / `ChangeMe123!` (or `DEV_ADMIN_PASSWORD`); forced password change on first login. Seed also creates sample parts and per-store reorder levels.

Env is read by `app/config/env.server.ts` from process env only: `DATABASE_URL`, `SESSION_COOKIE_SECRET`, `APP_ORIGIN`, `APP_TIME_ZONE`, `LOG_LEVEL`, `TRUST_PROXY`. Do not use `VITE_*` for secrets.

## Architecture

Multi-location bus spare-parts inventory for DS Gunasekara Group. Stack: **React Router 8 Framework Mode (SSR)**, TypeScript, PostgreSQL, Drizzle ORM, Zod, decimal.js, argon2 sessions, Tailwind 4.

### Layout

| Area                              | Role                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `app/routes.ts`                   | Route table (auth, health, app layout, admin)                                  |
| `app/routes/*`                    | Route modules: loaders (reads), actions (mutations), UI                        |
| `app/features/*`                  | Domain logic in `*.server.ts` (inventory, master-data, dashboard)              |
| `app/db/schema/*`                 | Drizzle tables by domain: auth, master-data, inventory, purchases, audit       |
| `app/db/client.server.ts`         | Shared `pg` Pool + Drizzle client                                              |
| `app/lib/auth/*`                  | Session cookie, password hashing, `requireUser` / `requireAdmin` / store scope |
| `app/lib/csrf.server.ts`          | Origin + session CSRF checks for form posts                                    |
| `app/components/*`                | Shared UI (e.g. stock form)                                                    |
| `database/migrations/generated`   | Drizzle-generated SQL                                                          |
| `database/migrations/*.sql`       | Hand-written invariants (triggers, FKs)                                        |
| `database/scripts/*`              | migrate, seed helpers, bootstrap-admin, reconcile                              |
| `tests/unit`, `tests/integration` | Vitest                                                                         |
| `e2e/`                            | Playwright smoke                                                               |

Import alias: `~/*` → `app/*`. Server-only modules use the `.server.ts` suffix so client bundles never pull DB/auth secrets.

### Request flow

1. Layout/route `loader` calls `requireUser` / `requireAdmin` then feature query modules.
2. Mutations live in route `action`s → feature posting modules (e.g. `postStock`), not loaders.
3. Operators only see/act on stores from `user_store_assignments`. Admins: `getAuthorizedStoreIds` returns `null` (unrestricted). Use `requireStoreAccess` before stock ops.

### Auth model

- Roles: `ADMIN` | `OPERATOR` (`app/db/schema/auth.ts`).
- Cookie session (`ds_store_session`, 12h absolute TTL, hashed token in `sessions`).
- `mustChangePassword` redirects everything except `/change-password`.
- Admin-only UI/routes under `/admin/*` (layout-enforced): users, stores, reorder levels, corrections.

### Inventory integrity (non-negotiable)

- **Ledger**: `stock_movements` is append-only (signed `quantity_delta`, `balance_after`).
- **Cache**: `inventory_balances` keyed by `(store_id, part_id)` — must stay consistent with the ledger; `pnpm db:reconcile` checks that.
- **Documents**: `stock_documents` + lines; status `DRAFT` → `POSTED`. Document types: `STOCK_RECEIPT`, `BUS_ISSUE`, `ADJUSTMENT`, `REVERSAL`.
- **Adjustments**: admin-only; support `direction` increase or decrease (line quantity stays positive; delta is signed).
- **Idempotency**: unique on `(created_by, idempotency_key)` for stock documents.
- **No negative stock**: issues/decreases must not drive balances below zero (app + DB expectations).
- **No rewrite of history**: posted documents/lines, movements, and audit events are immutable via triggers in `database/migrations/0001_inventory_invariants.sql`. Fix mistakes with **adjustment or reversal** documents, never UPDATE/DELETE of posted rows.
- Quantities use `numeric` / `decimal.js`; validate inputs with Zod schemas in `app/features/inventory/schemas.ts`.

Core posting path: `app/features/inventory/posting.server.ts`. Queries: `app/features/inventory/queries.server.ts`.

### Migrations

`pnpm db:migrate` runs SQL from both `database/migrations/generated` and `database/migrations` (sorted filenames), tracking applied files in `app_migrations`. After schema TS changes: `pnpm db:generate`, then migrate. Put trigger/constraint SQL that Drizzle cannot express in custom migration files under `database/migrations/`.

### Domain entities

- Master data: stores, parts (+ categories, per-store reorder settings), buses, suppliers.
- Purchases: local purchases linked to stock receipts (`/purchases`, `/purchases/new`).
- Alerts: low-stock against `store_part_settings.reorder_level` (computed; no separate alerts table).
- Reports: movement history, bus-wise usage.

### Conventions when changing code

- Keep DB and auth in `*.server.ts`; routes stay thin.
- Scope every inventory read/write with the actor’s authorized stores.
- Prefer form posts with CSRF for mutations.
- Do not edit posted stock rows; add compensating movements.
- After inventory logic changes, run unit tests and consider `pnpm db:reconcile` against a seeded DB.
