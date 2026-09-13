/**
 * The model-free half of Tollgate: find services by ENS name, price them, and hold a budget.
 *
 * Extracted from `@tollgate/agent` so that code which only needs arithmetic — the SDK above all —
 * does not install or load a model client to get it. Nothing in this package calls a model, takes a
 * model credential, or imports one; its only runtime dependency is viem.
 */
export { Budget, BudgetExceededError } from "./budget.js";
export { EnsDirectory, type Directory, type EnsDirectoryConfig } from "./directory.js";
export {
  UnpriceableCandidateError,
  affordablePlans,
  formatAmount,
  isFlatFee,
  planSet,
  priceOf,
  toBaseUnits,
  type PlanSet,
} from "./policy.js";
export type { Candidate, Plan } from "./types.js";
