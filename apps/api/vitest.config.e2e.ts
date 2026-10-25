import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    exclude: ["node_modules/**", "dist/**"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
