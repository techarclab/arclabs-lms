# ARC LABS LMS & AIoT Learning Platform

Monorepo for the ARC LABS learning platform (V1 = LMS).

## Stack (decided in Step 1)

| Area                       | Choice                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Package manager / monorepo | pnpm workspaces + Turborepo                                                                                         |
| Runtime                    | Node.js 24                                                                                                          |
| Web                        | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + TypeScript                                                    |
| API                        | NestJS 12 + TypeScript, REST `/api/v1`, OpenAPI/Swagger                                                             |
| ORM / migrations           | Prisma 7 (driver adapter `@prisma/adapter-pg`)                                                                      |
| Database                   | PostgreSQL 16 — Docker locally; managed provider (Cloud SQL, Neon, Supabase…) chosen before staging                 |
| Cache / queues             | Redis 7 + BullMQ                                                                                                    |
| Object storage             | S3-compatible: Cloudflare R2 in production, MinIO locally (ADR 0003)                                                |
| Auth                       | Firebase Authentication (email/password, Google); NestJS verifies Firebase ID tokens; roles/orgs stored in Postgres |
| Validation                 | Zod (shared in `packages/validation`)                                                                               |
| Tests                      | Vitest (unit + API integration via Supertest), Playwright (E2E later)                                               |
| CI                         | GitHub Actions                                                                                                      |
| Notifications              | Email via queue worker + Firebase Cloud Messaging (push)                                                            |
| Hosting                    | To be decided before staging (Firebase App Hosting + Cloud Run need Blaze; free-tier alternatives will be compared) |
| Local infra                | Docker Compose (Postgres, Redis, MinIO, Mailpit) + Firebase Auth emulator                                           |

**Getting started:** see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Layout

```
apps/      web/  api/  worker/
packages/  ui/  types/  config/  validation/
infra/     docker/  deployment/
docs/      prd/  api/  architecture/  decisions/
```

## Roadmap

- Step 1 – Setup decisions ✅
- Step 2 – Phase 0 specs: ERD ✅, RBAC matrix ✅, API contract (code-first via Swagger), wireframes
- Step 3 – Monorepo scaffold ✅
- Step 4 – Phase 1: Auth, RBAC, organizations, users, courses
- Step 5 – Phases 2–4
