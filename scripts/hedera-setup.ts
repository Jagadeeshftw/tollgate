/**
 * One-time Hedera testnet setup: create the account that receives payments.
 *
 *   pnpm hedera:setup
 *
 * Why a second account at all: an x402 "exact" transfer debits the payer and credits `payTo`. If
 * those are the same account the transfer nets to zero, and the facilitator's check that `payTo`
 * receives exactly the required amount fails. Proving settlement therefore needs two distinct
 * parties, which mirrors production anyway — the agent pays, the service operator is paid.
 *
 * The new account is created with the *same public key* as the operator, so it is a genuinely
 * separate account on the network while introducing no second secret to manage or leak, and any
 * balance that accumulates on it remains recoverable with the key we already hold.
 *
 * Account ids are public information and the resulting file is safe to commit; no key material is
 * written or printed.
 */
import { writeFileSync } from "node:fs";

// `@x402/hedera` re-exports only the subset of the Hedera SDK its payment path needs, so
// account creation comes from the SDK directly. Same underlying package, pinned via @x402/hedera.
import { AccountCreateTransaction } from "@hiero-ledger/sdk";
import { Client, Hbar, PrivateKey } from "@x402/hedera";

const DEPLOYMENTS = "deployments/hedera-testnet.json";

async function main() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");
  }

  const key = PrivateKey.fromStringECDSA(operatorKey);
  const client = Client.forTestnet().setOperator(operatorId, key);

  try {
    const receipt = await (
      await new AccountCreateTransaction()
        // `setKeyWithoutAlias`, not `setECDSAKeyWithAlias`: the EVM alias derived from this key is
        // already assigned to the operator account, and requesting it again fails with
        // ALIAS_ALREADY_ASSIGNED. We want a plain second account under the same key, not a second
        // claim on the same alias.
        .setKeyWithoutAlias(key.publicKey)
        .setInitialBalance(new Hbar(1))
        .execute(client)
    ).getReceipt(client);

    const settlementAccount = receipt.accountId?.toString();
    if (!settlementAccount) throw new Error("account creation returned no id");

    const record = {
      network: "hedera:testnet",
      operatorAccount: operatorId,
      settlementAccount,
      note: "settlementAccount receives x402 payments; created by scripts/hedera-setup.ts",
      createdAt: new Date().toISOString(),
    };
    writeFileSync(DEPLOYMENTS, `${JSON.stringify(record, null, 2)}\n`);

    console.log(`settlement account created: ${settlementAccount}`);
    console.log(`written to ${DEPLOYMENTS}`);
  } finally {
    client.close();
  }
}

void main().catch((err) => {
  // Never interpolate the raw error object — SDK errors can echo transaction contents.
  console.error(`hedera setup failed: ${(err as Error)?.message ?? "unknown error"}`);
  process.exitCode = 1;
});
