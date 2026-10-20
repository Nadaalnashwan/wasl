import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wasl pages are client components backed by the FastAPI API and auth-gated in the browser,
  // so Cache Components / Partial Prefetching (server-rendered App Shells) are intentionally off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
