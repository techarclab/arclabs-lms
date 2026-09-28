# Local development (Windows)

## Prerequisites (one-time)

Node 24 · pnpm · Git · Docker Desktop (WSL 2) · Java 21 · Firebase CLI — see README.

> Keep the project **outside OneDrive** (e.g. `C:\dev\arclabs-lms`), or pause OneDrive while working.
> OneDrive syncing `node_modules` causes locked files and very slow installs.

## First run

```powershell
cd C:\dev\arclabs-lms          # or your project folder
pnpm install                    # installs everything + generates the Prisma client
pnpm infra:up                   # Postgres, Redis, SeaweedFS (S3), Mailpit in Docker
pnpm db:migrate --name init     # creates the database tables (first time only)
pnpm db:seed                    # ARC LABS organization, sample course + 24 sample questions
```

`.env` files for local development are already in place
(`apps/api/.env`, `apps/worker/.env`, `apps/web/.env.local`, copied from the `.env.example` files).

## Every day

Terminal 1 — Firebase Auth emulator (no real Firebase project needed locally).
Accounts are saved to `infra/firebase/emulator-data` when you stop it with **Ctrl+C**:

```powershell
pnpm emulators
```

Terminal 2 — web + API + worker together:

```powershell
pnpm dev
```

| What                             | URL                                 |
| -------------------------------- | ----------------------------------- |
| Web app                          | http://localhost:3000               |
| API                              | http://localhost:4001/api/v1/health |
| API docs (Swagger)               | http://localhost:4001/api/docs      |
| Firebase emulator UI (users)     | http://localhost:4000               |
| Mailpit (emails sent)            | http://localhost:8025               |
| Stored files (SeaweedFS browser) | http://localhost:8888               |
| Database GUI                     | `pnpm db:studio`                    |

**Become Super Admin:** sign up at http://localhost:3000/login with `admin@arclabs.local`
(set by `SUPER_ADMIN_EMAIL` in `apps/api/.env`).

## Useful commands

| Command                                       | Does                                          |
| --------------------------------------------- | --------------------------------------------- |
| `pnpm build` / `pnpm typecheck` / `pnpm test` | across all apps                               |
| `pnpm format`                                 | Prettier on the repo                          |
| `pnpm db:migrate --name <change>`             | after editing `apps/api/prisma/schema.prisma` |
| `pnpm infra:down`                             | stop Docker services (data is kept)           |

## Testing invitations locally

1. Keep `pnpm dev` and `pnpm emulators` running (the worker sends email to **Mailpit**).
2. People → **Invite people**. After sending, the dialog shows the invite link (development only).
3. Open http://localhost:8025 to see the actual email, or open the link directly — the Firebase
   emulator shows a page to set the new password.
4. Sign in at http://localhost:3000/login as the invited person.

CSV import template: People → **Import CSV** → _Download template_.

## Trying an exam end to end

1. `pnpm db:seed` adds 24 sample IoT/embedded questions to the ARC LABS question bank.
2. As Super Admin, switch to an organization → **Exams → New exam**. Add questions from the bank,
   set the window (open now, close later), choose the audience, **Publish**.
3. Invite a test learner in **People** (role _Learner_, matching department), open the invite link,
   set a password and sign in as them in a private window → **My exams → Start exam**.
4. Watch it live in **Exams → Live monitor**; results and analytics update every 10 seconds.

Use a desktop browser — the exam requires full-screen mode.

## Tests

`pnpm test` runs unit tests plus API integration tests against a **separate** database
(`arc_lms_test`, created and migrated automatically — Docker must be running). Firebase is faked
in tests, so the emulator is not needed. Your development data is never touched.

## Troubleshooting

- **`pnpm` / `firebase` not recognized** → add `%APPDATA%\npm` to your user PATH, reopen PowerShell.
- **`failed to connect to the docker API`** → open Docker Desktop and wait for "Engine running".
- **Port already in use** → another app uses 3000/4001/5432; stop it or change `PORT` in `.env`.
- **API says `USER_NOT_REGISTERED`** → the web app calls `/auth/sync` after sign-in; refresh the page.
