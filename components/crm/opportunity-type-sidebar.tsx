import Link from "next/link"
import { Panel } from "@/components/crm/panel"
import { cn } from "@/lib/utils"

type OpportunityTypeSidebarItem = {
  key: string
  label: string
  count?: number
  active?: boolean
  href?: string
  onClick?: () => void
  title?: string
}

interface OpportunityTypeSidebarProps {
  homeItem: OpportunityTypeSidebarItem
  items: OpportunityTypeSidebarItem[]
  collapsibleOnMobile?: boolean
}

function SidebarEntry({
  item,
  className,
}: {
  item: OpportunityTypeSidebarItem
  className?: string
}) {
  const entryClassName = cn(
    "flex h-8 w-full items-center justify-between gap-2 rounded-md border-l-2 px-2.5 text-left text-sm transition",
    item.active
      ? "border-l-white bg-[#004b87]/45 font-semibold text-white"
      : "border-l-transparent bg-transparent text-white/90 hover:bg-[#004b87]/35 hover:text-white",
    className
  )

  const content = (
    <>
      <span className="truncate">{item.label}</span>
      {typeof item.count === "number" ? <span className="shrink-0 text-xs">{item.count}</span> : null}
    </>
  )

  if (item.href) {
    return (
      <Link href={item.href} onClick={item.onClick} className={entryClassName} title={item.title || item.label}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={item.onClick} className={entryClassName} title={item.title || item.label}>
      {content}
    </button>
  )
}

function SidebarContent({ homeItem, items }: { homeItem: OpportunityTypeSidebarItem; items: OpportunityTypeSidebarItem[] }) {
  return (
    <>
      <SidebarEntry item={homeItem} className="mb-2" />
      <div className="mb-2 mt-1 border-b border-white/35 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/85">Tip oportunitate</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {items.map((item) => (
          <SidebarEntry key={item.key} item={item} />
        ))}
      </div>
    </>
  )
}

export function OpportunityTypeSidebar({
  homeItem,
  items,
  collapsibleOnMobile = false,
}: OpportunityTypeSidebarProps) {
  return (
    <>
      {collapsibleOnMobile ? (
        <details className="rounded-md border border-[#004b87] bg-[#005599] shadow-none xl:hidden">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-white">Filtre CRM</summary>
          <div className="border-t border-white/20 px-4 py-3">
            <SidebarContent homeItem={homeItem} items={items} />
          </div>
        </details>
      ) : null}

      <Panel
        className={cn(
          "rounded-md border-[#004b87] bg-[#005599] shadow-none",
          collapsibleOnMobile
            ? "hidden xl:block xl:h-full xl:rounded-none xl:border-y-0 xl:border-l-0 xl:border-r xl:border-[#004b87]"
            : "xl:h-full xl:rounded-none xl:border-y-0 xl:border-l-0 xl:border-r xl:border-[#004b87]"
        )}
        contentClassName="flex h-full min-h-0 flex-col pt-3"
      >
        <SidebarContent homeItem={homeItem} items={items} />
      </Panel>
    </>
  )
}
