"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface WorkBubbleStatusProps extends React.HTMLAttributes<HTMLElement> {
  title?: string
  subtitle?: string
  workType?: string
  colorClass?: string
  href?: string
  onClick?: () => void
}

export function WorkBubbleStatus({
  title,
  subtitle,
  workType,
  colorClass = "bg-slate-600",
  href,
  onClick,
  className,
  ...props
}: WorkBubbleStatusProps) {
  const bubbleClassName = cn(
    "w-full",
    "min-w-0",
    "max-w-full",
    "min-h-16",
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
    "no-underline",
    colorClass ? `border-transparent text-white ${colorClass}` : "border-gray-200 bg-gray-50",
    className,
  )

  const content = (
    <>
      <div className="text-sm leading-tight text-white whitespace-normal break-words min-w-0 max-w-full w-full">
        {title || "-"}
      </div>
      {subtitle && (
        <div className="text-xs opacity-90 leading-tight text-white mt-0.5 whitespace-normal break-words min-w-0 max-w-full w-full">
          {subtitle}
        </div>
      )}
      {workType && (
        <div className="text-xs opacity-80 leading-tight text-white mt-0.5 whitespace-normal break-words min-w-0 max-w-full w-full">
          {workType}
        </div>
      )}
    </>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <Link href={href} onClick={onClick} className={bubbleClassName} {...(props as any)}>
              {content}
            </Link>
          ) : (
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
              className={bubbleClassName}
              {...props}
            >
              {content}
            </div>
          )}
        </TooltipTrigger>
        {(title || subtitle || workType) && (
          <TooltipContent>
            <div className="text-xs">
              <div className="font-medium">{title}</div>
              {subtitle && <div className="opacity-80">{subtitle}</div>}
              {workType && <div className="opacity-80">{workType}</div>}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
