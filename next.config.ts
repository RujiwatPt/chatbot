import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serves static images directly via Cloudflare Workers Assets edge CDN
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
