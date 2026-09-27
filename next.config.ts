import type { NextConfig } from "next";

// PRETEXT_STATIC_EXPORT=1 builds a replay-only static bundle in out/ —
// lobby + replay + debrief work with no server (fixtures come from /public).
// The /api routes are moved aside for the export by scripts/build-static.sh.
// PRETEXT_BASE_PATH (e.g. "/pretext") serves the app from a subpath such as
// a GitHub Pages project site.
const basePath = process.env.PRETEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.PRETEXT_STATIC_EXPORT === "1" ? "export" : undefined,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
};

export default nextConfig;
