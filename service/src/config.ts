export interface ServiceConfig {
  readonly port: number;
  readonly sepoliaRpcUrl: string;
  readonly resolverAddress: `0x${string}`;
  readonly parentName: string;
  readonly facilitatorUrl: string;
  /** HCS topic for the payment audit trail, and the credentials to write to it. */
  readonly audit?: { topicId: string; operatorId: string; operatorKey: string };
}

class MissingConfigError extends Error {
  constructor(keys: readonly string[]) {
    super(
      `missing required environment: ${keys.join(", ")}\n` +
        `copy .env.example to .env and fill it in — see spec/PHASE-0-GATES.md for what is blocked on whom`,
    );
    this.name = "MissingConfigError";
  }
}

/**
 * Read configuration, failing at startup rather than at request time.
 *
 * @remarks
 * Note what is *not* here: no price, no settlement account, no service catalogue. Those come from
 * ENS. This config covers only how to reach ENS and the facilitator.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const missing: string[] = [];
  const need = (key: string): string => {
    const value = env[key];
    if (!value) {
      missing.push(key);
      return "";
    }
    return value;
  };

  const sepoliaRpcUrl = need("SEPOLIA_RPC_URL");
  const resolverAddress = need("TOLLGATE_RESOLVER_ADDRESS");
  const parentName = need("ENS_PARENT_NAME");
  if (missing.length > 0) throw new MissingConfigError(missing);

  if (!/^0x[0-9a-fA-F]{40}$/.test(resolverAddress)) {
    throw new Error(`TOLLGATE_RESOLVER_ADDRESS is not an address: "${resolverAddress}"`);
  }

  // Auditing is optional to configure but never silently half-configured: a topic without
  // credentials, or credentials without a topic, is a misconfiguration rather than a default.
  const topicId = env.HCS_AUDIT_TOPIC_ID;
  const auditOperatorId = env.HEDERA_OPERATOR_ID;
  const auditOperatorKey = env.HEDERA_OPERATOR_KEY;
  const auditParts = [topicId, auditOperatorId, auditOperatorKey].filter(Boolean).length;
  if (auditParts > 0 && auditParts < 3) {
    throw new Error(
      "audit trail is partially configured: HCS_AUDIT_TOPIC_ID, HEDERA_OPERATOR_ID and " +
        "HEDERA_OPERATOR_KEY must be set together, or none of them",
    );
  }

  return {
    port: Number(env.PORT ?? 8402),
    sepoliaRpcUrl,
    resolverAddress: resolverAddress as `0x${string}`,
    parentName,
    facilitatorUrl: env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
    ...(auditParts === 3
      ? {
          audit: {
            topicId: topicId!,
            operatorId: auditOperatorId!,
            operatorKey: auditOperatorKey!,
          },
        }
      : {}),
  };
}
