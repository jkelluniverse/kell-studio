// The public surface of the data layer. No unscoped escape hatch is
// exported — if a future prompt needs cross-tenant access it will add an
// explicitly named function then.
export { forTenant, getRootTenant } from "./scoped";
export {
  createFact,
  confirmFact,
  retireFact,
  recordDecision,
  setPhaseStatus,
  createReminder,
  createDocument,
  CitationRequiredError,
  RationaleRequiredError,
  DomainRuleError,
} from "./domain";
