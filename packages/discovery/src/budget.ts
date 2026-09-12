/**
 * What the agent is allowed to spend, and what it has spent.
 *
 * @remarks
 * Deliberately not the agent's judgement. The model decides what a purchase is *worth*; this
 * decides what is *permitted*, and it wins. An agent that can talk itself past its own spending
 * limit does not have a spending limit — so every purchase passes through `reserve`, which is
 * arithmetic, not persuasion.
 */
export class Budget {
  private spentBaseUnits = 0n;

  constructor(
    /** Total the agent may spend across this question, in the asset's smallest units. */
    readonly limitBaseUnits: bigint,
    readonly asset: string = "0.0.0",
  ) {
    if (limitBaseUnits < 0n) throw new Error("budget cannot be negative");
  }

  get spent(): bigint {
    return this.spentBaseUnits;
  }

  get remaining(): bigint {
    return this.limitBaseUnits - this.spentBaseUnits;
  }

  canAfford(costBaseUnits: bigint): boolean {
    return costBaseUnits <= this.remaining;
  }

  /**
   * Commit spend against the budget.
   *
   * @throws if the purchase would exceed the limit. Callers are expected to have checked
   *   `canAfford` first; this throwing is the backstop, not the control flow.
   */
  reserve(costBaseUnits: bigint): void {
    if (costBaseUnits < 0n) throw new Error("cost cannot be negative");
    if (!this.canAfford(costBaseUnits)) {
      throw new BudgetExceededError(costBaseUnits, this.remaining);
    }
    this.spentBaseUnits += costBaseUnits;
  }
}

export class BudgetExceededError extends Error {
  constructor(
    readonly requested: bigint,
    readonly remaining: bigint,
  ) {
    super(`purchase of ${requested} exceeds remaining budget of ${remaining}`);
    this.name = "BudgetExceededError";
  }
}
