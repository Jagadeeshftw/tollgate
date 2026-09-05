import { existsSync, readFileSync } from "node:fs";

const envPath = new URL("../../../.env", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    const value = rawValue!.replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key!] = value;
  }
}
process.env.SEPOLIA_RPC_URL ??= "https://ethereum-sepolia-rpc.publicnode.com";
