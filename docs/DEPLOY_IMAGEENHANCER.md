# Deploying to imageenhancer.online

Two parallel paths are supported (the "Both" strategy):

- **Path A — Lovable publish + custom domain** (live traffic, zero infra work)
- **Path B — GitHub Actions → Cloudflare Workers** (self-hosted mirror / staging)

---

## Path A — Lovable publish + custom domain (recommended for live)

1. Publish the project from Lovable (Publish button, or ask the agent to publish).
2. Open **Project Settings → Project → Domains → Connect Domain**.
3. Enter `imageenhancer.online`, then repeat for `www.imageenhancer.online`.
   Both must be added separately; `www` is not auto-added.
4. Because DNS is on Cloudflare, tick **Advanced → "Domain uses Cloudflare or a
   similar proxy"**. This switches verification to CNAME-based, which works with
   Cloudflare's orange-cloud proxy.
5. Add the DNS records Lovable shows, in the Cloudflare DNS tab:
   - `CNAME` / verification record as displayed by the Domains UI
   - `TXT _lovable` = the `lovable_verify=` value shown
   - (Non-proxied fallback) `A @` and `A www` → `185.158.133.1`
6. Choose one host as **Primary**; the other 301-redirects to it.
7. Wait for status to move `Verifying → Setting up → Active`. SSL is automatic.

**Cloudflare SSL mode must be `Full (strict)`** — `Flexible` causes a redirect
loop with Lovable's edge.

### Verify Path A

```sh
curl -fsS https://imageenhancer.online/api/public/health
curl -fsS https://imageenhancer.online/api/public/version
curl -fsS https://imageenhancer.online/api/public/stripe/status
```

Expect `status: ok`, the commit you shipped, and `configured: true`.

---

## Path B — GitHub Actions → Cloudflare Workers

The workflow already exists: `.github/workflows/deploy-cloudflare.yml`
(runs on every push to `main`, builds, then `wrangler deploy`).

### One-time setup (must be done by the repo owner)

1. **GitHub → Settings → Secrets and variables → Actions → New repository secret**
   | Secret | Where to get it |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar **Account ID** |

2. **Worker runtime secrets.** The Worker does *not* inherit Lovable Cloud env
   vars. After the first successful deploy, set them on the Worker
   (Cloudflare dashboard → Workers & Pages → *your worker* → Settings →
   Variables and Secrets), or via `wrangler secret put`:

   | Secret | Required for |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Checkout — **without it every upgrade fails** |
   | `STRIPE_WEBHOOK_SECRET` | Webhook reconciliation |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Premium activation writes |
   | `PUBLIC_APP_ORIGIN` | `https://imageenhancer.online` |
   | `INTERNAL_CRON_SECRET` | Telemetry cron hooks |

   `VITE_*` values are baked at build time, so they belong in GitHub Actions
   env/secrets, not Worker secrets.

3. **Bind the domain to the Worker.** Cloudflare dashboard → Workers & Pages →
   *your worker* → Settings → **Domains & Routes → Add → Custom domain** →
   `imageenhancer.online`. Cloudflare provisions DNS + certificate itself.

   Do not point the apex at both Lovable and the Worker at the same time.
   Pick one owner of the live domain; use a subdomain (e.g.
   `cf.imageenhancer.online`) for the mirror.

4. **Stripe webhook endpoint.** In Stripe → Developers → Webhooks, point the
   endpoint at `https://imageenhancer.online/api/public/stripe/webhook` and
   copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Verify Path B

Same three `curl` checks as Path A, against whichever hostname the Worker owns.

---

## Post-deploy payment smoke test

1. Open the live domain in a normal tab (never an iframe — Stripe blocks it).
2. Sign in.
3. `/pricing` → **Upgrade to Premium** ($4.99/yr) → Stripe Checkout must load
   on `checkout.stripe.com`.
4. Pay with the Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. On return, `/pricing` should show Premium active. If not, press
   **Check payment again** (the synchronous finalize path).
6. Repeat step 3–5 for the $19.68 Lifetime tier (one-time payment mode).
