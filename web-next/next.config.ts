import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the tracing root to this app so the parent repo's lockfiles don't
  // confuse Next's file-tracing on build/deploy.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Standalone server bundle for a small Docker image.
  output: "standalone",
  // The RAG agent reads content/*.md from disk at runtime; make sure those files
  // ship with the serverless function bundle on Vercel (file tracing misses the
  // dynamic readdir/readFile path otherwise).
  outputFileTracingIncludes: {
    "/api/agent": ["./content/**/*"],
  },
};

export default nextConfig;
