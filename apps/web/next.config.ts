import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nextabizz/shared-types', '@nextabizz/webhook-sdk', '@nextabizz/rez-auth-client'],
};

export default nextConfig;
