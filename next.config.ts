import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Leave multipart overhead above the inventory upload's explicit 5 MB limit.
  // Household actions retain their existing, smaller per-action validation.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
