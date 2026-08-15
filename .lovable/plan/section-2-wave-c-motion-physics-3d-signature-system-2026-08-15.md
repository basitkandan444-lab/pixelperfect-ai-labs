# SECTION 2 — WAVE C: MOTION, PHYSICS & 3D SIGNATURE SYSTEM

**MISSION:** Transform the current interaction foundation into a deliberate, reusable motion language for Pixel Perfect Pro. Implement a finite set of high-quality interactions rather than adding animation everywhere. Every motion must improve understanding, feedback, spatial continuity, transformation, precision or delight. Preserve all existing functionality and keep the enhancement engine frozen.

**TEAM:** JOHN — orchestration and sequencing; ELLIE — motion art direction; SMITH — implementation architecture; MAYA — UX behavior; NOVA — physics and choreography; ATLAS — touch/accessibility/reduced motion; ELON — performance/QA; ALEX — independent review. Use focused sub-tasks when useful, but report only actual work and evidence.

**MASTER LOOP:** For each motion target use `INSPECT → DEFINE → IMPLEMENT → RUN → VERIFY → REVIEW → FIX → RE-VERIFY → ACCEPT`. Never mark a motion complete because code exists. A target is complete only when its runtime behavior, user purpose, accessibility, responsiveness and performance criteria pass.

**MOTION #1 — MAGNETIC PULL:** Location: primary CTA buttons in Hero, Workspace and Pricing. Trigger: pointer enters proximity. Behavior: subtle position attraction toward the pointer with bounded displacement and smooth spring return. Purpose: increase tactile responsiveness and draw attention without stealing control. Mobile fallback: standard hover/press-free interaction. Reduced-motion fallback: no attraction, only state styling. Performance: transform-only. Acceptance: attraction is subtle, predictable and never causes mis-clicks.

**MOTION #2 — PRESS COMPRESSION:** Location: primary and important secondary buttons. Trigger: pointer press or touch press. Behavior: restrained scale compression followed by spring return. Purpose: create tactile confirmation. Mobile fallback: same press response without hover assumptions. Reduced-motion fallback: instant state change. Acceptance: immediate feedback, no layout shift.

**MOTION #3 — SPRING RETURN:** Location: buttons, draggable controls and selected cards. Trigger: release after movement/press. Behavior: controlled spring settling with limited overshoot. Purpose: create physical continuity. Acceptance: no excessive bounce or delayed interaction.

**MOTION #4 — CURSOR PROXIMITY GLOW:** Location: HeroVisual and selected high-value CTAs. Trigger: pointer proximity. Behavior: soft local light follows pointer with smoothing and bounded range. Purpose: reinforce spatial awareness. Mobile fallback: remove effect. Reduced-motion fallback: static surface state. Acceptance: subtle, performant, visually coherent.

**MOTION #5 — HERO PARALLAX DEPTH:** Location: HeroVisual layers. Trigger: pointer movement and optional scroll. Behavior: different depth layers move at different small amplitudes. Purpose: create depth hierarchy. Mobile fallback: static layered composition. Acceptance: content remains readable and interaction never interferes with CTA.

**MOTION #6 — HERO PERSPECTIVE TILT:** Location: HeroVisual main object. Trigger: pointer position. Behavior: limited X/Y rotation with damping and spring settling. Purpose: create controlled 3D depth. Mobile fallback: disabled or extremely subtle. Reduced-motion fallback: static. Acceptance: stable, bounded, no jitter, no interaction blocking.

**MOTION #7 — AMBIENT ORBITAL DRIFT:** Location: noninteractive background elements around the hero. Trigger: continuous low-speed ambient motion. Behavior: extremely slow spatial drift/orbit with fixed bounds. Purpose: add life without demanding attention. Reduced-motion fallback: static. Acceptance: must not compete with content or increase noticeable CPU/GPU load.

**MOTION #8 — FILE SWALLOW:** Location: Upload/Dropzone. Trigger: file enters valid drag-over state or is selected. Behavior: preview transitions into the workspace with controlled scale, depth and opacity choreography. Purpose: make the file feel physically accepted. Mobile fallback: polished selection transition. Acceptance: animation reflects actual file acceptance and never delays interaction.

**MOTION #9 — WORKSPACE MORPH:** Location: Upload workspace from Idle → Selected → Analysis. Trigger: real state transition. Behavior: shared container/layout morphs rather than hard switching between disconnected views. Purpose: create continuity. Acceptance: no layout jump and state remains immediately understandable.

**MOTION #10 — LIQUID PROGRESS:** Location: ProcessingOverlay progress indicator. Trigger: actual progress/state changes only. Behavior: smooth easing and restrained flow around the real progress value. Purpose: communicate active processing. Acceptance: never invent progress or imply unsupported AI activity.

**MOTION #11 — PROCESS STAGE CHOREOGRAPHY:** Location: ProcessingOverlay stage labels and supporting visuals. Trigger: actual processing state changes. Behavior: outgoing state exits while incoming state enters through coordinated timing. Purpose: make real state transitions legible. Acceptance: state ordering matches application logic exactly.

**MOTION #12 — BLUR-TO-SHARP REVEAL:** Location: final enhanced result image. Trigger: actual result availability. Behavior: restrained blur/opacity transition into the final image. Purpose: visually communicate transformation. Acceptance: no fake result and no user-access delay.

**MOTION #13 — SPRING RESULT ARRIVAL:** Location: result container / workspace result panel. Trigger: actual result state. Behavior: controlled depth + scale + opacity arrival with smooth settling. Purpose: make completion feel meaningful. Acceptance: usable immediately after arrival.

