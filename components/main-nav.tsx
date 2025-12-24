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
  const hoveringTriggerRef = React.useRef(false)
  const hoveringContentRef = React.useRef(false)
  const groupActive = isGroupActive(group)
  const GroupIcon = group.icon

  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimeoutRef.current = setTimeout(() => {
      // Close only if pointer is not over trigger/content anymore (prevents hover flicker with Radix portal)
      if (!hoveringTriggerRef.current && !hoveringContentRef.current) {
        setOpen(false)
      }
    }, 150)
  }

  const handleTriggerEnter = () => {
    hoveringTriggerRef.current = true
    cancelClose()
    if (!open) setOpen(true)
  }

  const handleTriggerLeave = () => {
    hoveringTriggerRef.current = false
    scheduleClose()
  }

  const handleContentEnter = () => {
    hoveringContentRef.current = true
    cancelClose()
  }

  const handleContentLeave = () => {
    hoveringContentRef.current = false
    scheduleClose()
  }

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="flex items-center">
      <DropdownMenu
        open={open}
        modal={false}
        onOpenChange={(next) => {
          // Fully controlled: only allow manual close via click on item (onSelect)
          // Hover close is handled by scheduleClose()
          if (next === false && (hoveringTriggerRef.current || hoveringContentRef.current)) {
            return
          }
          setOpen(next)
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary",
              groupActive ? "text-primary" : "text-muted-foreground"
            )}
            aria-current={groupActive ? "page" : undefined}
            onPointerEnter={handleTriggerEnter}
            onPointerLeave={handleTriggerLeave}
          >
            <GroupIcon className="h-4 w-4" />
            <span>{group.label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          onPointerEnter={handleContentEnter}
          onPointerLeave={handleContentLeave}
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
