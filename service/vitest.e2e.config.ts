import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.test.ts"],
    setupFiles: ["test/e2e/setup.ts"],
    // Forking Sepolia, deploying three contracts and settling a real Hedera payment.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
