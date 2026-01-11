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
      const url = req.nextUrl.clone()
      url.pathname = "/kiosk"
      return NextResponse.redirect(url)
    }
  }

  // Client → redirect away from dashboard except allowed pages
  if (pathname.startsWith("/dashboard") && role === "client" && !isAllowedClientDashboardPath(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = "/portal"
    return NextResponse.redirect(url)
  }

  // Technician → /dashboard should go straight to /dashboard/lucrari
  if (role === "tehnician" && pathname === "/dashboard") {
    const url = req.nextUrl.clone()
    url.pathname = "/dashboard/lucrari"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/:path*"],
}


