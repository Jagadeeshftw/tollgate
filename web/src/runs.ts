/**
 * Persists a record of every run `/api/ask` executes — the question, the budget it was given, what
 * it actually spent, the Hedera transaction it settled through, how it ended, the answer, and when.
 * Neon in production; any Postgres wire-compatible database will do (see `DATABASE_URL`).
 *
 * @remarks
 * **A write does not count as saved until it has been read back.** `saveRun()` inserts, then
 * immediately selects the same row and compares every field against what was sent — a write that
 * silently landed nowhere (wrong table, a swallowed error, a transaction that never committed)
 * throws here instead of reporting success. `saveRun.test.ts` proves this catches something: it
 * canaries with a save path that inserts nothing, and the read-back check fails it.
 *
 * Never logs `DATABASE_URL` — it carries a password. Every error thrown here is built from the
 * run's own fields, never from the connection string or the driver's raw error object.
 */
import pg from "pg";

export type RunStatus = "answered" | "declined" | "error";

export interface RunRecord {
  readonly id: string;
  readonly question: string;
  readonly budgetBaseUnits: bigint;
  readonly spentBaseUnits: bigint;
  readonly transactionId: string | null;
  readonly status: RunStatus;
  readonly answer: string | null;
  readonly createdAt: Date;
}

export interface SaveRunInput {
  readonly id: string;
  readonly question: string;
  readonly budgetBaseUnits: bigint;
  readonly spentBaseUnits: bigint;
  readonly transactionId: string | null;
  readonly status: RunStatus;
  readonly answer: string | null;
}

/** Thrown by `saveRun()` when the read-back does not match what was sent — the write is not trusted. */
export class RunNotPersistedError extends Error {
  constructor(id: string, reason: string) {
    super(`run ${id} was not actually saved: ${reason}`);
    this.name = "RunNotPersistedError";
  }
}

interface RunsStore {
  ensureSchema(): Promise<void>;
  insert(input: SaveRunInput): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  list(limit: number): Promise<RunRecord[]>;
  close(): Promise<void>;
}

/** The real store: a Postgres pool. Neon in production; anything speaking the wire protocol works. */
class PostgresRunsStore implements RunsStore {
  private readonly pool: pg.Pool;
  private schemaReady?: Promise<void>;

  constructor(connectionString: string) {
    // Neon requires TLS; a local dev Postgres typically does not offer it at all, so this is
    // conditioned on the host rather than always-on.
    const ssl = /neon\.tech/.test(connectionString) ? { rejectUnauthorized: true } : undefined;
    this.pool = new pg.Pool({ connectionString, ...(ssl ? { ssl } : {}), max: 5 });
  }

  ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS runs (
             id                 TEXT PRIMARY KEY,
             question           TEXT NOT NULL,
             budget_base_units  BIGINT NOT NULL,
             spent_base_units   BIGINT NOT NULL,
             transaction_id     TEXT,
             status             TEXT NOT NULL,
             answer             TEXT,
             created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        )
        .then(() => undefined);
    }
    return this.schemaReady;
  }

  async insert(input: SaveRunInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs
         (id, question, budget_base_units, spent_base_units, transaction_id, status, answer)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.question,
        input.budgetBaseUnits.toString(),
        input.spentBaseUnits.toString(),
        input.transactionId,
        input.status,
        input.answer,
      ],
    );
  }

  async get(id: string): Promise<RunRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM runs WHERE id = $1", [id]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async list(limit: number): Promise<RunRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM runs ORDER BY created_at DESC LIMIT $1",
      [limit],
    );
    return rows.map(rowToRecord);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToRecord(row: Record<string, unknown>): RunRecord {
  return {
    id: row.id as string,
    question: row.question as string,
    budgetBaseUnits: BigInt(row.budget_base_units as string),
    spentBaseUnits: BigInt(row.spent_base_units as string),
    transactionId: (row.transaction_id as string | null) ?? null,
    status: row.status as RunStatus,
    answer: (row.answer as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

let store: RunsStore | undefined;

/**
 * The store persistence writes go through. Built from `DATABASE_URL` on first use; injectable so
 * tests can swap in a store that deliberately does nothing, to prove the read-back check catches it.
 */
export function configureStore(custom?: RunsStore): void {
  store = custom;
}

function getStore(): RunsStore {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — persistence is unavailable");
  store = new PostgresRunsStore(url);
  return store;
}

/** Whether a store is configured at all — checked before persisting so a missing `DATABASE_URL`
 *  degrades a run to "not persisted", not to a crash. */
export function persistenceConfigured(): boolean {
  return Boolean(store) || Boolean(process.env.DATABASE_URL);
}

/**
 * Insert a run, then read it back and compare every field against what was sent. Resolves to the
 * record as read back — never as merely "assumed written" — or throws {@link RunNotPersistedError}.
 */
export async function saveRun(input: SaveRunInput): Promise<RunRecord> {
  const s = getStore();
  await s.ensureSchema();
  await s.insert(input);

  const saved = await s.get(input.id);
  if (!saved) throw new RunNotPersistedError(input.id, "no row found after insert");

  const mismatches: string[] = [];
  if (saved.question !== input.question) mismatches.push("question");
  if (saved.budgetBaseUnits !== input.budgetBaseUnits) mismatches.push("budgetBaseUnits");
  if (saved.spentBaseUnits !== input.spentBaseUnits) mismatches.push("spentBaseUnits");
  if (saved.transactionId !== input.transactionId) mismatches.push("transactionId");
  if (saved.status !== input.status) mismatches.push("status");
  if (saved.answer !== input.answer) mismatches.push("answer");
  if (mismatches.length > 0) {
    throw new RunNotPersistedError(input.id, `field(s) did not round-trip: ${mismatches.join(", ")}`);
  }
  return saved;
}

export async function getRun(id: string): Promise<RunRecord | null> {
  const s = getStore();
  await s.ensureSchema();
  return s.get(id);
}

export async function listRuns(limit = 20): Promise<RunRecord[]> {
  const s = getStore();
  await s.ensureSchema();
  return s.list(limit);
}

export async function closeStore(): Promise<void> {
  if (store) {
    await store.close();
    store = undefined;
  }
}

export type { RunsStore };
