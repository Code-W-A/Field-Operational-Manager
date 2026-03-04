import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { crmUi } from "@/components/crm/ui"

interface SectionHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 md:items-center", className)}>
      <div className="min-w-0">
        <h2 className={crmUi.pageTitle}>{title}</h2>
        {description ? <p className={cn(crmUi.pageSubtitle, "truncate")}>{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
