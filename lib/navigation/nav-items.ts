import type { LucideIcon } from "lucide-react"
import {
  Archive,
  BarChart3,
  Building2,
  ClipboardList,
  FileCodeIcon,
  FileText,
  History,
  LayoutDashboard,
  Sliders,
  StickyNote,
  Users,
  UserRound,
} from "lucide-react"

export type UserRole = "admin" | "dispecer" | "tehnician" | "client" | "kiosk" | (string & {})

export type NavActiveMatch = "exact" | "prefix"

export interface NavCtx {
  role?: UserRole | null
}

export interface NavLink {
  type: "link"
  id: string
  label: string
  href: string
  icon: LucideIcon
  activeMatch?: NavActiveMatch
  /** Optional extra paths that should mark this link active (prefix match). */
  activeAlsoStartsWith?: string[]
  visible?: (ctx: NavCtx) => boolean
}

export interface NavGroup {
  type: "group"
  id: string
  label: string
  icon: LucideIcon
  items: NavLink[]
  visible?: (ctx: NavCtx) => boolean
}

export type NavNode = NavLink | NavGroup

export function getRoleFlags(ctx: NavCtx) {
  const role = ctx.role ?? null
  const isAdmin = role === "admin"
  const isTechnician = role === "tehnician"
  const isDispatcher = role === "dispecer"
  const isClient = role === "client"
  const isKiosk = role === "kiosk"
  const isAdminOrDispatcher = isAdmin || isDispatcher

  return { role, isAdmin, isTechnician, isDispatcher, isClient, isKiosk, isAdminOrDispatcher }
}

export function isHrefActive(pathname: string, href: string, match: NavActiveMatch = "prefix") {
  if (!pathname) return false
  if (match === "exact") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isNavLinkActive(pathname: string, link: NavLink) {
  if (isHrefActive(pathname, link.href, link.activeMatch ?? "prefix")) return true
  if (link.activeAlsoStartsWith?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  return false
}

export function isNavGroupActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => isNavLinkActive(pathname, item))
}

export function filterNav(nodes: NavNode[], ctx: NavCtx): NavNode[] {
  return nodes
    .filter((n) => (n.visible ? n.visible(ctx) : true))
    .map((n) => {
      if (n.type === "group") {
        const items = n.items.filter((i) => (i.visible ? i.visible(ctx) : true))
        return { ...n, items }
      }
      return n
    })
    .filter((n) => (n.type === "group" ? n.items.length > 0 : true))
}

