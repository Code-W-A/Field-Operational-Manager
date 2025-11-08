"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface WorkBubbleStatusProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  colorClass?: string
  onClick?: () => void
}

export function WorkBubbleStatus({ title, subtitle, colorClass = "bg-slate-600", onClick, className, ...props }: WorkBubbleStatusProps) {
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
              "w-full",
              "min-w-0",
              "max-w-full",
              "min-h-14",
              "px-3",
              "py-2",
              "box-border",
              "rounded-lg",
              "border",
              "cursor-pointer",
              "transition-colors",
              "hover:shadow-sm",
              "active:scale-[0.99]",
              "flex",
              "flex-col",
              "justify-center",
              "overflow-hidden",
              colorClass ? `border-transparent text-white ${colorClass}` : "border-gray-200 bg-gray-50",
              className,
            )}
            {...props}
          >
            <div 
              className="text-sm leading-tight text-white whitespace-normal break-words min-w-0 max-w-full w-full"
            >
              {title || "-"}
            </div>
            {subtitle && (
              <div 
                className="text-xs opacity-90 leading-tight text-white mt-0.5 whitespace-normal break-words min-w-0 max-w-full w-full"
              >
                {subtitle}
              </div>
            )}
          </div>
        </TooltipTrigger>
        {(title || subtitle) && (
          <TooltipContent>
            <div className="text-xs">
              <div className="font-medium">{title}</div>
              {subtitle && <div className="opacity-80">{subtitle}</div>}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
