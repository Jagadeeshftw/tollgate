import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit and integration tests. The end-to-end suite is separate (`pnpm test:e2e`) because it
    // spends real HBAR and forks Sepolia, and should be an explicit choice rather than a surprise.
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**"],
  },
});
