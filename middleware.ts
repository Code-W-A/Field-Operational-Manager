import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

function isAllowedClientDashboardPath(pathname: string) {
  return (
    pathname === "/dashboard/lucrari" ||
    pathname.startsWith("/dashboard/lucrari/") ||
    pathname === "/dashboard/istoric-interventii" ||
    pathname.startsWith("/dashboard/istoric-interventii/")
  )
}

function localSafeRedirectUrl(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone()
  url.pathname = pathname

  // Next production server may canonicalize local requests to `localhost`, which
  // would drop Auth state created on 127.0.0.1 during emulator tests.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    const requestHost = req.headers.get("host")
    if (requestHost === "127.0.0.1:3100" || requestHost === "localhost:3100") {
      url.host = requestHost
    }
  }

  return url
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Avoid touching API and Next internal assets.
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) return NextResponse.next()
  // Skip typical static file requests from /public (favicon, images, fonts, etc).
  if (pathname.includes(".")) return NextResponse.next()

  const roleCookie = req.cookies.get("userRole")?.value
  const role = roleCookie ? decodeURIComponent(roleCookie) : undefined

  // Kiosk → hard lockdown: only /kiosk is accessible (plus /login for initial auth).
  if (role === "kiosk") {
    const isAllowed = pathname === "/kiosk" || pathname.startsWith("/kiosk/") || pathname === "/login"
    if (!isAllowed) {
      return NextResponse.redirect(localSafeRedirectUrl(req, "/kiosk"))
    }
  }

  // Client → redirect away from dashboard except allowed pages
  if (pathname.startsWith("/dashboard") && role === "client" && !isAllowedClientDashboardPath(pathname)) {
    return NextResponse.redirect(localSafeRedirectUrl(req, "/portal"))
  }

  // Technician → /dashboard should go straight to /dashboard/lucrari
  if (role === "tehnician" && pathname === "/dashboard") {
    return NextResponse.redirect(localSafeRedirectUrl(req, "/dashboard/lucrari"))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/:path*"],
}

