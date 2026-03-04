"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TabsHeaderItem {
  href: string
  label: string
  icon: LucideIcon
}

interface TabsHeaderProps {
  items: TabsHeaderItem[]
  className?: string
}

export function TabsHeader({ items, className }: TabsHeaderProps) {
  const pathname = usePathname()

  return (
    <div className={cn("flex items-center gap-4 border-b border-neutral-200", className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-1 py-2 text-xs text-neutral-500 transition",
              active
                ? "border-blue-500 text-neutral-900"
                : "border-transparent hover:border-neutral-300 hover:text-neutral-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
