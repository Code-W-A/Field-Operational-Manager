"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// ===== DIMENSIUNI CONFIGURABILE =====
// Poți edita aceste valori pentru a schimba dimensiunile bubble-urilor
const BUBBLE_CONFIG = {
  maxWidth: "170px",        // Lățime maximă
  minWidth: "170px",        // Lățime minimă
  marginLeft: "6px",        // Margin stânga (1.5 = 6px)
  marginRight: "0px",       // Margin dreapta
  paddingX: "12px",         // Padding orizontal (3 = 12px)
  paddingY: "6px",          // Padding vertical (1.5 = 6px)
  borderRadius: "8px",      // Border radius (lg = 8px)
  titleFontSize: "14px",    // Font size pentru titlu (sm = 14px)
  subtitleFontSize: "12px", // Font size pentru subtitle (xs = 12px)
}
// ====================================

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
            style={{
              maxWidth: BUBBLE_CONFIG.maxWidth,
              minWidth: BUBBLE_CONFIG.minWidth,
            }}
            className={cn(
              // Full width with more space on the right side - cu max-width pentru texte lungi
              "group cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors overflow-hidden w-[calc(100%-6px)] ml-1.5 mr-0",
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


