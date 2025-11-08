// @ts-nocheck
import type { NextConfig } from 'next';
import webpack from 'webpack';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
  webpack: (config) => {
    // Exclude test utilities from production builds
    config.resolve.alias = {
      ...config.resolve.alias,
      'ai/test': false,
      'ai/dist/test': false,
    };

    // Use IgnorePlugin to exclude test dependencies and optional peer dependencies
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        checkResource(resource) {
          // Ignore msw, vitest, and test utilities
          if (/^(msw|msw\/node|vitest)$/.test(resource)) {
            return true;
          }
          // Ignore test files from ai-sdk packages
          if (/@ai-sdk\/.*\/dist\/test/.test(resource)) {
            return true;
          }
          if (/ai\/dist\/test/.test(resource)) {
            return true;
          }
          // Ignore optional Para SDK peer dependencies
          if (/^@farcaster\/miniapp-sdk$/.test(resource)) {
            return true;
          }
          return false;
        },
      }),
    );

    // Replace models.mock.ts with empty stub in production to avoid importing test utilities
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /lib\/ai\/models\.mock\.ts$/,
        require.resolve('./lib/ai/models.mock.empty.ts'),
      ),
    );

    return config;
  },
};

export default nextConfig;
