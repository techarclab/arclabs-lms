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

### A2. AWS server (6 months on the AWS free credits) — faster than Render free

One small AWS server (2 CPUs) runs the same runner: about 4 programs at once and it never sleeps,
so roughly 150–200 students can write a coding exam together (Render free: about 50–80). New AWS
accounts get up to **$200 credits for 6 months**; the free plan blocks charges. After 6 months,
either upgrade the AWS account (about $15–20/month) or switch back to Render — only
`CODE_RUNNER_URL` / `CODE_RUNNER_TOKEN` in Vercel change.

**1. Create the AWS account** — aws.amazon.com → **Create an AWS account** → choose the **Free
plan**. A card is needed only for verification.

**2. Pick Singapore** — top-right region menu → **Asia Pacific (Singapore)**. (The API runs in
Singapore, so the runner is close to it.)

**3. Launch the server** — search **EC2** → **Launch instance**:

| Field            | Value                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Name             | `arclabs-runner`                                                                                       |
| Image (AMI)      | **Ubuntu Server 24.04 LTS**, 64-bit (x86)                                                              |
| Instance type    | **c7i-flex.large** (2 CPUs, 4 GB — faster) or **t3.small** (2 GB — cheaper); both _Free tier eligible_ |
| Key pair         | **Proceed without a key pair** (you'll use the browser terminal)                                       |
| Network settings | tick **Allow SSH**, **Allow HTTPS** and **Allow HTTP** from the internet                               |
| Storage          | **20 GiB** gp3                                                                                         |

→ **Launch instance**.

**4. Give it a fixed address** — EC2 → **Elastic IPs** → **Allocate Elastic IP address** →
**Allocate** → select it → **Actions → Associate Elastic IP address** → Instance:
`arclabs-runner` → **Associate**. (Without this, the address changes every time you start the
server and Vercel would need the new one each time.)

**5. Open the server's terminal** — EC2 → Instances → `arclabs-runner` → **Connect** →
**EC2 Instance Connect** → **Connect**. A black terminal opens in your browser.

**6. Run the setup** (5–8 minutes):

- If the GitHub repository is **public**, paste:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/techarclab/arclabs-lms/main/infra/aws/runner-setup.sh -o setup.sh && sudo bash setup.sh
  ```

- If it is **private**: type `nano setup.sh`, paste the whole text of `infra/aws/runner-setup.sh`,
  press **Ctrl+O**, **Enter**, **Ctrl+X**, then run `sudo bash setup.sh`. When it asks, paste a
  GitHub token (GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate;
  Repository access: only `arclabs-lms`; Permissions: **Contents → Read-only**). The token is
  used once and not saved.

At the end it prints `CODE_RUNNER_URL` (like `https://13-250-1-2.sslip.io`) and
`CODE_RUNNER_TOKEN`. Don't share the token in chats or screenshots.

**7. Connect the LMS** — Vercel → **arclabs-api** → Settings → Environment Variables → set
`CODE_RUNNER` = `arc`, `CODE_RUNNER_URL` and `CODE_RUNNER_TOKEN` to the printed values →
Deployments → ⋯ → **Redeploy**.

**8. Check** — open `<CODE_RUNNER_URL>/health` (should show `"ok": true`), then Question bank → a
coding question → **Check test cases** — every test should pass.

**9. Retire Render** — once AWS works: Render → `arclabs-runner` → Settings → **Suspend**.

**Every exam day (to save credits):**

- **Before** — EC2 → Instances → select → **Instance state → Start**, about 10 minutes before the
  exam. Open `<CODE_RUNNER_URL>/health` to confirm.
- **After** — on the exam's Results page, if any coding answers are waiting, click **Evaluate
  coding answers** until none remain. Then **Instance state → Stop**.
- Use **Stop**, never **Terminate** (Terminate deletes the server).
- Keep it running while faculty create or test coding questions.

**Other commands** (in the server's terminal):

| What                             | Command                                 |
| -------------------------------- | --------------------------------------- |
| Update the runner to latest code | `sudo arc-runner-setup`                 |
| Show the token again             | `sudo cat /opt/arc-runner/runner-token` |
| Is it running?                   | `sudo docker ps`                        |
| Runner log                       | `sudo docker logs --tail 50 arc-runner` |

Check remaining credits: AWS console → **Billing and Cost Management → Credits**.

**Credits:** c7i-flex.large costs roughly $0.08–0.10 per hour while running (t3.small about a
quarter of that). Left on 24/7 it would use the $200 in about 3 months; started only for exams and
question setting (say 40 hours a month) it costs a few dollars a month. Always **Stop** it after.

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
   `AI_GRADER_MODEL=openai/gpt-oss-120b`, `AI_GRADER_RPM=6` (the free plan allows ~6 answers a
   minute, ~1,000 a day).

   Providers retire models from time to time. If marking says the model "isn't available", pick a
   current one from console.groq.com/docs/models and set `AI_GRADER_MODEL` to it (no code change).

3. Question bank → an AI-marked question → **Try the AI marking** → **Mark the reference solution**
   should give full marks.

On the free plan, 80 students take about 15 minutes to mark: answers show "being evaluated" until
then. After the exam, open **Results** — marking runs automatically while the page is open (or click
**Evaluate coding answers**).

Any OpenAI-compatible service works instead — e.g. **OpenRouter**:
`AI_GRADER_BASE_URL=https://openrouter.ai/api/v1`, `AI_GRADER_MODEL=<a model id, e.g. one ending in
:free>`, `AI_GRADER_API_KEY=<OpenRouter key>` (its free plan allows only 50 requests a day unless you
add credit).

**Backup key (recommended):** create a second free Groq key (another Groq account) and add it in
Vercel → arclabs-api → Environment Variables as `AI_GRADER_API_KEY_2`, then Redeploy. When the main
key hits its limit (or stops working), marking switches to the backup automatically and returns to
the main key when it recovers. Never paste keys into chats.

## 11. Stopping an exam early

Exam page or Results page → **Stop exam** (only while it's live). The window closes at once, everyone
still writing is submitted with their saved answers, and nobody else can start. Coding answers are
then marked on the Results page.

## 12. Study materials

Admins and faculty share materials from **Study materials → Share material**; students see them
under **Study materials** (view inside the portal, open in a new tab, or download). Each material
is either a **link** or an **uploaded file**, and goes to all students or chosen departments.

**Links (no setup):** Google Drive files/folders, Google Docs/Slides/Sheets, YouTube videos and
playlists, Dropbox, OneDrive, or any website / direct file link. Google files must be shared as
**“Anyone with the link” (Viewer)** — the form warns you when a file looks private.

**File uploads (Firebase Storage)** — PDF, PPT, Word, Excel, images, videos, ZIP and code files up
to 100 MB each. Files stay private; students get links that expire after 3 hours.

1. Firebase console → project **arc-labs-lms** → ⚙ **Usage and billing** → **Modify plan** →
   **Blaze**. Google requires this (and a card) for Storage since Sept 2024, but usage inside the
   no-cost tier (5 GB stored in a US bucket) isn’t charged. Set a **budget alert** (e.g. ₹100)
   under Google Cloud → Billing → Budgets so you are warned before any charge.
2. **Build → Storage → Get started** → location **US-CENTRAL1** (the no-cost region) →
   **production mode**. Leave the default rules (deny all) — the API hands out signed links.
3. Copy the bucket name shown at the top of the Files tab (e.g. `arc-labs-lms.firebasestorage.app`).
4. Vercel → **arclabs-api** → Settings → Environment Variables → add
   `FIREBASE_STORAGE_BUCKET` = that bucket name → **Redeploy**. (`FIREBASE_SERVICE_ACCOUNT_JSON`
   is already set; it is used to sign the links.)
5. Open **Share material** — the **Upload file** tab is now active. The API sets the bucket’s
   CORS for your website automatically on the first upload. If uploads fail with a CORS error,
   run this once in Google Cloud Shell:

   ```bash
   echo '[{"origin":["https://arclabs-web.vercel.app"],"method":["GET","HEAD","PUT"],"responseHeader":["Content-Type","Content-Disposition"],"maxAgeSeconds":3600}]' > cors.json
   gcloud storage buckets update gs://arc-labs-lms.firebasestorage.app --cors-file=cors.json
   ```

Click the numbers on a material (or ⋯ → **Who opened it**) to see who opened / downloaded it and
who hasn’t yet; export as CSV.

## 13. Emailing the faculty access code

People → **Faculty access code** → **Create access code** (or **New code**) → **Email**. Type the
faculty emails; the subject and message (code, sign-in link, steps) are written for you.

- **Send email** sends it from the server. This needs SMTP on the API project:
  `EMAIL_DELIVERY=direct`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
  (e.g. Gmail: `smtp.gmail.com`, port `587`, your Gmail address and an
  [app password](https://myaccount.google.com/apppasswords)). The same settings send invite emails.
- **Open in email app** works without any setup — it opens Outlook/Gmail with the recipients,
  subject and message filled in.

The code is shown (and can be emailed) only right after it is created; the database keeps only a
hash of it.

## 14. Lab marks (offline labs and project reviews)

Nothing to set up. **Lab marks → New lab**: title, date, the criteria with their marks (e.g.
Presentation /5, Contribution in project /5, Viva /5) and which students (all, or chosen
departments). Then type marks on the sheet — it saves each row automatically, **Enter** moves to
the next student, tick **Absent** where needed, add remarks. The class average, highest, lowest and
per-criterion averages update live; **Export CSV** downloads the sheet. Students see their marks,
remarks and the class average under **Lab marks** as soon as they are saved. Criteria can be
changed later (⋯ → Edit lab); totals are recalculated.

## 15. Importing questions from a PDF / Word paper

Question bank → **Import from PDF / Word**. Drop in the paper (text PDF or .docx — it is read in the
browser, nothing is uploaded), check the questions it found, then **Import**. With AI marking set up
(§10) AI reads any layout and can suggest missing answers (flagged for checking); without it the
paper must use the usual layout: `1. question`, `A) option`, `Answer: B` or an answer key at the end.
Scanned (photo) PDFs have no text — paste the questions instead.

## 16. Announcements and exam reminders (email)

**College emails.** People → Student registration link → **College email domain** (e.g.
`mrec.edu.in`). Students must then register with their institution email; announcements go there.
Students who registered earlier without one see a banner asking for it; until then their login
email is used.

**Sending.** Announcements → pick _General message_ or _Exam reminder_ (or click **Send reminder**
on an exam), choose all students / departments / students of an exam (optionally only those who
haven’t taken it), check the reach count, **Send**. Each message is emailed in Bcc batches (students
don’t see each other’s addresses, replies come to the sender) and shown under **Announcements** in
the student portal.

**Email setup (API project on Vercel):** `EMAIL_DELIVERY=direct`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Daily limits: a Gmail account ≈ 500 recipients/day, Google
Workspace ≈ 2,000/day, Brevo free 300/day. For more students use a paid SMTP (Brevo, Resend, SES).
Without SMTP, announcements still appear in the student portal.

## 17. Departments: own pages, own links, department-only faculty

**How it fits together:** one college = one admin panel. Inside it, each department (ECE, CSE…) has its own page, students, faculty and registration link.

- **Departments** (sidebar) lists every department with student/faculty counts and its registration link. **Open** shows the department page: stats, the link, and tabs for students (with CSV), faculty, exams, study materials and labs. **Message ECE** opens Announcements with that department already chosen.
- **Two kinds of registration link — both work:**
  - _College link_ (People page): students choose their department from a list.
  - _Department link_ (Departments page, e.g. `…/join/CMRIT-ECE-7K2Q`): the department is fixed, so students can't pick the wrong one. Turn it on/off per department; **New code** stops the old link.
- **Department-only faculty:** on People, edit a faculty member (Instructor / Content manager / Evaluator) and set their department. They then only see that department — its students, exam results, materials, lab marks and announcements — and anything they create goes to that department automatically. College-wide items stay visible to them but only admins can edit them. **Org admins are never limited**, even with a department set.

## 18. Camera AI: what counts and what is only flagged

Runs in the student's browser; video is never recorded. A small photo is saved as evidence
whenever a rule is broken. The student always sees an on-screen warning first.

| What the camera sees                                   | Result                                         |
| ------------------------------------------------------ | ---------------------------------------------- |
| A phone in view ~1.5 s (e.g. held up to click a photo) | **Violation** (counts towards auto-submit)     |
| Another person **staying** in view ~8 s                | **Violation** (counts towards auto-submit)     |
| Faculty walking past / someone far behind the student  | Ignored (only faces close to the camera count) |
| Face missing, looking away                             | Photo saved for review; **never** auto-submits |

"Looking away" is judged against each student's own normal pose (learned in the first few
seconds and adjusted as they shift), on a ~2-second average, so reading the lower half of the
screen, a hand on the chin or a quick glance up never counts.

Review photos on the exam's Results page → a student → camera photos. Test a laptop's camera with
`/exam/<id>?camcheck=1`.

## 19. Re-exam (a genuine mistake)

Results page → click the student → **Allow re-exam** → write the reason → **Give re-exam**. The old
attempt stays as a record (log and photos) but no longer counts; the student gets one fresh attempt,
and that one counts. If the exam has already closed, choose until when the student may start (default
24 hours) — the exam shows as Live for that student only.

## 20. Question folders (each paper stays separate)

- **Import from PDF / Word** asks for a **folder** (filled in from the file name). Every question in that paper goes into it. Questions already in _that folder_ are skipped; the same question can still be in another paper's folder.
- **Question bank**: folder chips at the top (All questions · each folder · Not in a folder). Inside a folder the questions are in the paper's order. Tick questions (or **Select page**) → **Move to folder**; the **Rename** button renames the open folder (renaming onto an existing name joins them).
- **Exam → Add from bank**: pick the folder, then **Select all** — only that paper's questions are added.
- Questions imported before this update were put into folders named **"Imported <date, time>"** (one per import). Rename them, e.g. to "Unit 1 assignment".

## 21. Forgot password and sign-out on close

- **Forgot password**: Login → _Forgot password? Reset it here_ → enter the email → Firebase emails a link (tell students to check Spam). The link opens a page to choose a new password; afterwards they are signed in.
- To use the ARC LABS page for that link (instead of Firebase's plain page), once: Firebase console → Authentication → **Templates** → _Password reset_ → edit (pencil) → **Customize action URL** → `https://lms.arclabs.in/reset-password` → Save. Optional: change _Sender name_ to "ARC LABS".
- **Signed out on close**: a sign-in lasts only for that browser tab. Reload keeps it; closing the tab or the browser signs out, so the next student on a lab computer must sign in. Opening the LMS in a second tab also asks to sign in. (Same for college access-code logins.)

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
