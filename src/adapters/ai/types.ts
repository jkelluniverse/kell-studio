// The AI adapter contract. One capability in KS-05: propose facts from a
// capture. The adapter returns raw proposals; the service layer validates
// excerpts and writes rows — model output never becomes graph state
// directly.
import type { FactKind } from "@prisma/client";

export interface ProposedFact {
  kind: FactKind;
  /** One plain-English sentence. */
  body: string;
  /** Verbatim substring of the capture body that grounds the fact. */
  excerpt: string;
}

export interface AIAdapter {
  extractFacts(input: {
    captureBody: string;
    /** One line of context, e.g. "Project: Site Rebuild for Acme Co". */
    projectContext: string;
  }): Promise<ProposedFact[]>;
}
