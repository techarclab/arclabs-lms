import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@arc/ui', '@arc/types', '@arc/validation'],
  poweredByHeader: false,
};

export default nextConfig;
