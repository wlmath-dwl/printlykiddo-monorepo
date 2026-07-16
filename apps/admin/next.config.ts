import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      "/animals/birds",
      "/animals/insects",
      "/animals/reptiles",
      "/animals/amphibians",
      "/animals/pond-animals",
    ].flatMap((source) => [
      {
        source,
        destination: source === "/animals/pond-animals" ? "/animals/freshwater-animals" : "/animals",
        permanent: true,
      },
      {
        source: `${source}/:path*`,
        destination: source === "/animals/pond-animals" ? "/animals/freshwater-animals" : "/animals",
        permanent: true,
      },
    ]);
  },
};

export default nextConfig;
