/** @type {import('next').NextConfig} */
const nextConfig = {
  // All APIs are now handled internally by Next.js Route Handlers
  // No need for external proxy

  // Enable standalone output for Docker deployments
  output: 'standalone',
};

export default nextConfig;
