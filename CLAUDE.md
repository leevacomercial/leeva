# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Leeva is a logistics SaaS for restaurants (not a food marketplace): orders arrive from the restaurant's own channels, Leeva auto-dispatches one of the restaurant's OWN couriers and tracks the delivery. **Model (since 2026-10-11): monthly fee only, own fleet only. There is no Leeva courier network, no credits, no per-delivery margin, no courier wallet/payouts, no open courier signup** — that code was removed (old tables stay in the DB as history; migration 0053 forces `fleet_mode='own'`). Billing is manual: the admin marks a subscription as paid in Clientes. See the 10/10 and 11/10 entries in `docs/DECISOES-NOTURNAS.md`. Dispatch is automatic; the owner can override from Ao vivo ("Mandar pra…"). All user-facing copy is PT-BR. The owner is not a programmer — explain outcomes in plain Portuguese, decide details yourself, and do not push technical choices onto them.

## Commands

npm workspaces + Turborepo, run from the repo root (Node >= 20, see `.nvmrc`).

```bash
npm install
npm run dev                     # all apps; or dev:restaurante (3000) / dev:motoboy (3001) / dev:admin (3002)
npm run typecheck               # turbo, all workspaces
npm run lint
npm run build
npm test                        # only packages/shared has unit tests
```

- Single unit test: `cd packages/shared && npx tsx --test src/__tests__/payout.test.ts`
- Typecheck one app: `cd apps/motoboy && npx tsc --noEmit` (run it after touching `packages/shared`, all four apps consume it as source — there is no build step for `@leeva/shared`).
- Integration/E2E scripts hit a **real Supabase** using `apps/restaurante/.env.local`: `npm run test:integration`, `test:fase4`, `test:fase5`, `test:asaas`, etc. (see root `package.json`; each is `scripts/test-*.mjs`). `seed*` scripts are development-only.
- `apps/motoboy-app` (Expo): `npm run typecheck` and `npm test` inside that folder. Read `apps/motoboy-app/AGENTS.md` first — Expo SDK 57 differs from what you remember; check https://docs.expo.dev/versions/v57.0.0/.

## Architecture

Layering rule (docs/ARCHITECTURE.md): UI components never write to the DB or hold business rules; they call `apps/*/app/api/**/route.ts`, which authenticates, authorizes and calls a **service** in `packages/shared/src/services/**`. Services take a `SupabaseClient<Database>` as a parameter (no globals), so they run identically in API routes, cron jobs and `scripts/`.

Four deployable apps + one shared package:

- `apps/restaurante` (Next 15, :3000) — restaurant panel. **Also hosts all `/api/cron/*` routes** (dispatch-tick, health-check, ifood-poll, cleanup), protected by `CRON_SECRET` and triggered by `pg_cron`/`pg_net` from Supabase, plus the iFood webhook.
- `apps/motoboy` (Next 15, :3001) — courier **PWA and the API backend for the native app**. Its `app/api/**` routes accept either the session cookie or `Authorization: Bearer <supabase token>` via `getMotoboyContextFromReq` (`lib/context.ts`).
- `apps/admin` (Next 15, :3002) — platform operator panel (Clientes/assinaturas, operação, motoboys de todos os clientes, planos); access checked against `platform_admins` in the backend.
- `apps/motoboy-app` (Expo / React Native, package `br.com.leeva.motoboy`) — **fully native screens, not a WebView wrapper.** It talks to `apps/motoboy`'s API. Consequence: changes to `apps/motoboy` pages (PWA UI) do **not** change the installed APK; only its API routes are shared. UI changes in the app need a new APK.
- `packages/shared` (`@leeva/shared`) — types, services, integrations. Import via subpaths (`@leeva/shared/services`, `/server`, `/client`, `/integrations`).

