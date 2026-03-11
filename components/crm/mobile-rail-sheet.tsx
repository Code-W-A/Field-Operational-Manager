"use client"

import { type ReactNode, useState } from "react"
import { type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface MobileRailSheetProps {
  side: "left" | "right"
  title: string
  triggerLabel: string
  triggerIcon?: LucideIcon
  className?: string
  children: ReactNode | ((controls: { close: () => void }) => ReactNode)
}

export function MobileRailSheet({
  side,
  title,
  triggerLabel,
  triggerIcon: TriggerIcon,
  className,
  children,
}: MobileRailSheetProps) {
  const [open, setOpen] = useState(false)
  const content = typeof children === "function" ? children({ close: () => setOpen(false) }) : children

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs">
          {TriggerIcon ? <TriggerIcon className="h-3.5 w-3.5" /> : null}
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side={side} className={cn("w-[92vw] max-w-sm overflow-y-auto p-0", className)}>
        <SheetHeader className="border-b border-neutral-200 px-4 py-3 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 px-3 py-3">{content}</div>
      </SheetContent>
    </Sheet>
  )
}
