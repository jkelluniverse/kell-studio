import type { AIAdapter, ProposedFact } from "./types";

export interface FakeAI extends AIAdapter {
  /** Proposals the next extraction returns; set per test. */
  nextProposals: ProposedFact[];
  /** When true, the next extraction throws. */
  failNext: boolean;
  calls: string[];
}

export function createFakeAI(nextProposals: ProposedFact[] = []): FakeAI {
  const fake: FakeAI = {
    nextProposals,
    failNext: false,
    calls: [],
    async extractFacts({ captureBody }) {
      fake.calls.push(captureBody);
      if (fake.failNext) {
        fake.failNext = false;
        throw new Error("fake AI failure");
      }
      return fake.nextProposals;
    },
  };
  return fake;
}
