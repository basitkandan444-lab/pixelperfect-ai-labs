// .lovable/plan.md

# UI Redesign Plan — Pixel Perfect Pro

Recreating the entire UI from zero to deliver an elite, modern, responsive, and accessible "Noir & Gold" experience inspired by Apple, Stripe, and Google Gemini.

## 1. Design System & Theme
Update `src/styles.css` to refine the Noir & Gold aesthetic.
- **Background**: Absolute Noir (`oklch(0.08 0 0)` or deep carbon).
- **Primary**: Metallic Gold (`oklch(0.75 0.113 85)`).
- **Secondary**: Deep Onyx (`oklch(0.12 0 0)`).
- **Typography**: Sora for headings, Manrope for body.
- **Glassmorphism**: Enhanced blur and border-hairlines for cards and panels.

## 2. Core Components Overhaul
Refactor existing presentation components to match the new visual direction.
- **CompareSlider**: Modernized with a sleek floating handle and subtle glow.
- **HomeTopSections**: A cinematic bento grid that serves as the site's command center.
- **HomeContent**: Rewritten to use high-contrast bento tiles for features and benefits.
- **SiteFooter**: A minimal, low-profile footer with clean typography.

## 3. Hero & Workspace Navigation
Redesign the main interface in `src/routes/index.tsx`.
- **Floating Pill Nav**: An Apple-style frosted floating navigation.
- **Cinematic Hero**: Large, bold typography with a gold shimmer effect.
- **Integrated Workspace**: The upload zone and preview area will be merged into a seamless, high-performance dashboard view.

## 4. Performance & Accessibility
- Ensure all color contrasts meet WCAG AA standards.
- Maintain the **Browser-First** invariant (zero server processing).
- Optimize for high-DPI displays with ultra-sharp vector icons and high-quality image previews.

## 5. Technical Improvements
- Implement robust error boundaries for the local AI engine.
- Add descriptive `aria-labels` to all interactive elements for screen readers.
- Ensure the floating pill navigation remains usable across all mobile device form factors.

---

### Instructions for the Redesign
1. Update `src/styles.css` with the new design tokens.
2. Refactor `src/components/HomeTopSections.tsx` and `src/components/HomeContent.tsx` with a new bento grid layout.
3. Clean up and polish `src/routes/index.tsx` for a more "Gemini-like" interface.
4. Update `src/components/SiteFooter.tsx`.
