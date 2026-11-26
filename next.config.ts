import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `use cache` + cacheLife: each source has its own cache lifetime
  // (HN changes within minutes, arXiv once a day).
  cacheComponents: true,
};

export default nextConfig;
