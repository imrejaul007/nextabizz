import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nextabizz/shared-types', '@nextabizz/rez-auth-client'],
};

export default nextConfig;
