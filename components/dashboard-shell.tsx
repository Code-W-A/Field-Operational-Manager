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
    <div className="flex flex-col min-h-screen w-full">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-16 items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2">
            <MobileNav className="md:hidden" />
            <MainNav className="hidden md:flex" />
          </div>
          <UserNav />
        </div>
      </header>
      <main className="flex-1 w-full overflow-auto">
        <div className="container py-6 md:py-8 px-6 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  )
}
