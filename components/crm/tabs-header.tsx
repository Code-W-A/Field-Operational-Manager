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
    <div
      className={cn(
        "flex items-center gap-6 overflow-x-auto border-b border-neutral-200 whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2.5 whitespace-nowrap border-b-[3px] px-1.5 py-3 text-sm font-medium leading-none text-neutral-500 transition",
              active
                ? "border-blue-500 text-neutral-900"
                : "border-transparent hover:border-neutral-300 hover:text-neutral-700"
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
