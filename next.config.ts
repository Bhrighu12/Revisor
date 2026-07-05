import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pdf-parse", "mammoth", "pdfkit"],
};

export default nextConfig;
