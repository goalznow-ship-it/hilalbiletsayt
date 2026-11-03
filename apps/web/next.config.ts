import path from "node:path";
import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  /* config options here */
  experimental: { turbopackPluginRuntimeStrategy: "workerThreads" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};
export default nextConfig;
