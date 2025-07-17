/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Configurație pentru funcții native (cameră, locație) 
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=*, geolocation=*'
          }
        ],
      },
    ]
  },
  // Configurație pentru development cu HTTPS
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      serverComponentsExternalPackages: ['@next/env']
    }
  })
}

export default nextConfig