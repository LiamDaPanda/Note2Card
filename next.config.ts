import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `sharp` and `unpdf` ship native/wasm assets that must not be bundled
  // into the server chunks — Next needs to require them at runtime.
  serverExternalPackages: ["sharp", "unpdf"],
};

export default nextConfig;
