"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface WorkBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  colorClass?: string
  onClick?: () => void
}

export function WorkBubble({ title, subtitle, colorClass = "bg-slate-600", onClick, className, ...props }: WorkBubbleProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick?.()
              }
            }}
            className={cn(
              "group w-auto max-w-48 cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors overflow-hidden",
              "hover:shadow-sm active:scale-[0.99]",
              colorClass ? `border-transparent text-white ${colorClass}` : "border-gray-200 bg-gray-50",
              className,
            )}
            {...props}
          >
            <div className="truncate text-sm leading-tight min-w-0">{title || "-"}</div>
            <div className="truncate text-xs opacity-90 leading-tight min-w-0">{subtitle || "-"}</div>
          </div>
        </TooltipTrigger>
        {(title || subtitle) && (
          <TooltipContent>
            <div className="text-xs">
              <div className="font-medium">{title}</div>
              <div className="opacity-80">{subtitle}</div>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}


