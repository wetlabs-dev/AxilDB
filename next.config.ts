import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pdfkit', 'fontkit', 'restructure'],
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig
