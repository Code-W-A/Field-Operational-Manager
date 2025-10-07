import type React from "react"
import { cn } from "@/lib/utils"

interface DashboardHeaderProps {
  heading: React.ReactNode
  text?: string
  children?: React.ReactNode
  headerAction?: React.ReactNode // Nou: element în partea dreaptă a titlului
  className?: string
}

export function DashboardHeader({ heading, text, children, headerAction, className }: DashboardHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 pb-5 md:flex-row md:items-center md:justify-between", className)}>
      <div className="grid gap-1 flex-1">
        <div className="flex items-center justify-start">
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          {headerAction && (
            <div className="flex items-center ml-4">
              {headerAction}
            </div>
          )}
        </div>
        {text && <p className="text-muted-foreground">{text}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2 mt-3 md:mt-0">{children}</div>}
    </div>
  )
}
