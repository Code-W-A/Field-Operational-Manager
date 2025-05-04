"use client"

import type * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const { userData } = useAuth()

  // Verificăm dacă utilizatorul este admin pentru a afișa meniurile restricționate
  const isAdmin = userData?.role === "admin"
  const isTechnician = userData?.role === "tehnician"

  return (
    <nav className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <Link
        href="/dashboard"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary",
          pathname === "/dashboard" ? "text-primary" : "text-muted-foreground",
        )}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/lucrari"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary",
          pathname === "/dashboard/lucrari" || pathname.startsWith("/dashboard/lucrari/")
            ? "text-primary"
            : "text-muted-foreground",
        )}
      >
        Lucrări
      </Link>
      {!isTechnician && (
        <Link
          href="/dashboard/clienti"
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/clienti" || pathname.startsWith("/dashboard/clienti/")
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          Clienți
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/dashboard/contracte"
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/contracte" || pathname.startsWith("/dashboard/contracte/")
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          Contracte
        </Link>
      )}
      <Link
        href="/dashboard/rapoarte"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary",
          pathname === "/dashboard/rapoarte" ? "text-primary" : "text-muted-foreground",
        )}
      >
        Rapoarte
      </Link>
      {isAdmin && (
        <>
          <Link
            href="/dashboard/utilizatori"
            className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/utilizatori" ? "text-primary" : "text-muted-foreground",
            )}
          >
            Utilizatori
          </Link>
          <Link
            href="/dashboard/loguri"
            className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              pathname === "/dashboard/loguri" ? "text-primary" : "text-muted-foreground",
            )}
          >
            Loguri
          </Link>
        </>
      )}
    </nav>
  )
}
