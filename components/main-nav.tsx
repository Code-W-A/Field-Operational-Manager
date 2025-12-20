"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildNav, isNavGroupActive, isNavLinkActive, type NavGroup, type NavLink } from "@/lib/navigation/nav-items"

function NavGroupDropdown({
  group,
  pathname,
  tab,
  getLinkHref,
  isLinkActive,
  isGroupActive,
}: {
  group: NavGroup
  pathname: string
  tab: string
  getLinkHref: (link: NavLink) => string
  isLinkActive: (link: NavLink) => boolean
  isGroupActive: (group: NavGroup) => boolean
}) {
  const [open, setOpen] = React.useState(false)
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const groupActive = isGroupActive(group)
  const GroupIcon = group.icon

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setOpen(true)
  }

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false)
    }, 200)
  }

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      className="flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              groupActive ? "text-primary" : "text-muted-foreground"
            )}
            aria-current={groupActive ? "page" : undefined}
          >
            <GroupIcon className="h-4 w-4" />
            <span>{group.label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {group.items.map((item) => {
            const ItemIcon = item.icon
            const active = isLinkActive(item)
            return (
              <DropdownMenuItem key={item.id} asChild onSelect={() => setOpen(false)}>
                <Link href={getLinkHref(item)} className={cn(active ? "font-medium" : undefined)}>
                  <ItemIcon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Actualizăm componenta MainNav pentru a include iconițele și logo-ul FOM
export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const { userData } = useAuth()
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") ?? "variabile"

  const nodes = buildNav({ role: (userData?.role as any) ?? null })

  const getLinkHref = (link: NavLink) => {
    if (link.id === "setari-variabile") return `${link.href}?tab=variabile`
    if (link.id === "setari-sistem") return `${link.href}?tab=sistem`
    return link.href
  }

  const isLinkActive = (link: NavLink) => {
    if (link.href === "/dashboard/setari") {
      if (!pathname.startsWith("/dashboard/setari")) return false
      if (link.id === "setari-sistem") return tab === "sistem"
      if (link.id === "setari-variabile") return tab !== "sistem"
    }
    return isNavLinkActive(pathname, link)
  }

  const isGroupActive = (group: NavGroup) => {
    if (group.id === "setari" && pathname.startsWith("/dashboard/setari")) return true
    return isNavGroupActive(pathname, group)
  }

  return (
    <div className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <Link href="/" className="hidden md:flex items-center space-x-2">
        <span className="hidden font-bold sm:inline-block">FOM</span>
      </Link>
      <nav className="hidden md:flex items-center space-x-4 lg:space-x-6">
        {nodes.map((node) => {
          if (node.type === "link") {
            const Icon = node.icon
            const active = isLinkActive(node)
            return (
              <Link
                key={node.id}
                href={getLinkHref(node)}
                className={cn(
                  "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{node.label}</span>
              </Link>
            )
          }

          return (
            <NavGroupDropdown
              key={node.id}
              group={node}
              pathname={pathname}
              tab={tab}
              getLinkHref={getLinkHref}
              isLinkActive={isLinkActive}
              isGroupActive={isGroupActive}
            />
          )
        })}
      </nav>
    </div>
  )
}
