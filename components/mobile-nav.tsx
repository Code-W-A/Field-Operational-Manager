"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
// Adăugăm importul pentru Cog
import { ClipboardList, Users, Settings, FileText, Home, LogOut } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

export function MobileNav({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const { userData } = useAuth()

  // Verificăm dacă utilizatorul are rolul de admin
  const isAdmin = userData?.role === "admin"
  const isTechnician = userData?.role === "tehnician"

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
              pathname === "/dashboard/lucrari" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
            )}
          >
            <ClipboardList className="h-5 w-5" />
            <span>Lucrări</span>
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/clienti"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                pathname === "/dashboard/clienti" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
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
                pathname === "/dashboard/contracte" ? "bg-blue-100 text-blue-900" : "hover:bg-muted",
              )}
            >
              <FileText className="h-5 w-5" />
              <span>Contracte</span>
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
            </>
          )}
        </nav>
        <div className="border-t px-4 py-4">
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <LogOut className="h-5 w-5" />
            <span>Deconectare</span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
