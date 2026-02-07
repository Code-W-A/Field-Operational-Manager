import { NextResponse } from "next/server"

export async function GET() {
  // Keep this intentionally non-sensitive; useful for verifying which deployment is serving a domain.
  const info = {
    now: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null, // production | preview | development
    vercelRegion: process.env.VERCEL_REGION ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    git: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    },
  }

  return NextResponse.json(info, {
    headers: {
      "cache-control": "no-store",
    },
  })
}

