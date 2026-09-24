import type { NextConfig } from "next";

// Where the FastAPI server lives. Same origin as far as the browser is
// concerned: everything under /api is proxied here.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // The repo root has its own lockfile (orchestration only); pin the Next app
  // root so Turbopack does not infer the monorepo root.
  turbopack: { root: __dirname },
  experimental: {
    // Next clones request bodies for the proxy (and therefore for every
    // rewritten route) and buffers at most 10MB by default; anything larger
    // reaches FastAPI truncated. Uploads now go browser -> R2 directly with a
    // presigned PUT, so this only covers the legacy multipart POST /api/files:
    // keep it above MAX_UPLOAD_BYTES (15MB) with room for the thumbnail part
    // and multipart overhead. Order to preserve: client MAX_FILE_BYTES (15MB)
    // <= server MAX_UPLOAD_BYTES (15MB) < this buffer.
    proxyClientMaxBodySize: "20mb",
  },
  async rewrites() {
    return {
      // afterFiles: a real route handler under app/api/* would win, the rest
      // of /api goes to FastAPI. There must never be a route handler here.
      afterFiles: [
        { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
        // Same shape as the production Firebase rewrites: MCP and the
        // protected-resource metadata live on the API origin.
        { source: "/mcp", destination: `${API_ORIGIN}/mcp` },
        { source: "/.well-known/:path*", destination: `${API_ORIGIN}/.well-known/:path*` },
      ],
    };
  },
};

export default nextConfig;
