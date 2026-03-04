import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { crmUi } from "@/components/crm/ui"

interface PanelProps {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function Panel({ title, subtitle, children, className, contentClassName }: PanelProps) {
  return (
    <section className={cn(crmUi.panel, className)}>
      {(title || subtitle) && (
        <header className={crmUi.panelHeader}>
          {title ? <h3 className={crmUi.panelTitle}>{title}</h3> : null}
          {subtitle ? <p className={crmUi.panelSubtitle}>{subtitle}</p> : null}
        </header>
      )}
      <div className={cn(crmUi.panelBody, contentClassName)}>{children}</div>
    </section>
  )
}
