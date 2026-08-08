"use client"

import * as React from "react"
import Link from "next/link"
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

export interface WorkBubbleAssignedProps extends React.HTMLAttributes<HTMLElement> {
  title?: string
  subtitle?: string
  emitent?: string
  status?: string
  equipmentList?: string[]
  colorClass?: string
  href?: string
  onClick?: () => void
}

export function WorkBubbleAssigned({
  title,
  subtitle,
  emitent,
  status,
  equipmentList,
  colorClass = "bg-slate-600",
  href,
  onClick,
  className,
  ...props
}: WorkBubbleAssignedProps) {
  const hasMultipleEquipment = Array.isArray(equipmentList) && equipmentList.length > 1

  const style = {
    width: BUBBLE_CONFIG.width,
    maxWidth: "100%",
    marginLeft: BUBBLE_CONFIG.marginLeft,
    marginRight: BUBBLE_CONFIG.marginRight,
  }

  const bubbleClassName = cn(
    // Full width: Link/<a> e inline by default — fără block/flex, pe mobil se colapsează la o fâșie
    "group flex flex-col cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors overflow-hidden min-w-0 w-full max-w-full box-border",
    "hover:shadow-sm active:scale-[0.99]",
    "no-underline",
    colorClass ? `border-transparent text-white ${colorClass}` : "border-gray-200 bg-gray-50",
    className,
  )

  const content = (
    <>
      <div className="text-sm leading-tight min-w-0 max-w-full w-full whitespace-normal break-words">{title || "-"}</div>
      <div className="text-xs opacity-90 leading-tight min-w-0 max-w-full w-full whitespace-normal break-words">
        {hasMultipleEquipment ? (
          <span className="inline-flex items-center gap-2">
            <span>Echipamente</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white"
                    role="note"
                    aria-label={`Echipamente (${equipmentList.length})`}
                  >
                    {equipmentList.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="whitespace-pre-line">{equipmentList.join("\n")}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        ) : (
          subtitle || "-"
        )}
      </div>
      {emitent && (
        <div className="text-xs opacity-80 leading-tight min-w-0 max-w-full w-full whitespace-normal break-words mt-0.5">
          Emitent: {emitent}
        </div>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href} onClick={onClick} style={style} className={bubbleClassName} {...(props as any)}>
        {content}
      </Link>
    )
  }

  return (
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
      style={style}
      className={bubbleClassName}
      {...props}
    >
      {content}
    </div>
  )
}
