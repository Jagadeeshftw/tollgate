/**
 * One-time setup: create the HCS topic that carries the payment audit trail.
 *
 *   pnpm hcs:topic
 *
 * Every settled payment is written to this topic, giving a consensus-timestamped, publicly
 * readable record of what was charged, for what, and to whom — independent of our own logs and
 * not rewritable by us. Topic ids are public; the resulting file is safe to commit.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { TopicCreateTransaction } from "@hiero-ledger/sdk";
import { Client, PrivateKey } from "@x402/hedera";

const DEPLOYMENTS = "deployments/hedera-testnet.json";

async function main() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");
  }

  const existing = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Record<string, unknown>;
  if (existing.auditTopic) {
    console.log(`audit topic already exists: ${existing.auditTopic as string}`);
    return;
  }

  const key = PrivateKey.fromStringECDSA(operatorKey);
  const client = Client.forTestnet().setOperator(operatorId, key);

  try {
    const receipt = await (
      await new TopicCreateTransaction()
        .setTopicMemo("tollgate x402 payment audit trail")
        .execute(client)
    ).getReceipt(client);

    const topicId = receipt.topicId?.toString();
    if (!topicId) throw new Error("topic creation returned no id");

    writeFileSync(
      DEPLOYMENTS,
      `${JSON.stringify({ ...existing, auditTopic: topicId }, null, 2)}\n`,
    );
    console.log(`audit topic created: ${topicId}`);
    console.log(`https://hashscan.io/testnet/topic/${topicId}`);
  } finally {
    client.close();
  }
}

void main().catch((err) => {
  console.error(`hcs topic setup failed: ${(err as Error)?.message ?? "unknown error"}`);
  process.exitCode = 1;
});
