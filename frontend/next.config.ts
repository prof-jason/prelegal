import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built as static HTML/JS/CSS and served by the FastAPI backend (see
  // the StaticFiles mount in backend/app/main.py) rather than by the
  // Next.js server.
  output: "export",
  images: {
    // next/image's optimization API needs a Node server; unused today, but
    // this keeps it from silently breaking the export build later.
    unoptimized: true,
  },
};

export default nextConfig;
