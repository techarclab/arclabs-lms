# ARC LABS code runner

Compiles and runs students' **C** and **Python** exam answers for the ARC LABS LMS.

- `GET /health` — status (no login needed; also wakes a sleeping free instance)
- `POST /run` — needs `Authorization: Bearer <RUNNER_TOKEN>`

Each program runs in a jail (`jail.c`): CPU / memory / output limits, no network, no new
processes, and (with Landlock) no access to any files outside its own folder. Nothing is stored.

Deploy anywhere that runs a Dockerfile (Render free plan, Google Cloud Run, a VM). Set
`RUNNER_TOKEN` to a long random string and put the same value in the API's `CODE_RUNNER_TOKEN`.
The runner detects how much CPU it has and adjusts parallelism and timeouts. See
`docs/DEPLOYMENT.md` → "Coding questions" in the LMS repo.
