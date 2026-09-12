import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "..", "..");

/** Every text-record key the contracts write, read out of the Solidity source at build time. */
export function recordKeys(): { constant: string; key: string }[] {
  const src = readFileSync(join(ROOT, "contracts", "src", "libraries", "TollgateRecordsLib.sol"), "utf8");
  return [...src.matchAll(/string internal constant ([A-Z0-9_]+) = "([^"]+)";/g)].map((m) => ({
    constant: m[1]!,
    key: m[2]!,
  }));
}

export interface HederaRecord {
  readonly network: string;
  readonly settlementAccount: string;
  readonly auditTopic?: string;
  readonly hosted?: { readonly operatorAccount?: string; readonly settlementAccount?: string };
}

export function readHedera(): HederaRecord {
  return JSON.parse(readFileSync(join(ROOT, "deployments", "hedera-testnet.json"), "utf8"));
}

export function readEns(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "deployments", "ens-sepolia.json"), "utf8"));
}
