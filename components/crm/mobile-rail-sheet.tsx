"use client"

import { type ReactNode } from "react"
import { type LucideIcon } from "lucide-react"
import { RailDrawer } from "@/components/crm/rail-drawer"

interface MobileRailSheetProps {
  side: "left" | "right"
  title: string
  triggerLabel: string
  triggerIcon?: LucideIcon
  iconOnly?: boolean
  triggerClassName?: string
  className?: string
  children: ReactNode | ((controls: { close: () => void }) => ReactNode)
}

export function MobileRailSheet({
  side,
  title,
  triggerLabel,
  triggerIcon: TriggerIcon,
  iconOnly = false,
  triggerClassName,
  className,
  children,
}: MobileRailSheetProps) {
  return (
    <RailDrawer
      side={side}
      title={title}
      triggerLabel={triggerLabel}
      triggerIcon={TriggerIcon}
      iconOnly={iconOnly}
      triggerClassName={triggerClassName}
      className={className}
      bodyClassName="min-h-0 px-3 py-3"
      mode="sheet"
    >
      {children}
    </RailDrawer>
  )
}
