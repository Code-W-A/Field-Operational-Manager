import { withSentryConfig } from "@sentry/nextjs"

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
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=*, microphone=*, geolocation=*",
          },
        ],
      },
    ]
  },
  // Configurație pentru development cu HTTPS
  ...(process.env.NODE_ENV === "development" && {
    serverExternalPackages: ["@next/env"],
  }),
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "popescu-pompiliu-ion-pfa",
  project: process.env.SENTRY_PROJECT || "fom-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
})
