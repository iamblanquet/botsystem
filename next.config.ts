import type { NextConfig } from "next";
import path from 'node:path';

const nextConfig: NextConfig = {
  // Keep Next output and generated route types separate from the Vite preview.
  distDir: '.next-vercel',
  outputFileTracingRoot: path.resolve('.'),
  webpack(config, { webpack }) {
    // Replace requests before Next's tsconfig-path resolver sees the @/ alias.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^@\/lib\/runtime$/, path.resolve('lib/runtime-node.ts')),
      new webpack.NormalModuleReplacementPlugin(/^@\/app\/chatgpt-auth$/, path.resolve('lib/admin-auth.ts')),
    );
    return config;
  },
};

export default nextConfig;
