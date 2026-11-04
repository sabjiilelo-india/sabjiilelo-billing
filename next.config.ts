import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a test build live beside a running dev server (NEXT_DIST_DIR=.next-test).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
