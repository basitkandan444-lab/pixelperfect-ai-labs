# Obsidian Precision Redesign Plan

## Phase 1: Design Foundation & System Primitives

### 1.1 Foundation Audit & Token System (Smith + Ellie)
*   **Audit**: Map every hardcoded color, border, and spacing value in `src/styles.css`, `Index.tsx`, and `HomeTopSections.tsx`.
*   **Tokenization**: Define a unified `oklch` palette for Obsidian Precision.
    *   `--background`: Deep obsidian (`oklch(0.08 0.01 250)`)
    *   `--foreground`: Pearl white (`oklch(0.98 0.01 250)`)
    *   `--primary`: Precision blue (`oklch(0.65 0.22 250)`)
    *   `--surface-low`: `oklch(0.12 0.02 250)`
    *   `--border`: `oklch(0.18 0.02 250)`
*   **Centralized Motion**: Define `--ease-standard`, `--ease-in-out`, and timing tokens.

### 1.2 Reusable UI Primitives (Smith + Maya)
*   **Buttons**: Elite variants (Primary, Ghost, Steel) with consistent internal padding and radius (`1rem`).
*   **Cards**: Standardized `glass-card` component with `oklch` borders and cinematic depth.
*   **Typography Scale**: Define `--font-display` (Sora/Instrument Serif) and `--font-sans` (Manrope/Inter) hierarchy.

### 1.3 Design Consistency Migration (Elon + Atlas)
*   **Migration**: Replace all `white/10` and `white/5` instances with semantic `--border` tokens.
*   **Alignment**: Standardize radii across the entire app to a 3-tier system (sm: `0.5rem`, md: `1rem`, lg: `2rem`).
*   **Accessibility**: Audit and implement focus-visible rings for all interactive elements.

## Technical Details
*   **Stack**: Tailwind CSS v4 + TanStack Start.
*   **Styling**: Use `@utility` for complex patterns (glass, cinematic-shadow) to keep JSX clean.
*   **Guard**: All CSS changes must preserve `if (import.meta.env.SSR) return;` logic in ML components.
*   **Validation**: `bun run build:dev` for every change to ensure no hydration mismatches or build breakage.

## Verification Gate (Elon + Alex)
*   **Criteria 1**: Zero hardcoded colors in `src/styles.css`.
*   **Criteria 2**: Mobile responsiveness verified via Playwright.
*   **Criteria 3**: Motion tokens applied to all transitions.
*   **Criteria 4**: Independent review (Alex) for "Elite Product Quality".