export function buildNav(ctx: NavCtx): NavNode[] {
  const { isAdmin, isTechnician, isDispatcher, isClient, isKiosk, isAdminOrDispatcher } = getRoleFlags(ctx)
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

  if (isClient) {
    return filterNav(
      [
        {
          type: "link",
          id: "portal",
          label: "Tichetele mele",
          href: "/portal",
          icon: ClipboardList,
          activeMatch: "exact",
        },
        {
          type: "link",
          id: "istoric-interventii",
          label: "Istoric intervenții",
          href: "/dashboard/istoric-interventii",
          icon: History,
          activeMatch: "prefix",
        },
      ],
      ctx
    )
  }

  const nodes: NavNode[] = [
    {
      type: "link",
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      activeMatch: "exact",
    },
    {
      type: "link",
      id: "cererile-mele",
      label: "Cererile mele",
      href: "/dashboard/cereri",
      icon: FileText,
      activeMatch: "prefix",
      visible: () => isTechnician,
    },
    {
      type: "group",
      id: "tichete",
      label: "Tichete",
      icon: ClipboardList,
      items: [
        {
          type: "link",
          id: "tichete-active",
          label: "Active",
          href: "/dashboard/lucrari",
          icon: ClipboardList,
          activeMatch: "prefix",
        },
        {
          type: "link",
          id: "tichete-arhivate",
          label: "Arhivate",
          href: "/dashboard/arhivate",
          icon: Archive,
          activeMatch: "prefix",
          visible: () => isAdminOrDispatcher,
        },
      ],
    },
    {
      type: "link",
      id: "istoric-interventii",
      label: "Istoric intervenții",
      href: "/dashboard/istoric-interventii",
      icon: History,
      activeMatch: "prefix",
      // Tehnicianul vede pagina doar cu "Verifică istoric" (QR), fără lista completă.
      visible: () => true,
    },
    {
      type: "group",
      id: "clienti",
      label: "Clienți",
      icon: Users,
      visible: () => !isTechnician,
      items: [
        {
          type: "link",
          id: "clienti-detalii",
          label: "Detalii clienți",
          href: "/dashboard/clienti",
          icon: Users,
          activeMatch: "prefix",
          visible: () => !isTechnician,
        },
        {
          type: "link",
          id: "clienti-facturi",
          label: "Facturi",
          href: "/dashboard/facturi",
          icon: FileText,
          activeMatch: "prefix",
          visible: () => isAdminOrDispatcher,
        },
        {
          type: "link",
          id: "contracte-mentenanta",
          label: "Contracte de mentenanță",
          href: "/dashboard/contracte",
          icon: FileCodeIcon,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
      ],
    },
    {
      type: "group",
      id: "resurse-umane",
      label: "Resurse umane",
      icon: UserRound,
      visible: () => isAdminOrDispatcher,
      items: [
        {
          type: "link",
          id: "hr-salariati",
          label: "Salariați",
          href: "/dashboard/resurse-umane/salariati",
          icon: Users,
          activeMatch: "prefix",
        },
        {
          type: "link",
          id: "hr-departamente",
          label: "Departamente",
          href: "/dashboard/resurse-umane/departamente",
          icon: Building2,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
        {
          type: "link",
          id: "hr-pontaj",
          label: "Condică prezență",
          href: "/dashboard/resurse-umane/condica-prezenta",
          icon: ClipboardList,
          activeMatch: "prefix",
        },
        {
          type: "link",
          id: "cereri-aprobari",
          label: "Concendii si evenimente",
          href: "/dashboard/cereri-aprobari",
          icon: ClipboardList,
          activeMatch: "prefix",
        },
        {
          type: "link",
          id: "hr-rapoarte",
          label: "Rapoarte",
          href: "/dashboard/resurse-umane/rapoarte",
          icon: BarChart3,
          activeMatch: "prefix",
        },
      ],
    },
    {
      type: "link",
      id: "rapoarte",
      label: "Rapoarte",
      href: "/dashboard/rapoarte",
      icon: BarChart3,
      activeMatch: "prefix",
      visible: () => !isTechnician && !isDispatcher,
    },
    {
      type: "group",
      id: "setari",
      label: "Setări",
      icon: Sliders,
      visible: () => isAdmin,
      items: [
        {
          type: "link",
          id: "admin-tools",
          label: "Administrare",
          href: "/dashboard/admin",
          icon: Sliders,
          activeMatch: "prefix",
          visible: () => isAdmin && debugEnabled,
        },
        {
          type: "link",
          id: "utilizatori",
          label: "Utilizatori",
          href: "/dashboard/utilizatori",
          icon: Sliders,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
        {
          type: "link",
          id: "loguri",
          label: "Loguri",
          href: "/dashboard/loguri",
          icon: FileText,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
        {
          type: "link",
          id: "setari-variabile",
          label: "Variabile",
          href: "/dashboard/setari",
          icon: Sliders,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
        {
          type: "link",
          id: "setari-sistem",
          label: "Setări de sistem",
          href: "/dashboard/setari",
          icon: Sliders,
          activeMatch: "prefix",
          visible: () => isAdmin,
        },
      ],
    },
    {
      type: "link",
      id: "note-interne",
      label: "Note interne",
      href: "/dashboard/note-interne",
      icon: StickyNote,
      activeMatch: "prefix",
      visible: () => !isTechnician,
    },
  ]

  return filterNav(nodes, ctx)
}


