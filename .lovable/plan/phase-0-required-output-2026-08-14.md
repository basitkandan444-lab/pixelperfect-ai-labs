**⚡ COMMAND CELL UPDATE — PHASE 0 MUST BECOME A FULL PRODUCT FORENSICS GATE**

Do **not** advance to Phase 1 merely because a few design-token inconsistencies were identified. Phase 0 is considered passed only after the team has completed a full forensic audit of the **entire user experience and implementation surface**.

**JOHN — Orchestrating:** map the complete product dependency graph before implementation begins. Identify the critical user journey from landing → understanding the product → upload → enhancement → result → compare → download → pricing → upgrade → checkout → premium activation. Identify every component, route, server function, external dependency, state transition and design dependency involved in that journey. Establish the highest-impact problems first.

**ELLIE — Creative Director:** perform a complete visual and UX audit, not only a token audit. Inspect navigation, hero, CTA hierarchy, typography, spacing, color, surfaces, cards, pricing, upload interaction, processing state, enhancement result, compare experience, dialogs, forms, empty states, error states, loading states, footer, mobile layout and responsive transitions. Identify what feels generic, outdated, fragmented, visually noisy, copied from generic SaaS patterns, or inconsistent with a premium image-enhancement product. Specifically evaluate whether the existing interface communicates the transformation promise within seconds.

**SMITH — Frontend Architecture:** identify all duplicated design tokens, hardcoded values, component fragmentation, duplicated UI logic, inconsistent component APIs, unnecessary dependencies, animation implementations, CSS complexity, client-side rendering costs and architectural changes required to create one coherent reusable design system. Do not start rewriting everything blindly. Produce a migration map first.

**ELON — QA / Performance / Observability:** actively attempt to break the current interface before redesign begins. Audit console errors, layout shifts, slow renders, large bundles, excessive JavaScript, image loading, hydration, responsiveness, keyboard navigation, touch targets, reduced-motion behavior, accessibility and browser compatibility. Establish a baseline so later improvements can be measured rather than merely claimed.

**ALEX — Independent Reviewer:** independently inspect the findings and reject superficial conclusions. Search for problems the other agents missed. Confirm that the audit covers the actual product journey rather than only CSS files. Do not allow Phase 1 to begin until the forensic map is sufficiently complete.

### PHASE 0 REQUIRED OUTPUT

Create a durable **DESIGN FORENSICS REPORT** with these sections:

1. **Current Product Experience Map**
2. **Critical User Journey**
3. **Visual Debt**
4. **UX Debt**
5. **Component Architecture Debt**
6. **Responsive/Mobile Debt**
7. **Accessibility Debt**
8. **Performance Debt**
9. **Motion/Interaction Debt**
10. **Conversion/Pricing Debt**
11. **Enhancement-Experience Debt**
12. **Content/Copy Hierarchy Debt**
13. **Design-System Debt**
14. **Technical Constraints**
15. **Dependencies and Risks**
16. **Top 20 Highest-Impact Problems**
17. **Quick Wins**
18. **Deep Refactors**
19. **Problems That Must NOT Be Changed**
20. **Baseline Performance Metrics**
21. **Baseline Accessibility Findings**
22. **Baseline Visual Screenshots/States Where Available**
23. **Recommended Design Architecture**
24. **Phase 1 Implementation Order**

Each problem must have:

`ID → LOCATION → PROBLEM → USER IMPACT → TECHNICAL IMPACT → SEVERITY → ROOT CAUSE → RECOMMENDED FIX → OWNER → VERIFICATION METHOD`

### PHASE 0 ACCEPTANCE RULE

Do **not** report:

> “Phase 0 PASSED”

simply because the token system was inspected.

Phase 0 passes only when:

**the complete product experience has been mapped, the highest-impact visual/UX/technical problems have been identified, baseline measurements exist, dependencies are understood, and Alex independently approves the findings.**

### USER UPDATE FORMAT

After each major discovery batch, provide a concise command-center update:

**ACTIVE TEAM**  
John — Orchestrating  
Ellie — Auditing UX/Visuals  
Smith — Auditing Architecture  
Elon — Auditing QA/Performance  
Alex — Independently Reviewing

**DISCOVERED**  
Meaningful problems found.

**WHAT IT MEANS**  
Why those problems matter to the user.

**CHANGED**  
Only actual changes already made.

**VERIFIED**  
What has been independently tested.

**BLOCKED**  
Anything preventing advancement.

**NEXT**  
The exact next work package.

Do not provide empty status updates such as “still working.” Every update must communicate a real discovery, decision, change, verification result or blocker.

### CRITICAL PRODUCT RULE

The redesign is not successful because it looks premium.

The redesign is successful when the entire experience communicates:

**UPLOAD → TRANSFORM → SEE THE DIFFERENCE → TRUST THE RESULT → DOWNLOAD → UPGRADE**

with exceptional clarity, visual quality, speed and reliability.

Phase 1 may begin only after this forensic gate is genuinely complete.