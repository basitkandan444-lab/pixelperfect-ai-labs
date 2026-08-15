# PIXEL PERFECT PRO™ DESIGN STATE REPORT
## Obsidian Precision™ — Foundation Audit

### 1. ROUTES
- `/`: Primary landing page + workspace. Heavily fragmented styles.
- `/auth`: Basic auth flow (presumed).
- `/pricing`: Detailed pricing tiers (presumed).

### 2. MAJOR COMPONENTS
- `HeroVisual.tsx`: 3D perspective container with `CompareSlider`. Mixes `oklch` with raw hex/color-mix.
- `HomeTopSections.tsx`: Bento grid with pricing spotlight. Uses `shadow-cinema` and custom shimmer.
- `CompareSlider.tsx`: Core interaction component.
- `ProcessingOverlay.tsx`: Enhancement state UI.
- `UpgradeWall.tsx`: Gating UI.

### 3. DESIGN SYSTEM (CURRENT DEBT)
- **Colors**: Mixing `oklch(0.12 0.02 250)` background with `oklch(0.1 0.01 250)` and `bg-white/[0.02]`. Primary is `oklch(0.65 0.2 250)` (Electric Blue).
- **Typography**: Sora (Display) and Manrope (Sans). Sizes are often hardcoded (e.g., `text-[10px]`, `text-7xl`).
- **Spacing**: Fragmented. `mt-12`, `mt-16`, `px-4`, `p-8`. No centralized spacing scale being strictly followed.
- **Radii**: `rounded-[2.5rem]`, `rounded-[2rem]`, `rounded-[1.5rem]`, `rounded-full`. Inconsistent hierarchy.
- **Elevation**: `shadow-cinema`, `shadow-elegant`, `shadow-glow`. Custom definitions in `styles.css`.

### 4. FORENSIC DEBT MAP

| LOCATION | CURRENT STATE | USER IMPACT | PRIORITY | RECOMMENDED DIRECTION |
| :--- | :--- | :--- | :--- | :--- |
| `styles.css` | Multiple `@keyframes` and `@utility` blocks scattered. | Maintenance burden, potential performance lag on lower-end devices. | Medium | Consolidate into semantic animation system. |
| `HomeTopSections.tsx` | Hardcoded `rounded-[2.5rem]` and `bg-white/[0.02]`. | Visual inconsistency with other cards. | High | Use semantic surface and radius tokens. |
| `HeroVisual.tsx` | Mix of perspective transforms and grid layouts. | Fragile responsive behavior. | High | Standardize perspective container primitive. |
| `src/routes/index.tsx` | 1000+ lines. Component logic mixed with UI layout. | Slow iteration speed. | Medium | Extract sub-sections into dedicated components. |
| Global | Inconsistent use of "Gold" remnants vs new "Electric Blue". | Brand confusion. | High | Purge all legacy "Gold" references. |

### 5. TECHNICAL CONSTRAINTS
- **SSR Safety**: Must guard ML and browser-only APIs (`navigator.gpu`, `onnxruntime`).
- **Performance**: High-density gradients and backdrop-filters can impact mobile FPS.
- **Accessibility**: Current contrast on `muted-foreground` in dark mode needs verification. Focus states are default or missing in some custom triggers.

---

## IMPLEMENTATION PLAN — SECTION 1

### PHASE 1.1: SEMANTIC PRIMITIVES (Smith + Ellie)
- Refine `src/styles.css` with a strict semantic scale for:
  - **Surfaces**: `surface-base`, `surface-elevated`, `surface-modal`.
  - **Borders**: `border-subtle`, `border-muted`, `border-strong`.
  - **Typography**: Responsive `text-display`, `text-h1`, etc.
  - **Motion**: `ease-precision` (cubic-bezier), `duration-fast`, `duration-standard`.

### PHASE 1.2: COMPONENT MIGRATION (Smith)
- Update `Button.tsx` to include an `obsidian` variant.
- Create a `Card` primitive in `src/components/ui/card.tsx` that handles the `card-premium` logic.
- Standardize `HeroVisual` and `HomeTopSections` to use these new primitives.

### PHASE 1.3: TYPOGRAPHY & SPACING UNIFICATION (Ellie)
- Replace all hardcoded `text-[10px]` with semantic `text-caption` or `text-eyebrow`.
- Apply a consistent `8-12-16-24-32-48-64` spacing scale.

### PHASE 1.4: VERIFICATION & QA (Elon + Alex)
- Build check.
- Visual regression check (manually via preview).
- Accessibility audit (Keyboard + Screen Reader).
- Mobile responsive stress test.

---
**DECISION: READY TO INITIALIZE SECTION 1 MIGRATION.**
