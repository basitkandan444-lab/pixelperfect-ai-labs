/**
 * Obsidian Precision™ Motion Primitives
 * Standardized spring configurations and timing for the signature interaction system.
 */

export const SPRINGS = {
  // Snappy but smooth - ideal for hovers and small UI elements
  snappy: { type: "spring", stiffness: 400, damping: 30, mass: 1 },
  // Tactile and physical - for larger card lifts or modal arrivals
  tactile: { type: "spring", stiffness: 300, damping: 20, mass: 1.2 },
  // Smooth and elegant - for reveals and transitions
  elegant: { type: "spring", stiffness: 200, damping: 25, mass: 1 },
  // Heavy and meaningful - for result arrival
  heavy: { type: "spring", stiffness: 150, damping: 15, mass: 2 },
} as const;

export const DURATIONS = {
  fast: 0.15,
  standard: 0.3,
  slow: 0.6,
  reveal: 0.9,
} as const;

export const EASES = {
  precision: [0.16, 1, 0.3, 1], // ease-expo-out
  back: [0.34, 1.56, 0.64, 1], // ease-back-out
} as const;
