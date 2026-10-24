import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname
  },
  // The workspace moved from /v2 to /dashboard. Keep any old /v2 link (bookmarks, open tabs)
  // working by sending it to the same page under /dashboard, so no one lands on a 404.
  async redirects() {
    return [
      { source: "/v2", destination: "/dashboard", permanent: true },
      { source: "/v2/:path*", destination: "/dashboard/:path*", permanent: true }
    ];
  }
};

export default nextConfig;
