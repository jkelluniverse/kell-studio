import type { Config } from "tailwindcss";

// Brand values mirror src/lib/brand.ts — Tailwind config cannot import from
// src (it is loaded by PostCSS outside the app graph), so the hex codes are
// stated here verbatim. Exact values, do not round.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F0",
        navy: "#142A3B",
        emerald: "#0C8A5B",
        rust: "#A6432D",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        ui: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
