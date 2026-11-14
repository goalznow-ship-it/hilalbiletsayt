import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Role/session tests sign in repeatedly; the default brute-force limit is
    // covered separately by src/rate-limiting.integration.spec.ts.
    env: { AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "100000" },
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    exclude: ["node_modules/**", "dist/**"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
