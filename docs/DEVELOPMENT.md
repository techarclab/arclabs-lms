# Local development (Windows)

## Prerequisites (one-time)

Node 24 · pnpm · Git · Docker Desktop (WSL 2) · Java 21 · Firebase CLI — see README.

> Keep the project **outside OneDrive** (e.g. `C:\dev\arclabs-lms`), or pause OneDrive while working.
> OneDrive syncing `node_modules` causes locked files and very slow installs.

## First run

```powershell
cd C:\dev\arclabs-lms          # or your project folder
pnpm install                    # installs everything + generates the Prisma client
pnpm infra:up                   # Postgres, Redis, MinIO, Mailpit in Docker
pnpm db:migrate -- --name init  # creates the database tables (first time only)
pnpm db:seed                    # ARC LABS organization + a sample course
```

`.env` files for local development are already in place
(`apps/api/.env`, `apps/worker/.env`, `apps/web/.env.local`, copied from the `.env.example` files).

## Every day

Terminal 1 — Firebase Auth emulator (no real Firebase project needed locally):

```powershell
pnpm emulators
```

Terminal 2 — web + API + worker together:

```powershell
pnpm dev
```

| What                         | URL                                                    |
| ---------------------------- | ------------------------------------------------------ |
| Web app                      | http://localhost:3000                                  |
| API                          | http://localhost:4001/api/v1/health                    |
| API docs (Swagger)           | http://localhost:4001/api/docs                         |
| Firebase emulator UI (users) | http://localhost:4000                                  |
| Mailpit (emails sent)        | http://localhost:8025                                  |
| MinIO console (files)        | http://localhost:9001 (arc_minio / arc_minio_password) |
| Database GUI                 | `pnpm db:studio`                                       |

**Become Super Admin:** sign up at http://localhost:3000/login with `admin@arclabs.local`
(set by `SUPER_ADMIN_EMAIL` in `apps/api/.env`).

## Useful commands

| Command                                       | Does                                          |
| --------------------------------------------- | --------------------------------------------- |
| `pnpm build` / `pnpm typecheck` / `pnpm test` | across all apps                               |
| `pnpm format`                                 | Prettier on the repo                          |
| `pnpm db:migrate -- --name <change>`          | after editing `apps/api/prisma/schema.prisma` |
| `pnpm infra:down`                             | stop Docker services (data is kept)           |

## Troubleshooting

- **`pnpm` / `firebase` not recognized** → add `%APPDATA%\npm` to your user PATH, reopen PowerShell.
- **`failed to connect to the docker API`** → open Docker Desktop and wait for "Engine running".
- **Port already in use** → another app uses 3000/4001/5432; stop it or change `PORT` in `.env`.
- **API says `USER_NOT_REGISTERED`** → the web app calls `/auth/sync` after sign-in; refresh the page.
