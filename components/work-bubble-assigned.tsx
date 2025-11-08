"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// ===== DIMENSIUNI CONFIGURABILE =====
// Poți edita aceste valori pentru a schimba dimensiunile bubble-urilor
const BUBBLE_CONFIG = {
  width: "100%",            // Lățime (100% = ocupă toată lățimea disponibilă, sau ex: "200px" pentru lățime fixă)
  marginLeft: "0px",        // Margin stânga
  marginRight: "0px",       // Margin dreapta
  paddingX: "12px",         // Padding orizontal (3 = 12px)
  paddingY: "6px",          // Padding vertical (1.5 = 6px)
  borderRadius: "8px",      // Border radius (lg = 8px)
  titleFontSize: "14px",    // Font size pentru titlu (sm = 14px)
  subtitleFontSize: "12px", // Font size pentru subtitle (xs = 12px)
}
// ====================================

export interface WorkBubbleAssignedProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  colorClass?: string
  onClick?: () => void
}

export function WorkBubbleAssigned({ title, subtitle, colorClass = "bg-slate-600", onClick, className, ...props }: WorkBubbleAssignedProps) {
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
              width: BUBBLE_CONFIG.width,
              maxWidth: "100%",
              marginLeft: BUBBLE_CONFIG.marginLeft,
              marginRight: BUBBLE_CONFIG.marginRight,
            }}
            className={cn(
              // Full width responsive - ocupă întreaga lățime disponibilă în CardContent
              "group cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors overflow-hidden min-w-0 w-full box-border",
              "hover:shadow-sm active:scale-[0.99]",
              colorClass ? `border-transparent text-white ${colorClass}` : "border-gray-200 bg-gray-50",
              className,
            )}
            {...props}
          >
            <div className="text-sm leading-tight min-w-0 max-w-full w-full whitespace-normal break-words">{title || "-"}</div>
            <div className="text-xs opacity-90 leading-tight min-w-0 max-w-full w-full whitespace-normal break-words">{subtitle || "-"}</div>
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


