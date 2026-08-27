// Kell Systems brand tokens. Exact values — do not round.
export const CREAM = "#FAF7F0"; // page background
export const NAVY = "#142A3B"; // primary text, headings
export const EMERALD = "#0C8A5B"; // accent, primary action
// KS-03 DECISION: the "warm red-brown" blocked/overdue token. Picked a muted
// rust that sits naturally next to navy on cream without reading as an
// error-red alarm. Used for BLOCKED phase chips and overdue milestone dates.
export const RUST = "#A6432D";

// Font family names (loaded via next/font/google in src/app/layout.tsx).
export const FONT_DISPLAY = "Fraunces"; // display / headings
export const FONT_UI = "Sora"; // UI labels, nav, buttons
export const FONT_BODY = "Inter"; // body

// Signature phrase — used exactly, never paraphrased.
export const SIGNATURE = "Built to subtract.";

// Product-name placeholders (spec §8.4) — use these constants in UI copy,
// never hardcode the words.
export const NAME_STUDIO = "Studio";
export const NAME_CLIENT_PORTAL = "Client Portal";