Domain flow in `packages/shared/src/services`:
- **Dispatch**: `autodispatch.ts` (`scoreCandidatesForOrder`, `runDispatchTick`) scores the restaurant's own active couriers (ETA to pickup, route impact, load, reliability, history, rating; weights overridable per restaurant in `logistics_config.dispatch_weights`), offers to the best, retries on refusal/timeout (40 s cooldown), else alerts "no courier". With `logistics_config.shifts_enforced`, couriers without a shift covering "now" (`driver_shifts`, `shifts.ts`) get the blocker "fora da escala". Restaurant favorite/blocked couriers come from `driver-prefs.ts`. `grouping-dispatch.ts` bundles nearby stops. Manual override: `assignDriver` via `/api/orders/[id]/dispatch` (Ao vivo → "Mandar pra…").
- **Shifts (Escalas)**: `shifts.ts` + migration 0052 — dated shifts per courier (max 16 h, no overlap per courier), "repeat this week next week", courier sees own shifts (`/api/shifts` in apps/motoboy, card in PWA and native app).
- **Money**: Leeva never touches delivery money. `payout.ts` computes what the restaurant owes each courier (`payout_policies`: per-km, minimum, grouped rate — the restaurant sets it in Configurações) and the customer fee table; `getOwnFleetSettlement` (finance.ts) is the courier settlement in /financeiro. `customer_fee`/`leeva_fee` on orders stay 0. Subscriptions: `billing.ts` (`applySubscriptionAction`: mark_paid / past_due / cancel / extend_trial / change_plan). Changing plan never changes status — only "mark paid" activates.
- **Courier lifecycle**: the restaurant creates the courier in Motoboys (`/api/team`) and sends the WhatsApp invite; the courier activates at `apps/motoboy/ativar`. `drivers.ts` keeps terms acceptance and `checkDriverGate` (single server-side rule for going online). Dispatch filters on `approval_status='approved'` (default for own couriers) and `terms_accepted_version >= active`.
- **Orders**: `orders.ts` + `ALLOWED_ORDER_TRANSITIONS` in `constants.ts`; status changes emit `order_events` through a DB trigger (don't emit them again in code). iFood orders (`source='ifood'`) close with the iFood locator instead of the Leeva 4-digit code (`delivery-proof.ts`).
- **Push**: `push.ts` sends Expo push to the native app (FCM v1 credentials live in Expo, not the repo) and Web Push to the PWA.

## Database

- Schema lives only in `supabase/migrations/NNNN_*.sql`. They are **applied by hand in the Supabase SQL Editor** (there is no migration runner in CI); after adding one, tell the owner to run it and keep numbering sequential.
- `packages/shared/src/types/database.ts` is the typed schema. Any new table/column must be added there by hand (or regenerated with `npm run db:types`) or `tsc` fails on `db.from('new_table')`.
- Multi-tenant RLS keyed on `current_restaurant_id()`. `order_messages` is written only through API routes (service role) but readable by the order's team/courier so the chat updates via Realtime (0050).
- Storage buckets `driver-documents` and `delivery-proof` are private; access is via short-lived signed URLs (`signDoc`).

## Realtime, not polling (Vercel cost)

Polling Vercel every few seconds per courier is what blew the Vercel plan. Live data goes through Supabase Realtime: courier GPS is written straight to Supabase with the `record_my_location` RPC (0050; returns `nearby`, and only then the client calls `/api/location` once per order for the "chegando" notice); the restaurant panel listens with `useLiveOps` (`@leeva/shared/hooks`); chats/offers subscribe to their tables. Any interval left is a 20–60 s safety net, visible-tab only. `/api/*` is excluded from the middleware matcher (routes authenticate themselves). Don't add new short polling loops.

## Deploy and operations

- Pushing to `main` auto-deploys three Vercel projects (`leeva-restaurante`, `leeva-motoboy`, `leeva-admin`). The APK is built separately (no EAS quota: local Gradle build on Windows with a portable JDK + Android SDK; see `apps/motoboy-app/PRONTO-PARA-BUILD.md` for the EAS route) and served as a static file from the small `leeva-apk` Vercel project.
- Server env vars are per Vercel project (`vercel env ls production` inside each `apps/*`). The owner enters secrets themselves; sensitive values can't be read back from Vercel. (Asaas is no longer used.)
- Docs worth opening: `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `docs/LOGISTICS.md`, `docs/BILLING.md`, `docs/INTEGRATIONS.md`, `docs/DECISOES-NOTURNAS.md` (running decision log).

## Working conventions

- GitHub push protection is on: never commit tokens or `.env*`. Stage explicit paths (`git add <files>`), never `git add -A` — the tree often holds untracked scratch files (e.g. `apps/restaurante/scratch/`).
- Never read or print secret values.
- Windows shell: use Git Bash or PowerShell; `python3` hangs; Node needs `C:/...` paths; write multi-line edits to a scratch script instead of `node -e`.
- The free OpenStreetMap tile server (`tile.openstreetmap.org`) blocks this app ("Access blocked"). The restaurant map (`OsmMapProvider` + restaurant `LeevaMap.tsx`) now uses CARTO tiles; OSM is still hard-coded in `apps/motoboy-app/src/components/{LiveMapMini,RouteMapMini,MapaEntrega}.tsx`, `apps/motoboy/app/(app)/_lib/RouteMap.tsx`, and the admin `LeevaMap.tsx`; replace with a keyed provider (routing already supports `MAPBOX_TOKEN`; a browser-safe public `pk.` token would be needed for tiles) rather than adding more headers — `LiveMapMini` already sends User-Agent/Referer and is still blocked.
