# Obsidian Precision Design State Report

## Routes
- `/`: Primary landing page and workspace.
- `/pricing`: Subscription plans and features.
- `/auth`: Sign-in/Sign-up flow.
- `/investigations`: (Module 4) Ops/performance data (admin only).
- `/api/public/*`: Public endpoints.

## Major Components
- `Index`: Root route container.
- `HomeTopSections`: Hero, bento features, core value prop.
- `HeroVisual`: 3D-tilted image comparison preview.
- `CompareSlider`: Interactive before/after widget.
- `ProcessingOverlay`: Modal UI for active enhancement.
- `AnalysisCard`: Detailed visual metrics for processed images.
- `SiteFooter`: Global navigation and legal.

## Design System
- **Current DNA**: "Noir & Gold" / "Cinematic Noir" with Electric Blue (`oklch(0.65 0.2 250)`) accents.
- **Surface Strategy**: Glassmorphism (`backdrop-filter: blur(16px)`), subtle borders (`white/10`), and deep noir backgrounds (`oklch(0.12 0.02 250)`).
- **Shadows**: Custom `shadow-cinema` and `shadow-glow` for depth.

## Typography
- **Display**: Sora (700 weight, -0.03em tracking).
- **Sans/Body**: Manrope.
- **Status**: Inter/Space Grotesk (utility usage).
- **Scale**: Large hero display (8rem/9vw), medium headings (3xl/4xl), small body (text-sm/text-base).

## Colors (oklch)
- **Background**: `oklch(0.12 0.02 250)` (Deep Noir).
- **Foreground**: `oklch(0.98 0.01 250)` (Off-white).
- **Primary**: `oklch(0.65 0.2 250)` (Electric Blue).
- **Accent**: `oklch(0.75 0.15 190)` (Electric Cyan).
- **Borders**: `oklch(0.22 0.02 250)` / `white/10`.

## Spacing
- Current: Uses Tailwind defaults with custom `stagger-in` delays. Large hero margins (`mt-24/32`).
- Need: Coherent elite spacing scale (Precision).

## Navigation
- Floating frosted pill (refactored previously).
- Fixed footer.

## Hero
- 3D perspective frame with interactive comparison.
- Multi-scenario switching (landscape, face, portrait).
- "Noir & Gold" typography.

## Upload Experience
- Large dropzone/workspace area.
- Progressive file validation.
- Background engine warming.

## Enhancement UI
- Local processing focus.
- Predictive progress bars.
- Real-time stage updates.

## Comparison UI
- Custom `CompareSlider` with keyboard support.
- Group-hover zoom effects.

## Pricing
- Focused on $3.99/mo plan.
- Bento-style layout.

## Dialogs / Modals
- `UpgradeWall`: Subscription conversion point.
- `ProcessingOverlay`: Full-screen context during AI work.

## Mobile Experience
- Responsive grid adjustments (stacking `HeroVisual`).
- Touch support for sliders.

## Animations
- `animate-tilt`: Slow perspective rotation.
- `animate-scan`: Vertical scanline effect.
- `animate-hero-in`: Fade-blur entry.
- `gravity-float`: Hero element drift.

## Technical Constraints
- **SSR Safety**: Must guard ML/onnxruntime imports.
- **Bundle Size**: 680KB target.
- **Privacy**: Local-first processing (browser-only).

## Visual Inconsistencies
- Mix of `white/10` and `oklch` borders.
- Variable border-radii (`rounded-2xl` vs `rounded-[2.5rem]`).
- Hover states differ between primary buttons and card-links.

## Acceptance Criteria for Phase 1
- One coherent source of truth for design tokens.
- Transition from "Noir & Gold" to "Obsidian Precision" (Elite Grey/Steel/Blue).
- Centralized motion tokens.
- Hardcoded color cleanup.
