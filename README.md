# Learner Rights & Protection — Staff Admin Frontend

SvelteKit 5 SPA (client-rendered, static-adapter build) for DepEd Cordillera
Administrative Region's Learner Rights & Protection (child protection) case
management system. Talks to the [`../backend`](../backend) Laravel API. The
public, unauthenticated report-submission site lives in the separate
[`../learner-portal`](../learner-portal) app.

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
- `src/routes/admin/lrp/` — Learner Right Protection Focal Person: dashboard,
  intake sheets (the case record itself), learner reports (submissions from
  the public learner portal, triaged here and optionally turned into an
  intake sheet), and FAQ content management (regional-level accounts only —
  the same content the learner portal's public FAQ page reads)
- `src/routes/admin/dashboard/` — generic landing dashboard shown to roles without a dedicated one

## Notes

- The backend currently seeds three roles: `Super Admin`, `Division User
  Administrator`, and `Learner Right Protection Focal Person` (see
  `../backend/database/seeders/RoleSeeder.php`). The Focal Person role covers
  school/division/regional scope from a single role — resolved server-side
  from the account's own `school_id`/`division_id`, not by separate roles.
  `Legal Information System Administrator` has pages here but is not
  currently seeded in the backend.
- This app previously carried scaffolding for an "Administrative Cases /
  Certificates / Child Protection / Site Titling" module set inherited from
  an earlier template. It was removed (August 2026) since it had no backend
  implementation and this application's scope is Learner Rights & Protection
  only — see `auth.svelte.js` git history if you need to resurrect it.
- The Capacitor splash-screen hook was removed from the root layout since it
  dynamically imports `@capacitor/splash-screen`, which isn't installed here.
