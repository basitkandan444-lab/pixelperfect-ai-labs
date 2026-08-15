# Obsidian Precision™ Wave B — Visual Refinement & Proof

Refine the existing **Obsidian Precision™** system across the UI to reach a visibly exceptional, production-grade state. Focus on consistency, hierarchy, and mobile fidelity.

## 1. Foundation & Typography Refinement
- **Text Ratios**: Audit `h1`, `h2`, `h3` and `text-display` across mobile/desktop. Ensure `clamp` values don't break hierarchy on small screens.
- **Eyebrow Synchronization**: Normalize `eyebrow` utility usage across all sections (Hero, Bento, Gallery, Pricing).
- **Surface Depth**: Refine `oklch` surface tokens to ensure clear visual separation between background, cards, and modal elements.

## 2. Component Refinement
- **Buttons**: Unify `Button` variants. Ensure `obsidian` and `glass` variants have consistent hover/active states across all routes.
- **Cards**: Normalize `card-premium` and `Card` primitive usage. Remove redundant card layouts in `HomeTopSections.tsx` and `HomeContent.tsx`.
- **Navigation**: Refine the floating `PageHeader` for mobile—ensure tap targets are accessible and the backdrop blur is optimized.
- **Comparison Slider**: Add micro-interactions to the drag handle and ensure labels are perfectly aligned.

## 3. Responsive & Accessibility Refinement
- **Hero Composition**: Fix text wrapping on mobile (390px). Ensure the `HeroVisual` 3D tilt is disabled or extremely subtle on touch devices to prevent jank.
- **Bento Grid**: Optimize the `HomeTopSections` layout for tablet (768px) and mobile.
- **Accessibility**: Verify focus rings on all interactive elements. Ensure sufficient contrast for `muted-foreground` text.

## 4. Interaction & Motion
- **Precision Motion**: Standardize `reveal` animations for scroll entry.
- **Loading States**: Refine `ProcessingOverlay` to match the Obsidian aesthetic (remove legacy spinner remnants, use high-precision progress bar).
- **Hover/Focus**: Ensure every interactive surface has a distinct, high-fidelity response.

## Technical Tasks
- [ ] Audit `src/styles.css` for redundant legacy Noir/Gold classes.
- [ ] Refactor `HomeTopSections.tsx` to use `Card` primitives where possible.
- [ ] Implement `reveal-in` observer for scroll-triggered entry in `index.tsx`.
- [ ] Optimize `CompareSlider.tsx` for mobile performance.
- [ ] Record "Wave B Accepted" state in design report.

## Verification Gate (ELON & ALEX)
- **ELON**: Build/Lint/Typecheck + Mobile responsiveness check (390px, 768px, 1280px).
- **ALEX**: Independent review of visual hierarchy, restraint, and "Premium" feel.
