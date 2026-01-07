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

  // Only guard dashboard routes; avoid touching API/static.
  if (!pathname.startsWith("/dashboard")) return NextResponse.next()

  const roleCookie = req.cookies.get("userRole")?.value
  const role = roleCookie ? decodeURIComponent(roleCookie) : undefined

  // Client → redirect away from dashboard except allowed pages
  if (role === "client" && !isAllowedClientDashboardPath(pathname)) {
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
  matcher: ["/dashboard/:path*"],
}


