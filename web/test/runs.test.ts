import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeStore,
  configureStore,
  getRun,
  listRuns,
  RunNotPersistedError,
  saveRun,
  type RunRecord,
  type RunsStore,
  type SaveRunInput,
} from "../src/runs.js";

/**
 * `saveRun()`'s whole point is that a write does not count until it has been read back. These
 * tests run against a real Postgres (`DATABASE_URL`, e.g. `docker run postgres` locally, or Neon in
 * CI) rather than a mock — a mock of the read path would only prove the mock agrees with itself.
 */
const DB_URL = process.env.DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const input = (over: Partial<SaveRunInput> = {}): SaveRunInput => ({
  id: randomUUID(),
  question: "what are the top uniswap pools right now?",
  budgetBaseUnits: 2_000_000n,
  spentBaseUnits: 1_000_000n,
  transactionId: "0.0.7162784@1789200000.000000000",
  status: "answered",
  answer: "the top pool is WETH/USDT with $116M TVL",
  ...over,
});

describeIfDb("saveRun, against a real database", () => {
  afterAll(async () => {
    await closeStore();
  });

  it("is readable back exactly as written, including a run with no purchase", async () => {
    const record = await saveRun(input());
    expect(record.status).toBe("answered");
    expect(record.spentBaseUnits).toBe(1_000_000n);

    const declined = input({
      status: "declined",
      spentBaseUnits: 0n,
      transactionId: null,
      answer: null,
    });
    const savedDeclined = await saveRun(declined);
    expect(savedDeclined.transactionId).toBeNull();
    expect(savedDeclined.spentBaseUnits).toBe(0n);

    const fetched = await getRun(declined.id);
    expect(fetched).toEqual(savedDeclined);
  });

  it("survives a reload — a fresh read seconds later returns the same record", async () => {
    const saved = await saveRun(input());
    await new Promise((r) => setTimeout(r, 50));
    const reread = await getRun(saved.id);
    expect(reread).toEqual(saved);
  });

  it("lists recent runs newest first", async () => {
    const a = await saveRun(input({ question: "first" }));
    await new Promise((r) => setTimeout(r, 10));
    const b = await saveRun(input({ question: "second" }));
    const recent = await listRuns(50);
    const ids = recent.map((r) => r.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });
});

/**
 * The canary: a store whose `insert` does nothing at all — the failure mode `saveRun()` exists to
 * catch (a swallowed error, a transaction that never committed, a write to the wrong table). If
 * this test did not fail before the read-back check existed, the check proves nothing.
 */
describe("saveRun, against a store that does nothing", () => {
  afterAll(() => configureStore(undefined));

  class DoesNothingStore implements RunsStore {
    async ensureSchema() {}
    async insert(_input: SaveRunInput) {
      // deliberately does not write anything
    }
    async get(_id: string): Promise<RunRecord | null> {
      return null; // consistent with nothing having been written
    }
    async list(): Promise<RunRecord[]> {
      return [];
    }
    async close() {}
  }

  it("is caught by the read-back check, not silently reported as saved", async () => {
    configureStore(new DoesNothingStore());
    await expect(saveRun(input())).rejects.toBeInstanceOf(RunNotPersistedError);
  });

  it("is caught even when the store lies and returns a row — a field mismatch fails it too", async () => {
    class LiesAboutTheQuestionStore extends DoesNothingStore {
      private last?: SaveRunInput;
      override async insert(input: SaveRunInput) {
        this.last = input;
      }
      override async get(id: string): Promise<RunRecord | null> {
        if (!this.last || this.last.id !== id) return null;
        // Returns a row, but not the one that was actually asked to be saved.
        return { ...this.last, question: "a different question entirely", createdAt: new Date() };
      }
    }
    configureStore(new LiesAboutTheQuestionStore());
    await expect(saveRun(input())).rejects.toThrow(/did not round-trip: question/);
  });
});
