// Capability registry.
//
// Pure in-memory map, deterministic iteration order (insertion order). The
// registry is populated once at module load via `builtins.ts` and is safe to
// import from any module (no DOM, no side effects beyond the map).

import type { CapabilityDescriptor, FeatureFlag } from "./types";

const REGISTRY = new Map<string, CapabilityDescriptor>();
let frozen = false;

export function registerCapability(desc: CapabilityDescriptor): void {
  if (frozen) {
    if (import.meta.env?.DEV) {
      console.warn(`[capabilities] registry frozen; ignoring ${desc.id}`);
    }
    return;
  }
  if (REGISTRY.has(desc.id) && import.meta.env?.DEV) {
    console.warn(`[capabilities] duplicate registration: ${desc.id}`);
  }
  REGISTRY.set(desc.id, Object.freeze({ ...desc, requires: [...desc.requires] }));
}

export function freezeRegistry(): void { frozen = true; }

export function getCapability(id: string): CapabilityDescriptor | undefined {
  return REGISTRY.get(id);
}

export function listCapabilities(): CapabilityDescriptor[] {
  return Array.from(REGISTRY.values());
}

/** Filter capabilities by whether every required feature is present. */
export function capabilitiesFor(available: ReadonlySet<FeatureFlag>): CapabilityDescriptor[] {
  return listCapabilities().filter((c) => c.requires.every((f) => available.has(f)));
}

/** Test-only. */
export function __resetRegistryForTests(): void {
  REGISTRY.clear();
  frozen = false;
}
