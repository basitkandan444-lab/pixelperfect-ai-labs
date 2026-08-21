# 🔬 PIXEL PERFECT PRO™ — TITAN GAUNTLET Ω EVIDENCE

## Evidence Ladder
- **E0 (Claim)**: Theoretical assertion without verification.
- **E1 (Static Inspection)**: File audits, git grep, schema contracts, AST/type checking.
- **E2 (Automated Test)**: Vitest unit, integration, and architectural suite runs.
- **E3 (Local Integration)**: Multi-component local runtime communication.
- **E4 (Real External Sandbox)**: Live Sandbox API probes (Supabase PostgREST, Paddle Sandbox).
- **E5 (End-to-End Runtime)**: Full deployed user-facing flow.

---

## Evidence Ledger

### 1. Pricing Contract (`REQ-PRICING-005` / `REQ-UI-006`)
- **Evidence E1 (Static)**: Created `src/lib/pricing-catalog.ts` as single source of truth for Monthly ($3.99), Yearly ($37.73), and Lifetime ($99.89).
- **Evidence E1 (Static)**: Audited codebase for legacy prices (`$4.99`, `$19.68`) and purged them from `HomeTopSections.tsx`, `UpgradeWall.tsx`, and `pricing.tsx`.
- **Evidence E2 (Test)**: `src/lib/pricing-catalog.test.ts` passed 3/3 tests verifying catalog structure, type guards, and zero stale prices in active UI paths.

### 2. Billing & Webhook Resilience (`REQ-BILLING-001` / `REQ-WEBHOOK-004`)
- **Evidence E1 (Static)**: Added structured layer prefixes (`[AUTH]`, `[SUPABASE_SCHEMA]`, `[PADDLE_TRANSACTION]`, etc.) in `paddle.server.ts`.
- **Evidence E1 (Static)**: Added customer pre-lookup and duplicate conflict recovery in `createCustomer()`.
- **Evidence E2 (Test)**: `src/routes/api/public/paddle/paddle.test.ts` passed 18/18 tests covering:
  - Configuration status probes
  - Webhook HMAC signature verification & 5-minute replay window
  - Transaction completed / paid for monthly, yearly, lifetime
  - Subscription lifecycle: created, updated, activated, resumed, paused, past_due, canceled
  - Fallback user resolution by `paddle_subscription_id` and `paddle_customer_id`

### 3. Remote Database Contract (`REQ-SUPABASE-002`)
- **Evidence E4 (Remote Sandbox)**: Direct Supabase query to `subscriptions.paddle_customer_id` returned:
  `code: 42703, message: 'column subscriptions.paddle_customer_id does not exist'`.
  *Status*: Confirmed root cause. Migration DDL prepared.

### 4. Paddle Sandbox Transaction (`REQ-PADDLE-003`)
- **Evidence E4 (Remote Sandbox)**: Live POST to `https://sandbox-api.paddle.com/transactions` returned:
  `code: 'transaction_default_checkout_url_not_set', detail: 'Cannot create a transaction or open a checkout as no default payment link has been set for this account.'`.
  *Status*: Confirmed root cause. Awaiting Default Payment Link setting in Paddle dashboard.

### 5. Automated QA & Build (`REQ-QA-008`)
- **Evidence E2 (Automated Test)**: 36 test files, 285 tests passing 100% green.
- **Evidence E1 (Static)**: TypeScript `tsc --noEmit` exited with code 0 (zero type errors).
- **Evidence E1 (Static)**: Vite / Nitro production build succeeded with Cloudflare Worker output (`.output/server/wrangler.json`).
