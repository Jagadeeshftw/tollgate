import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The public addresses the operator console acts on, read from the committed deployment record at build time. */
export interface OperatorDeployment {
  readonly parentName: string;
  readonly registry: `0x${string}`;
  readonly resolver: `0x${string}`;
  /** Absent until the open registrar is rolled out; the console then says so instead of pretending. */
  readonly openRegistrar?: `0x${string}`;
}

export function readDeployment(): OperatorDeployment {
  // web/ui is two levels below the repository root; the record is committed there.
  const raw = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "deployments", "ens-sepolia.json"), "utf8"));
  return {
    parentName: raw.parentName,
    registry: raw.registry,
    resolver: raw.resolver,
    ...(raw.openRegistrar ? { openRegistrar: raw.openRegistrar } : {}),
  };
}
