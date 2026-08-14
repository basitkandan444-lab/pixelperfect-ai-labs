# IMAX Enhancement Engine Protocol (10-System Loop)

## Phase 1: Engine Overhaul (The IMAX Pipeline)

We are replacing the current "placeholder" and "gentle" filters with a high-fidelity reconstruction loop.

### 1. Verification System (Forensic Verification)
Every enhancement step MUST produce a measurable improvement in PSNR/SSIM. If `verifyStage` returns `ok: false`, the pipeline automatically adjusts parameters and retries.

### 2. Neural Upscaling (WebGPU)
We use **Real-ESRGAN x4 Plus** (or v3) with high-density tiling to avoid memory bottlenecks while maintaining edge sharpness.

### 3. Face Restoration (GFPGAN)
The `faceRestore` stage is fully wired. We load a 40MB GFPGAN model to reconstruct human features to IMAX clarity.

### 4. Color Pipeline (Oklab)
Contrast and color are handled in Oklab space to prevent hue shifting.
- **CLAHE**: Local contrast lift.
- **Vibrance**: Skin-safe color boost.

### 5. Detail Injection (Micro-Contrast)
Gradient-gated micro-contrast injection to simulate IMAX camera texture.

### 6. Denoising (Bilateral/Non-Local Means)
Edge-preserving noise reduction to remove sensor artifacts.

### 7. Sharpness System (Unsharp/Crispen)
Two-scale sharpening matched to the upscale factor.

### 8. Cloud Fallback (Quality Buffer)
If local WebGPU resources are insufficient for IMAX quality, we route via a "Cloud Fallback" (free API or server-side Sharp/AI) for the final 5% of polish.

### 9. Latency Management
Async scheduler with UI-thread yielding to keep the browser responsive during heavy IMAX processing.

### 10. Recursive Loop
The plan is re-evaluated after the first pass. If the delta is not "IMAX-grade," the parameters are bumped by 15% and re-run.

---

## Implementation Plan

1. **Refactor `src/lib/enhance/premium/pipeline.ts`** to enforce high-strength defaults.
2. **Implement `src/lib/enhance/premium/intelligence/analyzer.ts`** to be more aggressive in detecting quality gaps.
3. **Update `src/lib/enhance/neural.ts`** to use high-quality resamplers even on fallbacks.
4. **Wire GFPGAN** fully in `src/lib/enhance/premium/models/restore.ts`.
