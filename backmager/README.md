# Mini-Program Admin Backend (`backmager`)

This service provides an operations dashboard (API layer) for the graduation thesis mini-program. It mirrors the `backend-code` structure to simplify maintenance while isolating administrative features such as user management, payment review, document audit, and notification broadcasting.

## Features

- Admin authentication with JWT tokens and role-based guards
- Dashboard metrics for users, orders, revenue, and AI usage
- User directory with credit history, document snapshots, and status controls
- Manual credit adjustments with audit logging
- Order and payment order review (WeChat Pay reconciliation)
- Document catalog search and detail review
- Notification broadcasting to end users
- System health and environment inspection endpoints

## Project Structure

```
backmager/
├── app.js                # Express application wiring
├── server.js             # Service bootstrap entrypoint
├── package.json          # Dependencies and scripts
├── .eslintrc.json        # ESLint configuration
├── env.sample            # Environment variable template
├── config/               # Database and shared configuration helpers
├── controllers/          # HTTP controller layer
├── middleware/           # Shared Express middleware
├── repositories/         # MySQL queries and persistence helpers
├── routes/               # Route definitions grouped by domain
├── services/             # Business logic modules
├── utils/                # Utility helpers (logger, tokens, pagination)
├── validators/           # Express-validator schemas
├── docs/                 # Additional documentation (roadmaps, SQL snippets)
├── scripts/              # Maintenance and seeding scripts (placeholder)
└── logs/                 # Runtime logs (gitignored)
```

## Getting Started

1. Copy `env.sample` to `.env` and fill in the real values.
2. Install dependencies:

```bash
npm install
```

3. Run the service locally:

```bash
npm run dev
```

The API listens on port `4100` by default. All endpoints are namespaced under `/api/admin`.

## Core Endpoints

- `POST /api/admin/auth/login` — Admin sign-in
- `GET /api/admin/dashboard/overview` — High-level metrics
- `GET /api/admin/users` — Paginated user list
- `PATCH /api/admin/users/:id/status` — Enable/disable user
- `POST /api/admin/users/:id/credits/adjust` — Manually adjust user credits
- `GET /api/admin/users/:id/credits/transactions` — Paged credit transaction history
- `GET /api/admin/orders` / `GET /api/admin/payments` — Financial review
- `GET /api/admin/documents` — Document listings
- `POST /api/admin/notifications` — Send system notifications
- `GET /api/admin/system/info` — Environment diagnostics

Refer to `docs/` for extended usage notes and suggested UI wiring.

## Database Requirements

The admin backend relies on the same MySQL schema as the main service plus an additional `admin_users` table. A sample migration script is provided in `docs/admin_users.sql`.

## Linting & Formatting

```bash
npm run lint
```

## Deployment Notes

- Ensure the admin service runs behind HTTPS (reverse proxy or cloud load balancer)
- Configure `ADMIN_CORS_ORIGINS` with the admin web console origin(s)
- Use a dedicated `ADMIN_JWT_SECRET` distinct from the user-facing backend
- Run with least-privileged database credentials limited to the required tables

## Next Steps

- Build a corresponding admin front-end (e.g., React/Ant Design) targeting these APIs
- Extend `scripts/` with seeding utilities (e.g., create initial super admin)
- Integrate audit logging and operation history for compliance

