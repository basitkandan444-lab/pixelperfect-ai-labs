# ⚖️ PIXEL PERFECT PRO™ — TITAN GAUNTLET Ω DECISIONS

## Architectural Decision Records (ADRs)

### ADR-001: Canonical Pricing Catalog Extraction
- **Context**: Pricing values were previously dispersed across `paddle.server.ts`, `pricing.tsx`, `HomeTopSections.tsx`, and `UpgradeWall.tsx`, with stale values (`$4.99`, `$19.68`) in copy.
- **Decision**: Created `src/lib/pricing-catalog.ts` containing `PADDLE_PLANS`, `isPaddlePlan()`, and plan specifications as the single source of truth for backend and frontend.
- **Consequences**: Single source of truth; protected by automated regression test `src/lib/pricing-catalog.test.ts`.

### ADR-002: Resilient Paddle Customer Conflict Resolution
- **Context**: Paddle returns `customer_already_exists` if a customer was previously registered with the same email.
- **Decision**: Implemented proactive `findCustomerByEmail()` lookup prior to creation, plus a catch-block fallback on `409 / already_exists` to retrieve existing customer and avoid unhandled checkout crashes.

### ADR-003: Subsystem-Scoped Structured Error Diagnostics
- **Context**: Errors like "Could not initialize billing profile" masked the failing subsystem.
- **Decision**: Standardized on layer tags `[AUTH]`, `[CONFIGURATION]`, `[SUPABASE_SCHEMA]`, `[SUPABASE_WRITE]`, `[PADDLE_CUSTOMER_LOOKUP]`, `[PADDLE_CUSTOMER_CREATE]`, `[PADDLE_TRANSACTION]`, `[PADDLE_CHECKOUT]`, and `[PADDLE_WEBHOOK]`.

### ADR-004: Multi-Key User Resolution in Webhooks
- **Context**: Paddle webhook events may omit `custom_data.user_id` on renewal or status change events.
- **Decision**: In `src/routes/api/public/paddle/webhook.ts`, resolved user ID through a waterfall: `custom_data.user_id` → `paddle_customer_id` lookup in `subscriptions` → `paddle_subscription_id` lookup in `subscriptions`.
