#!/usr/bin/env bash
# @executable — installs the real published package fresh, spends nothing, run by `pnpm gate:docs`
# The exact npm install a third party runs, then list the catalogue and price it — no wallet, no
# workspace, no code from this repository on the require path.
set -euo pipefail
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
cd "$DIR"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund --silent @tollgatehq/sdk >/dev/null
cat > quote.mjs <<'EOF'
import { Tollgate } from "@tollgatehq/sdk";
const tollgate = new Tollgate({ budget: "0.02" });
const services = await tollgate.list();
const svc = await tollgate.get("uniswap-pools");
const quote = svc.quote({ limit: 10 });
console.log(
  `${services.length} service(s) listed; uniswap-pools quotes ${quote.costBaseUnits} tinybar for ` +
    `${quote.units} ${quote.unit}(s), affordable=${quote.affordable}, spent=${tollgate.budget.spent}`,
);
EOF
node quote.mjs
