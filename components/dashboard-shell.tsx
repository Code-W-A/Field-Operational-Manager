import type React from "react"
import { MainNav } from "@/components/main-nav"
import { UserNav } from "@/components/user-nav"
import { MobileNav } from "@/components/mobile-nav"

interface DashboardShellProps {
  children: React.ReactNode
  className?: string
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-16 items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2">
            <MobileNav />
            <MainNav />
          </div>
          <UserNav />
        </div>
      </header>
      <main className="flex-1">
        <div className="container grid gap-6 py-6 md:py-8 px-6 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  )
}
