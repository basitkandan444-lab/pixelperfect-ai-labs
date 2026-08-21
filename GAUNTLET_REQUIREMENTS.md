# 📋 PIXEL PERFECT PRO™ — TITAN GAUNTLET Ω REQUIREMENTS

| Req ID | Gate | Subsystem | Description | Acceptance Criteria | Owner | Evidence Level | Status |
|---|---|---|---|---|---|---|---|
| `REQ-BILLING-001` | G5 | Paddle Engine | Resilient customer lookup and checkout transaction creation | No duplicate customer errors on conflict; returns transaction ID & URL | SMITH | E2/E4 | **VERIFIED (Code) / BLOCKED (Sandbox setting)** |
| `REQ-SUPABASE-002` | G3 | Database Schema | Add `paddle_customer_id` and `paddle_subscription_id` to `subscriptions` | Schema contains columns, PostgREST exposes them, RLS verified | SMITH | E4 | **BLOCKED ON DB EXECUTION** |
| `REQ-PADDLE-003` | G4 | Paddle Sandbox | Sandbox transactions with valid price IDs & checkout URLs | Successful HTTP 200 transaction creation with checkout URL | SMITH | E4 | **BLOCKED ON PAYMENT LINK SETTING** |
| `REQ-WEBHOOK-004` | G6 | Webhooks | Full lifecycle events & resilient user fallback resolution | Handles all subscription events, resolves user_id, idempotent | SMITH | E2 | **VERIFIED** |
| `REQ-PRICING-005` | G7 | Pricing System | Canonical pricing catalog single source of truth | `src/lib/pricing-catalog.ts` consumed across all UI & backend | ELLIE | E1/E2 | **VERIFIED** |
| `REQ-UI-006` | G8 | Frontend | Zero stale pricing copy and clean UI transformation | No `$4.99`, `$19.68`, or legacy references in UI | ELLIE | E1/E2 | **VERIFIED** |
| `REQ-SEC-007` | G9 | Security | Zero secret leakage, `.env` ignored, safe diagnostics | No secrets in code, logs, or git; `.env` gitignored | ELON | E1 | **VERIFIED** |
| `REQ-QA-008` | G10 | Test Matrix | Full automated test suite & clean build | 36 test files, 285 tests passing; clean `tsc` & `vite build` | ELON | E2 | **VERIFIED** |
| `REQ-AUDIT-009` | G12 | Governance | Independent verification & adversarial review | Alex challenges all assumptions and verifies evidence chain | ALEX | E5 | **IN PROGRESS** |
