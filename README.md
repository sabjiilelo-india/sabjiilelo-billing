# Thermal Billing

Next.js (App Router) + Prisma + PostgreSQL billing app with 58/80mm thermal receipts.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `ADMIN_USERNAME`, `ADMIN_PASSWORD` (8+ chars).
3. `npx prisma migrate dev --name init` (creates tables)
4. `npm run seed` (creates the admin and default settings)
5. `npm run dev`, then open http://localhost:3000

## Scripts

- `npm test` runs unit tests (calculation engine, CSV)
- `npm run build` / `npm start` for production
- On Render: `render.yaml` provisions the web service and Postgres; run `npm run seed` once from the Render shell.

## Notes

- Money is stored as integer paise. The server recomputes every total; the browser only previews.
- Invoice numbers come from an atomic counter row inside the bill transaction; `idempotencyKey` stops duplicate bills on double-click or retry.
- Voided bills are never deleted. Shop details are snapshotted on every bill.
- Bill-level discount is applied after line tax (see `src/lib/calc.ts`).
