import type { AIAdapter } from "./types";
import { createAnthropicAI } from "./anthropic";
import { createFakeAI } from "./fake";

export type { AIAdapter, ProposedFact } from "./types";
export { EXTRACTION_PROMPT } from "./anthropic";

const globalStore = globalThis as unknown as { __studioAI?: AIAdapter };

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Anthropic when configured; a canned fake otherwise (dev only). */
export function getAI(): AIAdapter {
  if (!globalStore.__studioAI) {
    globalStore.__studioAI = aiConfigured()
      ? createAnthropicAI()
      : createFakeAI([
          {
            kind: "GOAL",
            body: "This is a canned dev-mode fact; set ANTHROPIC_API_KEY for real extraction.",
            excerpt: "",
          },
        ]);
  }
  return globalStore.__studioAI;
}
