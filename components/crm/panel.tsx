import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { crmUi } from "@/components/crm/ui"

interface PanelProps {
  title?: string
  subtitle?: string
  headerAction?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  size?: "default" | "comfortable"
}

export function Panel({
  title,
  subtitle,
  headerAction,
  children,
  className,
  contentClassName,
  size = "default",
}: PanelProps) {
  const comfortable = size === "comfortable"

  return (
    <section className={cn(crmUi.panel, className)}>
      {(title || subtitle) && (
        <header className={comfortable ? crmUi.panelHeaderComfortable : crmUi.panelHeader}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title ? <h3 className={comfortable ? crmUi.panelTitleComfortable : crmUi.panelTitle}>{title}</h3> : null}
              {subtitle ? <p className={comfortable ? crmUi.panelSubtitleComfortable : crmUi.panelSubtitle}>{subtitle}</p> : null}
            </div>
            {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
          </div>
        </header>
      )}
      <div className={cn(comfortable ? crmUi.panelBodyComfortable : crmUi.panelBody, contentClassName)}>{children}</div>
    </section>
  )
}
