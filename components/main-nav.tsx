"use client"

import type * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

// Adăugăm importurile pentru iconițe
import {
  ClipboardList,
  Users,
  Settings,
  FileText,
  LayoutDashboard,
  BarChart3,
  FileCodeIcon as FileContract,
} from "lucide-react"

// Actualizăm componenta MainNav pentru a include iconițele și logo-ul FOM
export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const { userData } = useAuth()

  // Verificăm dacă utilizatorul este admin pentru a afișa meniurile restricționate
  const isAdmin = userData?.role === "admin"
  const isTechnician = userData?.role === "tehnician"

  return (
    <div className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <Link href="/" className="hidden items-center space-x-2 md:flex">
        <span className="hidden font-bold sm:inline-block">FOM</span>
      </Link>
      <nav className="flex items-center space-x-4 lg:space-x-6">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/dashboard/lucrari"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/lucrari" || pathname.startsWith("/dashboard/lucrari/")
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Lucrări</span>
        </Link>
        {!isTechnician && (
          <Link
            href="/dashboard/clienti"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/clienti" || pathname.startsWith("/dashboard/clienti/")
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Users className="h-4 w-4" />
            <span>Clienți</span>
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/dashboard/contracte"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/contracte" || pathname.startsWith("/dashboard/contracte/")
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <FileContract className="h-4 w-4" />
            <span>Contracte</span>
          </Link>
        )}
        <Link
          href="/dashboard/rapoarte"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/rapoarte" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Rapoarte</span>
        </Link>
        {isAdmin && (
          <>
            <Link
              href="/dashboard/utilizatori"
              className={cn(
                "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
                pathname === "/dashboard/utilizatori" ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
              <span>Utilizatori</span>
            </Link>
            <Link
              href="/dashboard/loguri"
              className={cn(
                "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
                pathname === "/dashboard/loguri" ? "text-primary" : "text-muted-foreground",
              )}
            >
              <FileText className="h-4 w-4" />
              <span>Loguri</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  )
}
