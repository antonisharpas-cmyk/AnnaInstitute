import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly, so it is loaded at runtime rather than bundled.
  // This is what lets the local database work with nothing to install.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
