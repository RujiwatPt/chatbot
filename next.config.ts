import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serves static & uploaded images directly via Cloudflare Workers Assets edge CDN
    unoptimized: true,
  },
};

export default nextConfig;
