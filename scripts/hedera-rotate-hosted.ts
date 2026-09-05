/**
 * Replace the hosted demo's Hedera keypair after an exposure.
 *
 *   pnpm hedera:rotate-hosted            # dry run — reports what it would do
 *   pnpm hedera:rotate-hosted --execute
 *
 * @remarks
 * Fresh accounts rather than an `AccountUpdateTransaction` on the existing ones. Re-keying has to
 * be signed by the key being retired, so the compromised key stays valid right up to the moment
 * the update lands, and whoever else holds it can re-key first and lock us out. A new keypair has
 * no such window. Testnet HBAR is free to replace, so there is nothing in the old accounts worth
 * preserving that justifies the race.
 *
 * `scripts/hedera-setup.ts` creates the settlement account under the *operator's own key*, which is
 * why one exposure compromised both accounts. This creates one fresh key and puts both new accounts
 * under it, matching that shape while making the retired key control nothing we use.
 *
 * The new private key is written straight to `.env` and is never printed, logged, or returned —
 * only account ids, which are public identifiers, reach stdout.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  TransferTransaction,
} from "@hiero-ledger/sdk";

const DEPLOYMENTS = "deployments/hedera-testnet.json";
const ENV = ".env";
const FUND_HBAR = 65;

/** Rewrite one variable in `.env`, preserving every other line and the file's ordering. */
function setEnvVar(name: string, value: string) {
  const original = readFileSync(ENV, "utf8");
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(original)
    ? original.replace(pattern, line)
    : `${original.replace(/\n*$/, "\n")}${line}\n`;
  writeFileSync(ENV, next);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const funderId = process.env.HEDERA_OPERATOR_ID;
  const funderKey = process.env.HEDERA_OPERATOR_KEY;
  if (!funderId || !funderKey) throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");

  const record = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as {
    hosted?: { operatorAccount?: string; settlementAccount?: string };
  };
  const oldPayer = record.hosted?.operatorAccount;
  const oldSettlement = record.hosted?.settlementAccount;

  console.log(`funder            ${funderId}`);
  console.log(`retiring payer    ${oldPayer ?? "(none recorded)"}`);
  console.log(`retiring settle   ${oldSettlement ?? "(none recorded)"}`);
  console.log(`new accounts will be funded with ${FUND_HBAR} HBAR\n`);

  if (!execute) {
    console.log("dry run — re-run with --execute to create the accounts and rewrite .env");
    return;
  }

  const client = Client.forTestnet().setOperator(funderId, PrivateKey.fromStringECDSA(funderKey));

  try {
    // One fresh key, never logged.
    const fresh = PrivateKey.generateECDSA();

    const payer = (
      await (
        await new AccountCreateTransaction()
          // Not `setECDSAKeyWithAlias`: an alias is not needed here and requesting one is the
          // failure mode `hedera-setup.ts` already documents.
          .setKeyWithoutAlias(fresh.publicKey)
          .setInitialBalance(new Hbar(FUND_HBAR))
          .execute(client)
      ).getReceipt(client)
    ).accountId?.toString();

    const settlement = (
      await (
        await new AccountCreateTransaction()
          .setKeyWithoutAlias(fresh.publicKey)
          .setInitialBalance(new Hbar(1))
          .execute(client)
      ).getReceipt(client)
    ).accountId?.toString();

    if (!payer || !settlement) throw new Error("account creation returned no id");

    setEnvVar("HOSTED_HEDERA_OPERATOR_ID", payer);
    setEnvVar("HOSTED_HEDERA_OPERATOR_KEY", fresh.toStringRaw());
    setEnvVar("HOSTED_HEDERA_SETTLEMENT_ID", settlement);

    record.hosted = {
      operatorAccount: payer,
      settlementAccount: settlement,
      createdAt: new Date().toISOString(),
      ...(oldPayer ? { retired: { operatorAccount: oldPayer, settlementAccount: oldSettlement } } : {}),
      note: "rotated after key exposure; the retired accounts must not be funded or used again",
    } as never;
    writeFileSync(DEPLOYMENTS, `${JSON.stringify(record, null, 2)}\n`);

    console.log(`new hosted payer      ${payer}`);
    console.log(`new hosted settlement ${settlement}`);
    console.log(`\n.env and ${DEPLOYMENTS} updated. The new key was not printed.`);
    console.log("Next: set HEDERA_OPERATOR_KEY on the Railway web service from .env.");

    // Best effort: sweep the retired payer back to the funder so the exposed key controls nothing
    // worth taking. Failure here is not fatal — the accounts are already out of the deployment.
    const retiringKey = process.env.HOSTED_HEDERA_OPERATOR_KEY_OLD;
    if (retiringKey && oldPayer) {
      try {
        const sweep = Client.forTestnet().setOperator(oldPayer, PrivateKey.fromStringECDSA(retiringKey));
        const balance = await fetch(
          `https://testnet.mirrornode.hedera.com/api/v1/accounts/${oldPayer}`,
        ).then((r) => r.json() as Promise<{ balance?: { balance?: number } }>);
        const tinybars = (balance.balance?.balance ?? 0) - 100_000; // leave a margin for the fee
        if (tinybars > 0) {
          await (
            await new TransferTransaction()
              .addHbarTransfer(oldPayer, Hbar.fromTinybars(-tinybars))
              .addHbarTransfer(funderId, Hbar.fromTinybars(tinybars))
              .execute(sweep)
          ).getReceipt(sweep);
          console.log(`swept ${(tinybars / 1e8).toFixed(4)} HBAR from ${oldPayer} back to ${funderId}`);
        }
        sweep.close();
      } catch (err) {
        console.log(`sweep of ${oldPayer} failed (not fatal): ${(err as Error).message}`);
      }
    } else if (oldPayer) {
      console.log(
        `\nTo drain ${oldPayer}, re-run with HOSTED_HEDERA_OPERATOR_KEY_OLD set to the retired key.`,
      );
    }
  } finally {
    client.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
