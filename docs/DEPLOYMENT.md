# Deploying to production (GitHub + Vercel)

Everything runs on free tiers to start:

| Piece            | Service                                            | Notes                                           |
| ---------------- | -------------------------------------------------- | ----------------------------------------------- |
| Website          | Vercel project `arclabs-web`                       | Root directory `apps/web` (Next.js)             |
| API              | Vercel project `arclabs-api`                       | Root directory `apps/api` (one Vercel Function) |
| Database         | Neon Postgres                                      | Region: Asia Pacific (Singapore)                |
| Sign-in          | Firebase Authentication                            | Your existing Firebase project                  |
| Email (optional) | Any SMTP (Gmail app password, Brevo, Resend SMTP…) | Without it, invite links are shown to copy      |

Redis and the worker are **not** needed on Vercel: the API sends email itself
(`EMAIL_DELIVERY=direct`) or, with no SMTP configured, the admin copies invite links from the UI.
Students joining through a college join link never need email.

> Never paste passwords, keys or connection strings into chat or commit them. They go only into
> Vercel → Project → Settings → Environment Variables (or your local `.env`).

---

## 1. Push the code to GitHub

1. On github.com → **New repository** → name `arclabs-lms`, **Private**, do **not** add a README.
2. On your laptop (PowerShell):

   ```powershell
   cd C:\dev\arclabs-lms
   git remote add origin https://github.com/<your-username>/arclabs-lms.git
   git push -u origin main
   ```

   Git will open a browser window to sign in to GitHub the first time.

## 2. Create the database (Neon)

1. neon.tech → sign up → **New project** → name `arclabs`, Postgres 16+, region **AWS Asia Pacific (Singapore)**.
2. **Connect** → copy two connection strings:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL`
   - **Direct** (toggle "Connection pooling" off) → this is `DIRECT_URL`

   In both, remove `&channel_binding=require` from the end (keep `?sslmode=require`).

## 3. Prepare Firebase

In the Firebase console for your project:

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Project settings → General → Your apps**: add a Web app if there isn't one; note
   `apiKey`, `authDomain`, `projectId`.
3. **Project settings → Service accounts → Generate new private key**. A JSON file downloads.
   You will paste its contents (as one line) into Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`.
   Keep the file private and delete it after.

## 4. Deploy the API (Vercel project 1)

1. vercel.com → **Add New… → Project** → import `arclabs-lms`.
2. **Project name** `arclabs-api`, **Root Directory** `apps/api`. Leave framework/build settings as
   they are — `apps/api/vercel.json` sets them (build, database migrations, routing).
3. **Environment Variables**:

   | Name                                                                         | Value                                                 |
   | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
   | `DATABASE_URL`                                                               | Neon **pooled** string                                |
   | `DIRECT_URL`                                                                 | Neon **direct** string                                |
   | `FIREBASE_PROJECT_ID`                                                        | your Firebase project id                              |
   | `FIREBASE_SERVICE_ACCOUNT_JSON`                                              | full service-account JSON on one line                 |
   | `SUPER_ADMIN_EMAIL`                                                          | the email you will sign in with (becomes Super Admin) |
   | `WEB_ORIGIN`                                                                 | `https://arclabs-web.vercel.app` (fix in step 6)      |
   | `EMAIL_DELIVERY` _(optional)_                                                | `direct`                                              |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` _(optional)_ | your SMTP account                                     |

   Do **not** add `NODE_ENV` — Vercel already runs the API in production mode, and setting it
   would skip build tools during install.

4. **Deploy**. The build runs `prisma migrate deploy`, so the database tables are created
   automatically on every deploy.
5. Open `https://<api-domain>/api/v1/health` → expect
   `{"status":"ok", … "database":"up","redis":"skipped"}`.

## 5. Deploy the website (Vercel project 2)

1. **Add New… → Project** → import the same repo again.
2. **Project name** `arclabs-web`, **Root Directory** `apps/web` (framework: Next.js).
3. **Environment Variables**:

   | Name                               | Value                         |
   | ---------------------------------- | ----------------------------- |
   | `NEXT_PUBLIC_API_URL`              | `https://<api-domain>/api/v1` |
   | `NEXT_PUBLIC_FIREBASE_API_KEY`     | from step 3                   |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from step 3                   |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`  | from step 3                   |

   Do **not** set `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` in production.

4. **Deploy**.

## 6. Connect the two

1. API project → Settings → Environment Variables → set `WEB_ORIGIN` to the website's real URL
   (e.g. `https://arclabs-web.vercel.app`; several allowed, comma-separated) → **Redeploy**.
2. Firebase → **Authentication → Settings → Authorized domains** → add the website domain.

## 7. Load starting data (once)

From your laptop, point the seed at Neon (use the **direct** string):

```powershell
cd C:\dev\arclabs-lms
$env:DATABASE_URL = "<Neon direct connection string>"
pnpm --filter @arc/api db:seed
Remove-Item Env:DATABASE_URL
```

This creates the ARC LABS organization and the sample question bank.

## 8. First sign-in and first college

1. Open the website → **Create account** with the `SUPER_ADMIN_EMAIL` address → you are Super Admin.
2. **Organizations → New organization** → e.g. "Anurag University" (type College).
3. Open it → **Members** tab → turn on **Student registration link** → share the link or code
   (WhatsApp button included). Students register themselves and land in **My exams**.
4. Build the exam (Exams → New), audience **All learners**, schedule, **Publish**.
5. After the exam, turn the registration link off (or press **New code**) before the next college.

## Updating the live site

Push to `main` → both Vercel projects rebuild automatically; database migrations run with the API
build. Pull-request branches get their own preview URLs.

## Troubleshooting

- **Website shows "Failed to fetch"**: `NEXT_PUBLIC_API_URL` is wrong, or `WEB_ORIGIN` on the API
  doesn't match the website URL exactly (no trailing slash).
- **"auth/unauthorized-domain"** on sign-in: add the domain in Firebase → Authorized domains.
- **401 on every API call**: `FIREBASE_PROJECT_ID` doesn't match the web app's project, or the
  service-account JSON is missing/invalid.
- **API build fails at `prisma migrate deploy`**: check `DIRECT_URL` (must be the non-pooled string).
