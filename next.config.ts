import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Abilita `use cache` + cacheLife: ogni fonte ha una durata di cache propria
  // (HN cambia in minuti, arXiv una volta al giorno).
  cacheComponents: true,
};

export default nextConfig;
