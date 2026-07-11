// Build-time constants injected by Vite `define` (see vite.config.ts).
// They are replaced with string literals at build time. In environments where
// the define is not applied (e.g. Vitest), `typeof` guards fall back safely —
// `typeof <undeclared>` returns "undefined" without throwing.

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;
