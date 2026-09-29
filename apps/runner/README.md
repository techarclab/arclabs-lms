---
title: ARC LABS Code Runner
emoji: ⚙️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# ARC LABS code runner

Compiles and runs students' **C** and **Python** exam answers for the ARC LABS LMS.

- `GET /health` — status (no login needed)
- `POST /run` — needs `Authorization: Bearer <RUNNER_TOKEN>`

Each program runs in a jail: CPU / memory / output limits, no network, no new processes,
and (with Landlock) no access to any files outside its own folder. Nothing is stored.

**Setup:** set the Space secret `RUNNER_TOKEN` to a long random string, and put the same value in
the API's `CODE_RUNNER_TOKEN`. See `docs/DEPLOYMENT.md` → "Code runner" in the LMS repo.
