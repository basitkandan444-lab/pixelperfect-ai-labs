# Operations Runbook

Production operations, incident response, rollback, and disaster recovery for
Pixel Perfect Pro.

## Architecture at a glance

- **Frontend + SSR:** TanStack Start (React 19) on Cloudflare Workers (edge).
- **Server routes:** `src/routes/api/*` (image enhancement proxy, sitemap,
  public health check).
- **AI:** Lovable AI Gateway (`google/gemini-3-pro-image`) via `LOVABLE_API_KEY`.
- **No first-party database.** State is per-request; there is no persistent user
  data store to back up (see Disaster Recovery).

## Monitoring & health

- **Liveness:** `GET /api/public/health` returns `200 {"status":"ok"}`. Point an
  external uptime monitor (UptimeRobot / BetterStack / Pingdom) at the stable
  production URL and alert on non-200 or >2s latency.
- **Analytics / RUM:** GA4 (`VITE_GA4_ID`) and optional Microsoft Clarity.
- **Errors:** client React error boundaries report via `window.__lovableEvents`
  (`src/lib/lovable-error-reporting.ts`); SSR errors are normalized and logged in
  `src/server.ts`. Review worker logs in the Lovable dashboard.

## Diagnosing an incident

Answer these three questions in order:

1. **What failed?** Check `/api/public/health`, then load the homepage and an
   enhancer route. Check GA4 Realtime for traffic collapse.
2. **Why did it fail?** Read worker logs (Lovable dashboard). Common causes:
   missing/expired `LOVABLE_API_KEY` (AI returns 500 "AI is not configured"),
   a bad deploy, or an upstream AI gateway outage.
3. **How do we recover?** Roll back (below) or fix-forward.

## Rollback

Lovable keeps a full version history.

1. Open the project's **version history** in Lovable.
2. Select the last known-good version.
3. **Restore** it, then **Publish / Update** to push it live.
4. Verify with the post-deploy checklist in `DEPLOYMENT.md`.

If the repo is synced to GitHub, you can also `git revert <bad-commit>` on `main`
(never force-push), let CI pass, then re-publish.

**Secret-only issue?** If the outage is caused by a missing/rotated secret, no
code rollback is needed — restore the correct value in Lovable secrets and the
server routes pick it up on the next request.

## Disaster recovery

- **Code:** recoverable from Lovable version history and (if connected) the
  GitHub repository. Keep GitHub sync enabled for an off-platform copy.
- **Secrets:** not stored in the repo. Keep an off-platform record of which
  secret *names* exist and where each value is obtained (the values themselves
  live only in Lovable / the source provider).
- **Data:** the app stores no persistent user data, so there is no database to
  back up or restore. If a database is added later, enable scheduled backups and
  document the restore procedure here.
- **AI dependency:** the enhancement feature degrades gracefully — if the gateway
  is down, the route returns a clean error and the rest of the site keeps
  working.

## Emergency recovery workflow

1. Declare the incident; note start time.
2. Confirm scope via health check + homepage.
3. Roll back to last known-good version and publish.
4. Verify recovery (health endpoint + one enhancement).
5. Write a short post-mortem: cause, impact, fix, prevention. Add follow-ups to
   `CHANGELOG.md` / issues.

## Security incident response

- Rotate the affected secret immediately in Lovable (for `LOVABLE_API_KEY`, use
  the Lovable key rotation flow).
- Re-publish so server code picks up the new value.
- Review worker logs for abuse; run the Lovable security scan.
- Never commit secrets; `.dev.vars` and `.env*` are gitignored.
