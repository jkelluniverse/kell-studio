// Anthropic fact extraction — written fresh for Studio (the prompt and
// shape are Studio-specific; nothing here is ported).
import Anthropic from "@anthropic-ai/sdk";
import type { AIAdapter, ProposedFact } from "./types";

const FACT_KINDS = [
  "PREFERENCE",
  "CONSTRAINT",
  "VOCABULARY",
  "FEAR",
  "GOAL",
  "TOOL",
  "PERSON",
] as const;

// The whole extraction prompt, in one reviewable constant.
export const EXTRACTION_PROMPT = `You extract facts from a consultant's raw project notes. A "fact" is a single piece of confirmed knowledge about the client or project that the note actually states.

Rules:
- Extract ONLY what the note actually says. No inference beyond the text, no guesses, no filling in what is merely implied.
- Each fact is ONE plain-English sentence, written to stand alone (name the subject; no dangling "they" if the note names who).
- kind is exactly one of: PREFERENCE (what they like or dislike), CONSTRAINT (a hard limit — budget, deadline, requirement), VOCABULARY (a term they use and what they mean by it), FEAR (a worry or thing to avoid), GOAL (an outcome they want), TOOL (software or service they use), PERSON (a person and their role).
- excerpt is a VERBATIM substring copied character-for-character from the note that grounds the fact. Do not paraphrase, trim words mid-sentence, or fix typos in the excerpt.
- 0 to 8 facts. An empty list is a normal, correct answer for a note with nothing factual in it.
- Skip to-dos, opinions of the consultant, and anything about the consultant's own work plan — facts are about the client and their world.

Respond with ONLY a JSON array, no prose, no code fences:
[{"kind": "...", "body": "...", "excerpt": "..."}]`;

function parseProposals(text: string): ProposedFact[] | null {
  // Tolerate stray fences or prose around the array without weakening the
  // shape requirements inside it.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const facts: ProposedFact[] = [];
  for (const item of parsed) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).body === "string" &&
      typeof (item as Record<string, unknown>).excerpt === "string" &&
      FACT_KINDS.includes((item as Record<string, unknown>).kind as never)
    ) {
      const it = item as { kind: ProposedFact["kind"]; body: string; excerpt: string };
      facts.push({ kind: it.kind, body: it.body.trim(), excerpt: it.excerpt });
    }
  }
  return facts;
}

export function createAnthropicAI(): AIAdapter {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.AI_MODEL ?? "claude-opus-5";

  return {
    async extractFacts({ captureBody, projectContext }) {
      const request = {
        model,
        max_tokens: 4096,
        system: EXTRACTION_PROMPT,
        messages: [
          {
            role: "user" as const,
            content: `${projectContext}\n\nNote:\n${captureBody}`,
          },
        ],
      };
      const first = await client.messages.create(request);
      const firstText = first.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = parseProposals(firstText);
      if (parsed) return parsed;

      // One retry on malformed output, telling the model what went wrong.
      const second = await client.messages.create({
        ...request,
        messages: [
          ...request.messages,
          { role: "assistant" as const, content: firstText || "(empty)" },
          {
            role: "user" as const,
            content:
              "That was not a parseable JSON array. Respond again with ONLY the JSON array, nothing else.",
          },
        ],
      });
      const secondText = second.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const retried = parseProposals(secondText);
      if (!retried) throw new Error("extraction returned malformed output twice");
      return retried;
    },
  };
}
