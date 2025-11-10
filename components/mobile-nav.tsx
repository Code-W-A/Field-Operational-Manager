"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
// Adăugăm importul pentru Cog
import { ClipboardList, Users, Settings, FileText, Home, LogOut, BarChart3, StickyNote, Archive, Sliders } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { signOut } from "@/lib/firebase/auth"

export function MobileNav({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const { userData } = useAuth()
  const router = useRouter()

  // Verificăm dacă utilizatorul are rolul de admin
  const isAdmin = userData?.role === "admin"
  const isTechnician = userData?.role === "tehnician"
  const isDispatcher = userData?.role === "dispecer"
  const isClient = userData?.role === "client"
  const isAdminOrDispatcher = isAdmin || isDispatcher

  return (
    <Sheet open={open} onOpenChange={setOpen} {...props}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col w-full max-w-full sm:max-w-sm p-0">
        <div className="px-6 py-6 border-b">
          <Link href="/" className="flex items-center space-x-2" onClick={() => setOpen(false)}>
            <span className="font-bold text-lg">Field Operational Manager</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-1 px-4 py-4 flex-1">
          {isClient ? (
            <Link
              href="/portal"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                pathname === "/portal" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
              )}
            >
              <ClipboardList className="h-5 w-5" />
              <span>Lucrările mele</span>
            </Link>
          ) : (
            <>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                  pathname === "/dashboard" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
                )}
              >
                <Home className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/dashboard/lucrari"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                  pathname === "/dashboard/lucrari" || pathname.startsWith("/dashboard/lucrari/")
                    ? "bg-blue-100 text-blue-900"
                    : "hover:bg-muted",
                )}
              >
                <ClipboardList className="h-5 w-5" />
                <span>Lucrări</span>
              </Link>
              {isAdminOrDispatcher && (
                <Link
                  href="/dashboard/arhivate"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    pathname === "/dashboard/arhivate" || pathname.startsWith("/dashboard/arhivate/")
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-muted",
                  )}
                >
                  <Archive className="h-5 w-5" />
                  <span>Arhivate</span>
                </Link>
              )}
              {!isTechnician && (
                <Link
                  href="/dashboard/clienti"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    pathname === "/dashboard/clienti" || pathname.startsWith("/dashboard/clienti/")
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-muted",
                  )}
                >
                  <Users className="h-5 w-5" />
                  <span>Clienți</span>
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/dashboard/contracte"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    pathname === "/dashboard/contracte" || pathname.startsWith("/dashboard/contracte/")
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-muted",
                  )}
                >
                  <FileText className="h-5 w-5" />
                  <span>Contracte</span>
                </Link>
              )}
              {!isTechnician && !isDispatcher && (
                <Link
                  href="/dashboard/rapoarte"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    pathname === "/dashboard/rapoarte" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
                  )}
                >
                  <BarChart3 className="h-5 w-5" />
                  <span>Rapoarte</span>
                </Link>
              )}
              {isAdmin && (
                <>
                  <Link
                    href="/dashboard/utilizatori"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      pathname === "/dashboard/utilizatori" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
                    )}
                  >
                    <Settings className="h-5 w-5" />
                    <span>Utilizatori</span>
                  </Link>
                  <Link
                    href="/dashboard/loguri"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      pathname === "/dashboard/loguri" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
                    )}
                  >
                    <FileText className="h-5 w-5" />
                    <span>Loguri</span>
                  </Link>
                  <Link
                    href="/dashboard/setari"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      pathname === "/dashboard/setari" || pathname.startsWith("/dashboard/setari/")
                        ? "bg-blue-100 text-blue-900"
                        : "hover:bg-muted",
                    )}
                  >
                    <Sliders className="h-5 w-5" />
                    <span>Setări</span>
                  </Link>
                </>
              )}
              {!isTechnician && (
                <Link
                  href="/dashboard/note-interne"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    pathname === "/dashboard/note-interne" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
                  )}
                >
                  <StickyNote className="h-5 w-5" />
                  <span>Note interne</span>
                </Link>
              )}
            </>
          )}
        </nav>
        <div className="border-t px-4 py-4">
          <button
            onClick={async () => {
              try {
                await signOut()
              } catch (e) {
                // ignore and continue navigation
              } finally {
                setOpen(false)
                router.push("/login")
              }
            }}
            className="w-full text-left flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <LogOut className="h-5 w-5" />
            <span>Deconectare</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
