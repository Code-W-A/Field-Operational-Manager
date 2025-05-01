"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  ClipboardList,
  Users,
  Settings,
  FileText,
  Home,
  LayoutDashboard,
  UserCog,
  History,
  BarChart3,
  ShieldAlert,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

export function MainNav() {
  const pathname = usePathname()
  const { userData } = useAuth()

  // Verificăm dacă utilizatorul are rolul de admin
  const isAdmin = userData?.role === "admin"
  const isTechnician = userData?.role === "tehnician"

  // Adăugăm link-ul către pagina de rapoarte în array-ul de items
  const items = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="mr-2 h-4 w-4" />,
    },
    {
      title: "Lucrări",
      href: "/dashboard/lucrari",
      icon: <ClipboardList className="mr-2 h-4 w-4" />,
    },
    {
      title: "Clienți",
      href: "/dashboard/clienti",
      icon: <Users className="mr-2 h-4 w-4" />,
    },
    {
      title: "Utilizatori",
      href: "/dashboard/utilizatori",
      icon: <UserCog className="mr-2 h-4 w-4" />,
    },
    {
      title: "Loguri",
      href: "/dashboard/loguri",
      icon: <History className="mr-2 h-4 w-4" />,
    },
    {
      title: "Rapoarte",
      href: "/dashboard/rapoarte",
      icon: <BarChart3 className="mr-2 h-4 w-4" />,
    },
    { href: "/dashboard/admin", label: "Administrare", icon: <ShieldAlert className="mr-2 h-4 w-4" />, role: "admin" },
    { title: "Email Debug", href: "/dashboard/admin/email-debug", role: "admin" },
  ]

  return (
    <div className="flex gap-6 md:gap-10">
      <Link href="/" className="hidden items-center space-x-2 md:flex">
        <span className="hidden font-bold sm:inline-block">FOM</span>
      </Link>
      <nav className="hidden md:flex items-center gap-4 text-sm">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/dashboard/lucrari"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/lucrari" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Lucrări</span>
        </Link>
        <Link
          href="/dashboard/clienti"
          className={cn(
            "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
            pathname === "/dashboard/clienti" ? "text-primary" : "text-muted-foreground",
            isTechnician ? "hidden" : "", // Hide for technicians
          )}
        >
          <Users className="h-4 w-4" />
          <span>Clienți</span>
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
            <Link
              href="/dashboard/admin"
              className={cn(
                "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
                pathname === "/dashboard/admin" ? "text-primary" : "text-muted-foreground",
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Administrare</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  )
}
