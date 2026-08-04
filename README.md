# Auth & User Management — Frontend

SvelteKit 5 SPA (client-rendered, static-adapter build) containing the
authentication and user/role-management screens extracted from the LSIS v4
frontend. Talks to the [`../backend`](../backend) Laravel API.

## Stack

- SvelteKit 2 / Svelte 5 (runes), TypeScript
- Tailwind CSS 4 + DaisyUI 5
- `@sveltejs/adapter-static` — builds to a static SPA (`fallback: index.html`), no Node server required to serve it
- Plain `fetch`-based API client with automatic JWT refresh (`src/lib/api/client.js`)

Note: this is a **web-only** extraction. The source project also ships a
Capacitor wrapper (`android/`, `ios/`, `capacitor.config.ts`) for a mobile
build — that packaging was left out here since it's orthogonal to the
auth/user-management functionality. `src/lib/platform.svelte.js` still does
runtime `window.Capacitor` detection and degrades to `web` cleanly if you
don't add Capacitor back.

## Setup

```bash
npm install
cp .env.example .env   # PUBLIC_API_URL defaults to http://localhost:8000/api
npm run dev
```

Requires the backend running (see `../backend/README.md`) with at least one
seeded user to log in with.

## Structure

- `src/lib/api/` — `client.js` (fetch wrapper, token storage, auto-refresh),
  `auth.js`, `users.js`, `audit-logs.js`, `lis-dashboard.js`
- `src/lib/stores/auth.svelte.js` — auth/session state, role → menu/dashboard
  mapping, permission helpers (runes-based store)
- `src/routes/login/` — login + 2FA OTP challenge
- `src/routes/admin/+layout.svelte` — authenticated shell (sidebar, forced
  password-change gate, role-based nav) shared by all admin pages
- `src/routes/admin/profile/` — self-service profile, password change, 2FA enable/disable
- `src/routes/admin/super-admin/` — Super Admin dashboard, user management, audit logs
- `src/routes/admin/lis/` — Legal Information System Administrator (division-scoped) dashboard, user management, audit logs
- `src/routes/admin/dashboard/` — generic landing dashboard shown to roles without a dedicated one

## Notes on this extraction

- The auth store (`auth.svelte.js`) keeps its role/menu/permission tables for
  all five backend roles — including `Legal Services Administrator`, `Child
  Protection Coordinator`, and `School Site Titling Coordinator` — even
  though this frontend only ships pages for `Super Admin` and `Legal
  Information System Administrator`. That's intentional, mirroring the
  backend's `RoleService`: those other roles can still log in, but their
  dashboards point at routes this module doesn't include. Add the
  corresponding case-management/child-protection/site-titling frontend
  modules alongside this one if you need them.
- The Capacitor splash-screen hook was removed from the root layout since it
  dynamically imports `@capacitor/splash-screen`, which isn't installed here.
