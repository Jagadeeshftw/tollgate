/**
 * Load repo-root `.env` for the end-to-end suite.
 *
 * Vitest does not take node's `--env-file`, and these tests need real credentials. Values already
 * present in the environment win, so CI can inject secrets without a file on disk.
 */
import { existsSync, readFileSync } from "node:fs";

const envPath = new URL("../../../.env", import.meta.url);

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    // Strip an inline comment, then surrounding quotes.
    const value = rawValue!.replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key!] = value;
  }
}

// Sepolia is forked read-only by anvil; a public endpoint is sufficient and needs no key.
process.env.SEPOLIA_RPC_URL ??= "https://ethereum-sepolia-rpc.publicnode.com";
