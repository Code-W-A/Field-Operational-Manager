import type { NextRequest } from "next/server"

export interface OfferRequestMeta {
  ip: string | null
  userAgent: string | null
  referer: string | null
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

export function extractOfferRequestMeta(request?: NextRequest | null): OfferRequestMeta {
  if (!request) {
    return { ip: null, userAgent: null, referer: null }
  }

  const forwarded = request.headers.get("x-forwarded-for")
  const ip = safeString(forwarded?.split(",")[0] || request.headers.get("x-real-ip") || "", 128) || null

  return {
    ip,
    userAgent: safeString(request.headers.get("user-agent") || "", 800) || null,
    referer: safeString(request.headers.get("referer") || "", 1000) || null,
  }
}
