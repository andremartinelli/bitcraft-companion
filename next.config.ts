import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Chakra exports hundreds of components: import only the ones a page uses
  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
  },
  // The Postgres driver stays a Node dependency, out of the bundle
  serverExternalPackages: ['pg'],
}

export default nextConfig
