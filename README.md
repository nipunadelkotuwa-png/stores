# DS Gunasekara Group Store Management System

Multi-location bus spare-parts inventory website built with React Router Framework Mode, TypeScript, PostgreSQL, and Drizzle ORM.

## Features

- Admin and location-scoped Operator roles
- Spare parts, buses, suppliers, stores, users, and store assignments
- Audited stock receipts and bus issues
- Strict negative-stock prevention
- Current balances and immutable movement history
- Local purchases with linked stock receipts
- Low-stock alerts and bus-wise usage reports

## Local setup

Requirements: Node.js 24+, pnpm 11+, and Docker.

```powershell
Copy-Item .env.example .env
# Replace SESSION_COOKIE_SECRET with at least 32 random characters.
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:5173`. The development seed creates `admin@dsgunasekara.local`; its password defaults to `ChangeMe123!` or `DEV_ADMIN_PASSWORD` when set. The user must change it at first login. Seed also creates sample spare parts and reorder levels for Colombo and Kandy.

## External PostgreSQL

Do not start the Compose database. Set `DATABASE_URL` to the external PostgreSQL connection string, then run:

```powershell
pnpm db:migrate
pnpm dev
```

## Production Admin bootstrap

After migrations, when no Admin exists:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "a-secure-temporary-password"
pnpm db:bootstrap-admin -- --email admin@example.com --name "System Administrator"
```

## Commands

```text
pnpm dev                 Development server
pnpm build               Production build
pnpm start               Serve production build
pnpm typecheck           React Router type generation and TypeScript
pnpm lint                ESLint
pnpm format:check        Prettier verification
pnpm test                Unit tests
pnpm test -- password    Run a matching test file/name
pnpm db:generate         Generate Drizzle schema migration
pnpm db:migrate          Apply generated and custom SQL migrations
pnpm db:seed             Seed local development data
pnpm db:reconcile        Compare balance cache to movement ledger
```

## Inventory integrity

Posted stock documents and movements are append-only. Stock issues run inside serializable database transactions and cannot reduce a part/store balance below zero. Corrections must use adjustment or reversal movements instead of editing posted history.
