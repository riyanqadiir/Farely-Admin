# Farely Admin Monorepo

This repository is now split by concern:

- `frontend/`: React + Vite admin dashboard UI
- `backend/`: Express admin API, ingest workers, webhooks, and reliability endpoints

## Setup & Running

1. **Install frontend dependencies**
   ```bash
   npm --prefix frontend install
   ```

2. **Install backend dependencies**
   ```bash
   npm --prefix backend install
   ```

3. **Run frontend**
   ```bash
   npm run dev:frontend
   ```

4. **Run backend**
   ```bash
   npm run dev:backend
   ```

5. **Type-check both**
   ```bash
   npm run lint
   ```

## Key Technologies

- **React + Vite** for fast development.
- **TypeScript** for robust typing and API contracts.
- **Tailwind CSS** for a custom "Green-first" premium dashboard aesthetic.
- **TanStack Query** for server state management and caching.
- **Recharts** for performance analytics and traffic charts.
- **React Leaflet** for geographical demand visualization.
- **Lucide React** for consistent, modern iconography.
- **Motion/React** for fluid route transitions and interactive micro-animations.

## Project Structure

- `frontend/src/api`: Contract-aligned mock API adapters.
- `frontend/src/types`: TypeScript API contract DTOs.
- `frontend/src/pages`: Dashboard feature pages.
- `backend/src/admin-api.ts`: `/admin/*` endpoint handlers.
- `backend/src/ingest.ts`: outbox ingest worker logic.
- `backend/src/aggregations.ts`: hourly/daily aggregation jobs.
- `backend/src/webhooks.ts`: Brevo inbound/event webhooks.
- `backend/src/reliability.ts`: health/reconcile endpoints.

## Future Backend Integration

To replace frontend mocks with real backend calls:
1. Keep contract types in `frontend/src/types/dtos.ts` as the source of DTO truth.
2. Replace internals of `frontend/src/api/mocks.ts` with HTTP client calls to backend endpoints.
3. Point frontend environment config to deployed backend base URL.
