import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly, so it is loaded at runtime rather than bundled.
  // This is what lets the local database work with nothing to install.
  serverExternalPackages: ["@electric-sql/pglite"],

  /**
   * Lists must always show what the server actually holds.
   *
   * The browser side router keeps a copy of pages it has already seen for
   * thirty seconds. On a CRM that is wrong twice over: a list opened again
   * after a change would show the old rows, and, worse, moving between two
   * addresses of the same list (the same table with the panel open, say) was
   * occasionally dropped altogether because the router thought it already had
   * that page. Nothing dynamic is kept.
   */
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
    /*
     * Forms that carry a file (a logo, a document, an invoice) are sent as one
     * piece, and Next.js refuses anything over 1 MB by default, so a photograph
     * of a document never arrived. The uploads themselves stop at 20 MB.
     */
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
