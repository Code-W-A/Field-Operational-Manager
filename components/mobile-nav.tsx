"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { LogOut } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useAuth } from "@/contexts/AuthContext"
import { signOut } from "@/lib/firebase/auth"
import { buildNav, isNavGroupActive, isNavLinkActive, type NavGroup, type NavLink } from "@/lib/navigation/nav-items"

export function MobileNav({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { userData } = useAuth()
  const router = useRouter()

  const tab = searchParams.get("tab") ?? "variabile"
  const nodes = buildNav({ role: (userData?.role as any) ?? null })

  const getLinkHref = (link: NavLink) => {
    if (link.id === "setari-variabile") return `${link.href}?tab=variabile`
    if (link.id === "setari-documentatii") return `${link.href}?tab=documentatii`
    if (link.id === "setari-sistem") return `${link.href}?tab=sistem`
    return link.href
  }

  const isLinkActive = (link: NavLink) => {
    if (link.href === "/dashboard/setari") {
      if (!pathname.startsWith("/dashboard/setari")) return false
      if (link.id === "setari-sistem") return tab === "sistem"
      if (link.id === "setari-documentatii") return tab === "documentatii"
      if (link.id === "setari-variabile") return tab === "variabile"
    }
    return isNavLinkActive(pathname, link)
  }

  const isGroupActive = (group: NavGroup) => {
    if (group.id === "setari" && pathname.startsWith("/dashboard/setari")) return true
    return isNavGroupActive(pathname, group)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} {...props}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col w-full max-w-full sm:max-w-sm p-0">
        <div className="px-6 py-6 border-b">
          <Link href="/" className="flex items-center space-x-2" onClick={() => setOpen(false)}>
            <span className="font-bold text-lg">Field Operational Manager</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-2 px-4 py-4 flex-1">
          <Accordion
            type="multiple"
            defaultValue={nodes
              .filter((n) => n.type === "group")
              .map((n) => (isGroupActive(n as NavGroup) ? (n as NavGroup).id : null))
              .filter(Boolean) as string[]}
            className="w-full"
          >
            {nodes.map((node) => {
              if (node.type === "link") {
                const Icon = node.icon
                const active = isLinkActive(node)
                return (
                  <Link
                    key={node.id}
                    href={getLinkHref(node)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      active ? "bg-blue-100 text-blue-900" : "hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{node.label}</span>
                  </Link>
                )
              }

              const groupActive = isGroupActive(node)
              const GroupIcon = node.icon
              return (
                <AccordionItem key={node.id} value={node.id} className="border-none">
                  <AccordionTrigger
                    className={cn(
                      "px-3 py-3 rounded-md hover:no-underline text-sm font-medium",
                      groupActive ? "bg-blue-100 text-blue-900" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <GroupIcon className="h-5 w-5" />
                      {node.label}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="flex flex-col gap-1 pl-2">
                      {node.items.map((item) => {
                        const ItemIcon = item.icon
                        const active = isLinkActive(item)
                        return (
                          <Link
                            key={item.id}
                            href={getLinkHref(item)}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              active ? "bg-blue-50 text-blue-900" : "hover:bg-muted"
                            )}
                          >
                            <ItemIcon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </nav>
        <div className="border-t px-4 py-4">
          <button
            onClick={async () => {
              try {
                await signOut()
              } catch (e) {
                // ignore and continue navigation
              } finally {
                setOpen(false)
                router.push("/login")
              }
            }}
            className="w-full text-left flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <LogOut className="h-5 w-5" />
            <span>Deconectare</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
