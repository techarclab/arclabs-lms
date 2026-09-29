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

   Students must fill every field — name, roll number, department, email and password — so add the
   college's departments first (People → Departments); the registration link can't be switched on
   until at least one exists.

6. **Faculty access (view-only)**: on the same Members tab, **Faculty access code → Create access
   code**. Copy it (it is shown only once — only a hash is stored) and send it to the college's
   coordinator. Faculty open the website → **College faculty?** → type the code (hidden while
   typing). They see that college's exams, results and students, and can't change anything.
   **New code** replaces it and signs everyone out; **Turn off** disables it. Sessions last 7 days.

## 9. Coding questions — connect the code runner

Coding questions (C and Python) work without a runner: students write and save code, and their
coding marks show as "being evaluated". Once a runner is connected, students can **Run** their code
during the exam, answers are graded on submit, and older answers can be graded from the exam's
**Results** page → **Evaluate coding answers**.

### A. Free: ARC LABS runner on Render (recommended to start)

The runner lives in `apps/runner` (Dockerfile, `server.py`, `jail.c`). Render's free web service
needs no card. Every program runs in a jail: CPU / memory / output limits, no internet, no extra
processes, and no access to other students' files.

The free machine is small (0.1 CPU). Pressing **Run** takes a second or two; when a whole class
submits at once, some coding answers may show "being evaluated" for a few minutes — click
**Evaluate coding answers** on the exam's Results page after the exam to finish them.

1. Go to **render.com** → **Get started** → sign up **with GitHub** (the account that owns
   `arclabs-lms`). No card needed.
2. **New + → Web Service → Git provider → GitHub** → allow Render to see the `arclabs-lms`
   repository → select it.
3. Fill in:

   | Field          | Value            |
   | -------------- | ---------------- |
   | Name           | `arclabs-runner` |
   | Region         | **Singapore**    |
   | Branch         | `main`           |
   | Root Directory | `apps/runner`    |
   | Language       | **Docker**       |
   | Instance Type  | **Free**         |

4. **Environment Variables → Add**: name `RUNNER_TOKEN`, value → click **Generate** (or make one
   in PowerShell and paste it):

   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
   ```

5. **Deploy Web Service**. The first build takes 3–5 minutes; wait for **Live**. Your address is
   shown at the top, e.g. `https://arclabs-runner.onrender.com`.
6. Open `https://arclabs-runner.onrender.com/health` (your address + `/health`). You should see
   `"ok": true` and `"sandbox": "seccomp+landlock"` (`"seccomp"` alone is also fine;
   `"limits-only"` means the host blocks the sandbox — tell your developer).
7. Vercel → **arclabs-api** → Environment Variables → add, then **Redeploy**:

   | Name                | Value                                     |
   | ------------------- | ----------------------------------------- |
   | `CODE_RUNNER`       | `arc`                                     |
   | `CODE_RUNNER_URL`   | `https://arclabs-runner.onrender.com`     |
   | `CODE_RUNNER_TOKEN` | the same value as Render's `RUNNER_TOKEN` |

8. Question bank → open a coding question → **Check test cases** — every test should pass.

**Sleep:** free Render services sleep after 15 minutes without use and take about a minute to wake.
The API wakes the runner whenever a student opens an exam. On exam day, open the `/health` link
2–3 minutes before the start so it's awake when the first student presses **Run**.

Optional: Render → arclabs-runner → **Settings → Build Filters → Included paths** `apps/runner/**`,
so the runner only rebuilds when its own files change.

### B. Paid, when more colleges join

- **Upgrade the Render instance** (Settings → Instance Type, e.g. Starter) — no other changes;
  it stays awake and runs much faster, or
- **Google Cloud Run** (deploy `apps/runner` the same way; its free tier is generous but needs a
  card on the account), or
- **Judge0 CE** on your own server or on RapidAPI: set `CODE_RUNNER=judge0`, `JUDGE0_URL` and
  `JUDGE0_AUTH_TOKEN` (self-hosted) or `JUDGE0_RAPIDAPI_KEY` (RapidAPI) instead.

For local development only, `CODE_RUNNER=local` runs `gcc` / `python3` on your own machine — never use
it in production (it is not a sandbox).

## 10. AI marking for coding questions (no test cases)

For questions like "write a DHT11 sketch", choose **How is it marked? → AI marking** in the question
editor and write a **marking scheme** (e.g. "Reads the DHT11 on pin 2 — 4 marks", "Fan logic — 4",
"Prints readings — 2"). On submit the code is compiled, then an AI marks it against the scheme: any
correct approach gets marks, partial work gets partial marks, and code that doesn't compile loses the
% you set. Faculty can open any attempt on the Results page and **Change** the marks.

Free setup with **Groq** (no card):

1. **console.groq.com** → sign in → **API Keys → Create API Key** → copy it.
2. Vercel → **arclabs-api** → Environment Variables → add, then **Redeploy**:

   | Name                | Value        |
   | ------------------- | ------------ |
   | `AI_GRADER_API_KEY` | the Groq key |

   Defaults: `AI_GRADER_BASE_URL=https://api.groq.com/openai/v1`,
   `AI_GRADER_MODEL=llama-3.3-70b-versatile`, `AI_GRADER_RPM=6` (the free plan allows ~6 answers a
   minute, ~1,000 a day).

3. Question bank → an AI-marked question → **Try the AI marking** → **Mark the reference solution**
   should give full marks.

On the free plan, 80 students take about 15 minutes to mark: answers show "being evaluated" until
then. After the exam, open **Results** — marking runs automatically while the page is open (or click
**Evaluate coding answers**).

Any OpenAI-compatible service works instead — e.g. **OpenRouter**:
`AI_GRADER_BASE_URL=https://openrouter.ai/api/v1`, `AI_GRADER_MODEL=<a model id, e.g. one ending in
:free>`, `AI_GRADER_API_KEY=<OpenRouter key>` (its free plan allows only 50 requests a day unless you
add credit).

## 11. Stopping an exam early

Exam page or Results page → **Stop exam** (only while it's live). The window closes at once, everyone
still writing is submitted with their saved answers, and nobody else can start. Coding answers are
then marked on the Results page.

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