**MOTION #14 — MAGNETIC COMPARE HANDLE:** Location: CompareSlider handle. Trigger: pointer/touch proximity. Behavior: tiny affordance response before dragging and restrained state emphasis while active. Purpose: improve discoverability. Mobile fallback: clear touch handle and visual emphasis. Acceptance: never affects slider precision.

**MOTION #15 — FRICTION DRAG:** Location: CompareSlider. Trigger: active drag. Behavior: controlled movement with slight resistance near boundaries. Purpose: improve tactile precision. Acceptance: exact position remains predictable across touch, mouse and keyboard.

**MOTION #16 — SNAP/SETTLE:** Location: CompareSlider. Trigger: drag release. Behavior: minimal spring settling only when beneficial, never changing the user's intended final position unexpectedly. Purpose: polished completion feedback. Acceptance: final comparison position remains trustworthy.

**MOTION #17 — SPOTLIGHT TRACKING:** Location: selected feature/value cards only. Trigger: hover/focus. Behavior: subtle local highlight or surface emphasis follows interaction. Purpose: direct attention without adding layout changes. Mobile fallback: active/focus state. Acceptance: restrained and consistent.

**MOTION #18 — DEPTH LIFT:** Location: feature cards, pricing cards and selected interactive surfaces. Trigger: hover/focus. Behavior: tiny elevation/transform response with shadow refinement. Purpose: communicate interactivity and hierarchy. Acceptance: no card floating that disrupts reading flow.

**MOTION #19 — SCROLL REVEAL:** Location: major content sections. Trigger: section entering viewport. Behavior: shared reveal pattern using opacity, translation and subtle depth. Purpose: introduce content progressively. Acceptance: reusable system, not one-off animations for every component.

**MOTION #20 — CINEMATIC SECTION TRANSITION:** Location: transitions between major landing-page chapters. Trigger: natural scroll progression. Behavior: restrained spatial continuity using shared depth and opacity relationships. Purpose: make the page feel like one continuous experience. Acceptance: does not hijack scrolling or create motion fatigue.

**3D SIGNATURE #1 — HERO SPATIAL TILT:** Combine limited perspective, layered depth, cursor proximity light and spring settling into the flagship HeroVisual interaction. Preserve static fallback and reduced motion.

**3D SIGNATURE #2 — FLOATING TRANSFORMATION OBJECT:** Create one hero/workspace 3D object or layered image presentation with subtle gravity-like floating, parallax and spring settling. It must reinforce image transformation rather than behave as decorative 3D art.

**3D SIGNATURE #3 — 3D COMPARE STAGE:** Add restrained spatial separation between Before and After layers inside the comparison experience while keeping the slider precise. 3D depth must never alter the actual comparison geometry or accessibility model.

**ARCHITECTURE:** Centralize reusable motion primitives, variants, springs, timing and interaction constants. Prefer existing motion infrastructure. Avoid introducing unnecessary dependencies. Prefer transform/opacity for performance. Use WebGPU/3D effects only where justified by the specific interaction.

**RESPONSIVE RULE:** Every pointer-based interaction must have a deliberate touch fallback. Hover must never be required for understanding. Mobile may use simplified effects. Reduced-motion users receive meaningful state changes without nonessential movement.

**PERFORMANCE RULE:** Do not promise universal frame-rate numbers. Measure representative devices and record actual results. Avoid layout-triggering animation, excessive blur, large repaint regions and simultaneous heavy 3D effects. Reduce effects on constrained devices.

**ACCESSIBILITY RULE:** Verify keyboard, focus, touch, contrast and reduced-motion behavior for every interactive target. Motion cannot be required to understand or operate the product.

**PRESERVATION LOCK:** Do not modify the enhancement engine, image-processing algorithms, ONNX/GFPGAN/WebGPU/WASM inference, Paddle backend, Supabase billing or unrelated infrastructure. UI presentation may respond to real application state but may not change underlying processing logic.

**PROOF REQUIREMENTS:** For every motion target record `NAME → LOCATION → TRIGGER → ACTUAL BEHAVIOR → USER PURPOSE → DESKTOP BEHAVIOR → MOBILE FALLBACK → REDUCED-MOTION FALLBACK → PERFORMANCE OBSERVATION → ACCESSIBILITY RESULT → BEFORE/AFTER EVIDENCE → REVIEW DECISION`.

**ELON GATE:** Verify actual runtime behavior, console/runtime errors, responsive behavior, keyboard interaction, touch interaction, reduced motion, layout stability and performance. Record evidence, not subjective claims.

**ALEX GATE:** Independently review whether each interaction is purposeful, restrained, coherent, tactile, spatially convincing and distinctly Pixel Perfect Pro. Reject anything that feels like generic animation, visual noise, fake physics or a template effect.

**ACCEPTANCE:** Wave C is accepted only when every selected motion target passes its own acceptance criteria, the motion system is coherent, mobile behavior is valid, accessibility works, performance remains acceptable, evidence exists, and Alex independently approves. Any failed target returns to the repair loop.

**REPORTING:** After each meaningful milestone report `ACTIVE TEAM → TARGETS COMPLETED → DISCOVERED → ACTUAL CHANGES → USER IMPACT → VERIFIED → BLOCKERS → ALEX DECISION → NEXT`.

**FINAL PRINCIPLE:** Build fewer interactions exceptionally well. The end result should feel like a precision instrument with motion, not an animated website.