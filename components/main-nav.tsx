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
  StickyNote,
  Archive,
} from "lucide-react"

// Actualizăm componenta MainNav pentru a include iconițele și logo-ul FOM
export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const { userData } = useAuth()

  // Verificăm dacă utilizatorul este admin pentru a afișa meniurile restricționate
  const role = userData?.role
  const isAdmin = role === "admin"
  const isTechnician = role === "tehnician"
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const isClient = role === "client"

  return (
    <div className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <Link href="/" className="hidden md:flex items-center space-x-2">
        <span className="hidden font-bold sm:inline-block">FOM</span>
      </Link>
      <nav className="hidden md:flex items-center space-x-4 lg:space-x-6">
        {isClient ? (
          <Link
            href="/portal"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              pathname === "/portal" ? "text-primary" : "text-muted-foreground",
            )}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Lucrările mele</span>
          </Link>
        ) : (
          <>
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
        {isAdminOrDispatcher && (
          <Link
            href="/dashboard/arhivate"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/arhivate" || pathname.startsWith("/dashboard/arhivate/")
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Archive className="h-4 w-4" />
            <span>Arhivate</span>
          </Link>
        )}
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
        {!isTechnician && userData?.role !== "dispecer" && (
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
        )}
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
        {!isTechnician && (
          <Link
            href="/dashboard/note-interne"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/note-interne" ? "text-primary" : "text-muted-foreground",
            )}
          >
            <StickyNote className="h-4 w-4" />
            <span>Note interne</span>
          </Link>
        )}
          </>
        )}
      </nav>
    </div>
  )
}
