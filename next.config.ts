import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Chakra exports hundreds of components: import only the ones a page uses
  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
  },
  // The Postgres driver stays a Node dependency, out of the bundle
  serverExternalPackages: ['pg'],
  // `next dev` would write an AGENTS.md for AI agents into the checkout on
  // every run; CLAUDE.md points them to the same docs (node_modules/next/dist/docs)
  agentRules: false,
}

export default nextConfig
