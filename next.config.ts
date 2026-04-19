import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@prisma/client"],
};

export default nextConfig;
