import type { NextConfig } from "next";
import path from "node:path";

// @ducanh2912/next-pwa was removed: it is a webpack plugin and generated no service
// worker under Turbopack builds. public/manifest.json still makes the app installable.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
