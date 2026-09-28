# ADR 0001 – Tech stack and tooling

Status: Accepted (Sept 2026) — auth, storage and hosting superseded by ADR 0002

## Decisions
1. **Monorepo:** pnpm workspaces + Turborepo – fast installs, shared TS packages, cached builds.
2. **ORM:** Prisma – typed client, simple migrations (`prisma migrate`), good fit for multi-tenant `organization_id` filters.
3. **Auth:** Self-built in NestJS (JWT access 15 min + refresh 7–30 days, rotated, stored hashed). Passwords hashed with argon2id. Revisit a managed IdP when SSO for institutions is needed.
4. **Tenancy:** Single database, shared schema, `organization_id` on every org-owned table, enforced in a backend guard/service layer (optionally Postgres RLS later).
5. **Validation:** Zod schemas shared between web and API.
6. **Local dev:** Docker Compose for Postgres, Redis, MinIO, Mailpit (email testing).
7. **Environments:** local → staging → production from the start; secrets only in env vars.

## Consequences
- Everyone needs Node 20+, pnpm, Docker and Git.
- Advanced AI/IoT services are separate later additions and must not block V1.
