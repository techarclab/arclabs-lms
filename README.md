# ARC LABS LMS & AIoT Learning Platform

Monorepo for the ARC LABS learning platform (V1 = LMS).

## Stack (decided in Step 1)
| Area | Choice |
|---|---|
| Package manager / monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router) + React + TypeScript |
| API | NestJS + TypeScript, REST `/api/v1`, OpenAPI/Swagger |
| ORM / migrations | Prisma |
| Database | PostgreSQL 16 — hosted on Google Cloud SQL (via Firebase SQL Connect); Docker Postgres locally |
| Cache / queues | Redis 7 + BullMQ |
| Object storage | Firebase Storage (Firebase Emulator locally) |
| Auth | Firebase Authentication (email/password, Google); NestJS verifies Firebase ID tokens; roles/orgs stored in Postgres |
| Validation | Zod (shared in `packages/validation`) |
| Tests | Vitest/Jest (unit), Supertest (API integration), Playwright (E2E later) |
| CI | GitHub Actions |
| Notifications | Email via queue worker + Firebase Cloud Messaging (push) |
| Hosting | Firebase App Hosting (web), Cloud Run (API + worker) |
| Local infra | Docker Compose (Postgres, Redis, Mailpit) + Firebase Emulator Suite |

## Planned layout
```
apps/      web/  api/  worker/
packages/  ui/  types/  config/  validation/
infra/     docker/  deployment/
docs/      prd/  api/  architecture/  decisions/
```

## Roadmap
- Step 1 – Setup decisions  ✅
- Step 2 – Phase 0 specs (ERD, RBAC matrix, API contract, wireframes)
- Step 3 – Monorepo scaffold
- Step 4 – Phase 1: Auth, RBAC, organizations, users, courses
- Step 5 – Phases 2–4
