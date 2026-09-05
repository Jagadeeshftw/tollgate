/**
 * The whole loop, against live Sepolia and Hedera testnet.
 *
 *   SEPOLIA_RPC_URL=... HEDERA_OPERATOR_ID=0.0.x HEDERA_OPERATOR_KEY=0x... \
 *     npx tsx examples/paid-request.ts
 *
 * Spends real testnet HBAR — about 0.003 by default.
 */
import { Tollgate, tinybarsToHbar } from "../src/index.js";

const accountId = process.env.HEDERA_OPERATOR_ID;
const privateKey = process.env.HEDERA_OPERATOR_KEY;
if (!accountId || !privateKey) {
  console.error("set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (ECDSA) to run this");
  process.exit(1);
}

const tollgate = new Tollgate({
  hedera: { accountId, privateKey },
  budget: "0.02",
  ...(process.env.SEPOLIA_RPC_URL ? { sepoliaRpc: process.env.SEPOLIA_RPC_URL } : {}),
});

// 1 · Discovery. No endpoint list is supplied — this reads the chain.
const services = await tollgate.list();
console.log(`\nlisted on ${services.length === 0 ? "(nothing)" : "ENS"}:`);
for (const s of services) {
  console.log(`  ${s.label.padEnd(16)} ${s.unitPrice} per ${s.unit}   ${s.name}`);
  console.log(`  ${" ".repeat(16)} ${s.context}`);
}

const scan = tollgate.lastDiscovery;
if (scan.recovered.length) {
  console.log(
    `\n  note: ${scan.recovered.length} listing(s) were missing from the event log and were ` +
      `recovered by reading their ENS records (${scan.recovered.join(", ")}). ` +
      `The catalogue is correct; the RPC is not.`,
  );
}

// 2 · Pricing. Arithmetic over records already read — no request, nothing spent.
console.log("\npriced at 3 units, cheapest first:");
for (const { service, costBaseUnits, affordable } of await tollgate.priceAll(3)) {
  console.log(
    `  ${service.label.padEnd(16)} ${tinybarsToHbar(costBaseUnits).padStart(8)} HBAR   ` +
      (affordable ? "within budget" : "OVER BUDGET"),
  );
}

// 3 · Judgment is the caller's. The SDK will not choose for you — this is a deliberately dumb rule
//     standing where your agent's reasoning would go.
const svc = await tollgate.get("uniswap-pools");
const quote = svc.quote({ limit: 3 });
console.log(`\nquote: ${tinybarsToHbar(quote.costBaseUnits)} HBAR for ${quote.units} ${quote.unit}(s)`);
if (!quote.affordable) {
  console.log("not affordable within the remaining budget — stopping without spending");
  process.exit(0);
}

// 4 · Pay. `maxAmount` refuses an over-quote before anything is signed.
// `data` is the response body verbatim. The SDK does not reshape it — a service's envelope is its
// own business, and unwrapping ours here would couple the package to one provider.
const result = await svc.fetch<{
  units?: number;
  data?: { pools?: unknown[]; provenance?: Record<string, unknown> };
}>({ limit: 3, maxAmount: "0.01" });
console.log(`\npaid ${tinybarsToHbar(result.payment.amountBaseUnits)} HBAR`);
console.log(`  tx    ${result.payment.transactionId}`);
console.log(`  proof ${result.payment.hashscanUrl}`);
console.log(`  spent ${tinybarsToHbar(result.budget.spent)} of ${tinybarsToHbar(tollgate.budget.limit)} HBAR`);
const pools = result.data.data?.pools ?? [];
console.log(`  got   ${pools.length} pool(s), ${Object.keys(result.data.data?.provenance ?? {}).length} provenance field(s)`);
