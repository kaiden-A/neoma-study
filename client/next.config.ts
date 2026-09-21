import type { NextConfig } from "next";

// Where the FastAPI server lives. Same origin as far as the browser is
// concerned: everything under /api is proxied here.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // The repo root has its own lockfile (orchestration only); pin the Next app
  // root so Turbopack does not infer the monorepo root.
  turbopack: { root: __dirname },
  async rewrites() {
    return {
      // afterFiles: a real route handler under app/api/* would win, the rest
      // of /api goes to FastAPI. There must never be a route handler here.
      afterFiles: [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }],
    };
  },
};

export default nextConfig;
