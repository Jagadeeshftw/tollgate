import { GraphDataSource } from "@tollgate/graph";

import { createApp } from "./app.js";
import { HcsAuditLog } from "./audit.js";
import { loadConfig } from "./config.js";
import { OnChainListings } from "./ens.js";

const config = loadConfig();

const auditLog = config.audit
  ? new HcsAuditLog(config.audit.topicId, config.audit.operatorId, config.audit.operatorKey)
  : undefined;

const app = createApp({
  listings: new OnChainListings({
    rpcUrl: config.sepoliaRpcUrl,
    resolverAddress: config.resolverAddress,
    parentName: config.parentName,
  }),
  facilitatorUrl: config.facilitatorUrl,
  // Live Messari-standardized subgraphs. There is deliberately no fallback: a hosted service that
  // charges for data must fail visibly if it cannot reach its source, rather than serve something
  // it made up.
  dataSource: new GraphDataSource(),
  ...(auditLog ? { auditLog } : {}),
});

app.listen(config.port, () => {
  console.log(`tollgate service listening on :${config.port}`);
  console.log(`  facilitator ${config.facilitatorUrl}`);
  console.log(`  listings    *.${config.parentName} via ${config.resolverAddress}`);
  console.log(
    config.audit
      ? `  audit       HCS topic ${config.audit.topicId}`
      : `  audit       disabled (set HCS_AUDIT_TOPIC_ID to enable)`,
  );
  console.log(`  data        The Graph — Messari standardized subgraphs (live)`);
});
