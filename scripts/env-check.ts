/**
 * Configuration preflight.
 *
 * @remarks
 * Two failures motivated this, both of which cost real time and neither of which announced itself:
 *
 *   - `OPENAI_KEY` was set in `.env` and silently ignored, because the SDK reads only
 *     `OPENAI_API_KEY`. The agent reported "no credentials" while the credential sat in the file.
 *   - `HCS_AUDIT_TOPIC_ID` disappeared during an unrelated edit to `.env`. Nothing failed; the
 *     audit trail simply stopped being written, which is exactly the kind of silence you discover
 *     much later.
 *
 * A value that is present but under the wrong name, or absent but expected, should be a line of
 * output at startup — not something inferred from behaviour hours later.
 */
export type Requirement = "required" | "optional" | "one-of";

export interface EnvVar {
  readonly name: string;
  readonly requirement: Requirement;
  /** Other spellings people reasonably use. Set under one of these, it still works but is flagged. */
  readonly aliases?: readonly string[];
  readonly pattern?: RegExp;
  readonly describe: string;
  /** For "one-of": the group that must have at least one member set. */
  readonly group?: string;
}

export const ENV_SPEC: readonly EnvVar[] = [
  {
    name: "HEDERA_OPERATOR_ID",
    requirement: "required",
    pattern: /^\d+\.\d+\.\d+$/,
    describe: "Hedera account that pays for data",
  },
  {
    name: "HEDERA_OPERATOR_KEY",
    requirement: "required",
    pattern: /^(0x)?[0-9a-fA-F]{64,}$/,
    describe: "ECDSA (secp256k1) private key for that account",
  },
  {
    name: "ANTHROPIC_API_KEY",
    requirement: "one-of",
    group: "model",
    aliases: ["ANTHROPIC_KEY", "ANTHROPIC_AUTH_TOKEN"],
    describe: "model credentials — either provider works",
  },
  {
    name: "OPENAI_API_KEY",
    requirement: "one-of",
    group: "model",
    aliases: ["OPENAI_KEY"],
    describe: "model credentials — either provider works",
  },
  {
    name: "DEPLOYER_PRIVATE_KEY",
    requirement: "required",
    pattern: /^0x[0-9a-fA-F]{64}$/,
    describe: "Sepolia key that owns the ENS parent and deploys the registry",
  },
  {
    name: "DEPLOYER_ADDRESS",
    requirement: "optional",
    pattern: /^0x[0-9a-fA-F]{40}$/,
    describe: "derived from DEPLOYER_PRIVATE_KEY; recorded so it can be funded",
  },
  {
    name: "ENS_PARENT_NAME",
    requirement: "optional",
    pattern: /^[a-z0-9-]+\.eth$/,
    describe: "parent name the services live under, once registered",
  },
  {
    name: "GRAPH_API_KEY",
    requirement: "required",
    pattern: /^[0-9a-f]{32}$/i,
    describe: "Subgraph Studio key; live data is mandatory for both Graph tracks",
  },
  {
    // The CLI reads `RAILWAY_TOKEN` and nothing else. A project token stored under its own
    // descriptive name is the natural thing to do and produces "Unauthorized", which reads as a
    // bad credential rather than a misplaced one — so the alias is accepted and flagged.
    name: "RAILWAY_TOKEN",
    requirement: "optional",
    aliases: ["RAILWAY_PROJECT_TOKEN"],
    describe: "Railway token; the CLI reads RAILWAY_TOKEN only, so an alias must be exported as it",
  },
  {
    name: "HCS_AUDIT_TOPIC_ID",
    requirement: "optional",
    pattern: /^\d+\.\d+\.\d+$/,
    describe: "HCS topic for the payment audit trail (silently disabled if unset)",
  },
  {
    name: "SEPOLIA_RPC_URL",
    requirement: "optional",
    pattern: /^https?:\/\//,
    describe: "defaults to a public endpoint",
  },
  {
    name: "GRAPH_SUBGRAPH_ID",
    requirement: "optional",
    describe: "subgraph the live-data gate queries",
  },
];

export interface EnvFinding {
  readonly level: "ok" | "warn" | "fail";
  readonly name: string;
  readonly message: string;
}

/** Resolve a variable through its canonical name and any accepted aliases. */
function resolve(spec: EnvVar, env: NodeJS.ProcessEnv): { value?: string; via?: string } {
  const direct = env[spec.name];
  if (direct) return { value: direct, via: spec.name };
  for (const alias of spec.aliases ?? []) {
    const value = env[alias];
    if (value) return { value, via: alias };
  }
  return {};
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvFinding[] {
  const findings: EnvFinding[] = [];
  const groups = new Map<string, boolean>();

  for (const spec of ENV_SPEC) {
    const { value, via } = resolve(spec, env);

    if (spec.group) groups.set(spec.group, (groups.get(spec.group) ?? false) || Boolean(value));

    if (!value) {
      if (spec.requirement === "required") {
        findings.push({ level: "fail", name: spec.name, message: `missing — ${spec.describe}` });
      } else if (spec.requirement === "optional") {
        findings.push({ level: "warn", name: spec.name, message: `unset — ${spec.describe}` });
      }
      continue;
    }

    if (via !== spec.name) {
      findings.push({
        level: "warn",
        name: spec.name,
        message: `set as ${via}. Accepted, but tools reading ${spec.name} directly will not see it.`,
      });
    }

    if (spec.pattern && !spec.pattern.test(value.trim())) {
      findings.push({
        level: "fail",
        name: via ?? spec.name,
        message: `set but malformed — expected ${String(spec.pattern)}`,
      });
      continue;
    }

    if (via === spec.name) {
      findings.push({ level: "ok", name: spec.name, message: `set (${value.trim().length} chars)` });
    }
  }

  for (const [group, satisfied] of groups) {
    if (!satisfied) {
      findings.push({
        level: "fail",
        name: group,
        message:
          group === "model"
            ? "no model credentials — set ANTHROPIC_API_KEY or OPENAI_API_KEY (OPENAI_KEY accepted)"
            : `no ${group} credentials`,
      });
    }
  }

  return findings;
}
