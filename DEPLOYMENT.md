# Deployment

Production runs on a **self-hosted Mac** (native pm2 + nginx + Homebrew Postgres),
served at `http://task.eimple.com` / `http://103.76.103.169`. Deploys are
**git-driven** — you never build by hand.

## The flow

```
 you: branch  →  Pull Request  ──CI (GitHub-hosted)──►  tests + frontend build
                                                              │ must pass
                                                              ▼
                      merge / push to  production
                                                              │
                       GitHub self-hosted runner (on the Mac) │  (polls GitHub,
                                                              ▼   outbound only)
   scripts/deploy.sh:  snapshot ► pull ► npm ci ► TESTS ► build ► db push
                       ► restart (pm2) ► health-check
                                                              │
                                    healthy? ── yes ─► done ✅
                                              └─ no  ─► AUTO-ROLLBACK to snapshot
```

- **CI** (`.github/workflows/ci.yml`) runs on every PR/push: backend tests +
  frontend type-check/build. Merges should be gated on it (see branch protection).
- **Deploy** (`.github/workflows/deploy.yml`) runs only on push to `production`,
  on the Mac's self-hosted runner, and calls `scripts/deploy.sh`.

## Make a change (day-to-day)

1. Branch off `production` (or `Test`), commit your work, open a PR.
2. CI runs the tests. Fix until green.
3. Merge into `production` (or push to it). The runner deploys automatically.
4. Watch it in the repo's **Actions** tab. If the deploy fails, it rolls back on
   its own — production stays on the last working release.

## What `scripts/deploy.sh` does

1. **Snapshots** the current release to `.deploy/releases/<timestamp>/` — the
   commit SHA, `backend/dist`, `frontend/dist`, and a `db.sql.gz` dump (the
   "image of the last deployment"). Keeps the last **5** (`KEEP_RELEASES`).
2. `git fetch` + `reset --hard origin/production`.
3. `npm ci` (backend + frontend).
4. **Runs the test suite** — deploy aborts (and rolls back) if tests fail.
5. Builds backend + frontend.
6. `prisma db push` (applies schema changes; non-destructive additions).
7. Restarts the app via pm2, then **health-checks** `:4001/api/health` and `:8093`.
8. On **any** failure it **auto-rolls-back**: restores the snapshot's code + build,
   `npm ci`, restarts, and re-checks health.

Run it manually too: `./scripts/deploy.sh` (deploy) or
`BRANCH=Test ./scripts/deploy.sh`.

## Rollback

- **Automatic** on a failed deploy (tests, build, or health check).
- **Manual:** `./scripts/deploy.sh rollback` → restores code+build from the most
  recent snapshot and restarts.
- **Database** is never auto-restored (that would lose data created since). To
  restore a DB image manually:
  ```bash
  gunzip -c .deploy/releases/<timestamp>/db.sql.gz | psql -h localhost -U $USER universitytask
  ```

## One-time setup: install the self-hosted runner on the Mac

1. On GitHub: **repo → Settings → Actions → Runners → New self-hosted runner → macOS**.
2. Follow the shown commands on the Mac (download, then `./config.sh` with the
   given URL + token). Accept the default labels (`self-hosted`, `macOS`).
3. Install it as a service so it survives reboots:
   ```bash
   ./svc.sh install
   ./svc.sh start
   ```
4. Ensure the runner's user can run the toolchain non-interactively — it already
   can: `deploy.sh` puts `~/.npm-global/bin` (pm2), `/opt/homebrew/bin` (git,
   psql, pg_dump) and `/usr/local/bin` (node) on `PATH`.

> The runner makes only **outbound** connections to GitHub, so no router
> port-forward or firewall change is required.

## Branch protection (so tests actually gate merges)

CI only *blocks* a bad merge if you require it. On GitHub:

1. **Repo → Settings → Branches → Add branch ruleset** (or "Add rule") for
   `production` (and `Test` if you want).
2. Enable **Require a pull request before merging**.
3. Enable **Require status checks to pass before merging**, and select the CI
   checks: **`backend-tests`** and **`frontend-build`**.
4. (Recommended) **Require branches to be up to date before merging**, and
   **Do not allow bypassing the above settings**.

Now nothing reaches `production` (and triggers a deploy) unless the tests pass.
The deploy script *also* re-runs the tests on the server as a second gate.

## Secrets / env

- `.env` files (`backend/.env`, `frontend/.env`) live **only on the Mac** and are
  gitignored — they are never in the repo and are untouched by deploys. The
  production hosting copy is preserved at `backend/.env.hosting`.
- Because they persist on the server, schema/secret changes are stable across
  deploys.

## Operating the server (unchanged)

- `./server.sh status|start|stop|restart` — Postgres + app + nginx.
- After a power cut: `./server.sh restart`.
- nginx boot-persistence: `deploy/com.uni-tcms.nginx.plist` (see server.sh header).
