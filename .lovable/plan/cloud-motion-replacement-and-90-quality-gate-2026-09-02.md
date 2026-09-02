# Cloud Motion Replacement and 90+ Quality Gate

## Goal

Remove the entire “UNBOUND GRAVITY / NEURAL ARCHITECTURE V.04 / SCALE: 8K / PRIVATE” experience and replace it with a refined cloud-based animated section that fits the existing Obsidian Precision visual system without changing the enhancement engine or backend.

## Implementation

- Delete the obsolete gravity component and remove its homepage import/render path.
- Build a lightweight, responsive cloud-motion scene using layered CSS transforms, restrained depth, and scroll/pointer response only where it improves the experience.
- Reuse semantic design tokens, avoid decorative text claims, keep animation compositor-friendly, and provide a static/reduced-motion presentation.
- Refine the existing floating atmosphere so both cloud experiences feel intentional rather than duplicated, while preserving the existing “4K images uploaded” element.
- Remove unused gravity CSS and consolidate the new movement into named motion primitives.

## Quality and Accessibility

- Keep decorative clouds hidden from assistive technology and non-interactive.
- Prevent layout shifts and horizontal overflow across desktop and mobile.
- Respect `prefers-reduced-motion`, touch input, and devices without hover.
- Resolve any current TypeScript issue if reproducible; the checked-in `src/lib/utils.ts` currently has only six lines and the latest preview build reports clean, so the reported line-8 error will be treated as stale unless verification reproduces it.
- the final test should be done for accessability ,speed and performanece in light house or other optimizers and i want the 90+ benchmarks score on each category , dont stop until completeif it does not match 90 or 90+ than continue the loop until proven and give me unbaised report and ruthless and strict that it has scored above 90 or 90+ with clear cut eveidences no assumptions allowed 

## Verification

- Run targeted type, lint, and browser checks after implementation.
- Use Playwright on desktop and mobile to verify visual rendering, scroll motion, reduced-motion behavior, overflow, console/runtime errors, and core homepage navigation.
- Run Lighthouse against the local production-like app and record actual Performance and Accessibility scores. Iterate on issues attributable to this change; report measured results honestly and do not claim 90+ unless the audits produce it.
- Incorporate the independent findings from Ali (performance), John (accessibility), and Muhammad (browser/testing) before final acceptance.