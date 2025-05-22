import type { MainNavItem } from "@/types"

interface MainNavProps {
  items?: MainNavItem[]
}

export function MainNav({ items }: MainNavProps) {
  return (
    <div className="hidden gap-6 md:flex">
      {items?.map((item, index) =>
        item.href ? (
          <a
            key={index}
            href={item.href}
            className="flex items-center text-sm font-medium transition-colors hover:text-foreground/80 sm:text-base"
          >
            {item.title}
          </a>
        ) : (
          <span key={index} className="flex items-center text-sm font-medium text-muted-foreground sm:text-base">
            {item.title}
          </span>
        ),
      )}
    </div>
  )
}

const dashboardNavItems: MainNavItem[] = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: "home",
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: "analytics",
  },
  {
    title: "Administrare Cache",
    href: "/dashboard/admin/cache",
    icon: "database",
    role: "admin",
  },
]
