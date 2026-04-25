# Farely Admin Integration Architecture

This document explains the current `farely-admin` architecture and how it should integrate with the main Farely app/backend.

## 1) What this application does

`farely-admin` is the admin operations system for Farely. It is used by internal teams (ops/support/analysts) to:

- monitor ride funnel metrics (searches, handoffs, confirmations),
- inspect ride-level logs,
- monitor demand/supply hotspots by area,
- manage customer support threads and replies,
- track support delivery lifecycle via Brevo webhooks.

It is not a rider-facing app. It is an internal admin dashboard and API service.

## 2) Repository structure (separation of concerns)

- `frontend/` -> React + Vite + TypeScript admin UI.
- `backend/` -> Express + TypeScript admin API, ingest, webhooks, reliability endpoints.
- root `package.json` -> orchestration scripts (`dev:frontend`, `dev:backend`, `lint`).

## 3) Frontend architecture (`frontend/`)

Key folders:

- `frontend/src/pages` -> product pages (`/dashboard`, `/rides/logs`, `/rides/hotspots`, `/support/inbox`).
- `frontend/src/components` -> shared UI and layout shell.
- `frontend/src/hooks/useAuth.tsx` -> admin auth state (currently mock token storage).
- `frontend/src/api/mocks.ts` -> contract-aligned API adapter (currently local mock data).
- `frontend/src/types/dtos.ts` -> strict v1 DTO contracts/enums.

Frontend currently uses TanStack Query and reads from mock adapters.  
Integration step: replace mock adapter internals with real HTTP calls to admin backend.

## 4) Backend architecture (`backend/`)

Primary files:

- `backend/src/server.ts` -> service bootstrap, route mounting, worker timers.
- `backend/src/admin-api.ts` -> `/admin/*` endpoint handlers.
- `backend/src/webhooks.ts` -> `/webhooks/brevo/*` handlers.
- `backend/src/ingest.ts` -> event outbox ingest worker (app_db -> admin_db read models).
- `backend/src/aggregations.ts` -> hotspot/traffic aggregate jobs.
- `backend/src/reliability.ts` -> health/reconcile operational endpoints.
- `backend/src/store.ts` -> in-memory placeholders modeling `app_db` and `admin_db`.

Current backend is scaffold-level (in-memory state).  
Integration step: connect these modules to real Mongo collections/services.

## 5) Contract model (already aligned to v1)

Admin API contracts implemented in DTO shape:

- Auth:
  - `POST /admin/auth/login`
  - `POST /admin/auth/refresh`
  - `POST /admin/auth/logout`
- Metrics:
  - `GET /admin/metrics/traffic`
  - `GET /admin/metrics/hotspots`
- Rides:
  - `GET /admin/rides/logs` (cursor-based)
- Support:
  - `GET /admin/support/threads` (cursor-based)
  - `GET /admin/support/threads/:id/messages`
  - `POST /admin/support/threads/:id/reply`
  - `PATCH /admin/support/threads/:id`
- Brevo:
  - `POST /webhooks/brevo/inbound`
  - `POST /webhooks/brevo/events`

Envelope convention:

- success: `{ "success": true, "data": ... }`
- error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

## 6) Data ownership and DB split

Target model:

- `app_db` (main Farely app source of truth):
  - rider auth/users
  - ride events/mutations
  - in-app support submissions
- `admin_db` (admin read models):
  - admin users/sessions/audit
  - denormalized support inbox views/messages
  - traffic/hotspot aggregates
  - ingest state/dead-letter/reconcile metadata

## 7) Integration data flow with main Farely app

1. Farely app backend writes business events to `app_db` + outbox.
2. Admin ingest worker polls outbox and upserts into `admin_db` snapshots.
3. Aggregation jobs compute chart/hotspot materialized views.
4. Admin frontend queries admin backend endpoints.
5. Admin replies go via Brevo; inbound/events webhooks update support timeline.

## 8) Operational model

Recommended deployment:

- Admin frontend hosted separately (static app).
- Admin backend as separate Node service.
- Shared auth/trust boundary via Bearer tokens and RBAC.

Suggested domains:

- `admin.farely.app` (frontend)
- `admin-api.farely.app` (backend)

## 9) Integration checklist (for your planning)

When integrating with the main Farely app, plan for:

1. Replace `backend/src/store.ts` in-memory data with real Mongo repositories.
2. Add outbox writes in main Farely write paths for required event types.
3. Connect `backend/src/ingest.ts` to app outbox collection and idempotency tracking.
4. Wire `backend/src/aggregations.ts` to scheduled jobs (hourly/daily).
5. Replace `frontend/src/api/mocks.ts` internals with real API client calls.
6. Add token refresh flow and secure admin session storage policy.
7. Configure Brevo signature verification and correlation metadata.
8. Add monitoring/alerts for ingest lag, dead-letter volume, webhook failures.

## 10) Run commands

From repo root:

- `npm run dev:frontend`
- `npm run dev:backend`
- `npm run lint`

From service directories:

- `frontend`: `npm run dev`
- `backend`: `npm run dev`

