import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type BadgeTone = "neutral" | "accent" | "success" | "danger" | "warning"

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  accent: "border-blue-200 bg-blue-50/80 text-blue-700",
  success: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  danger: "border-rose-200 bg-rose-50/80 text-rose-700",
  warning: "border-amber-200 bg-amber-50/80 text-amber-700",
}

interface SubtleBadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

export function SubtleBadge({ children, tone = "neutral", className }: SubtleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium leading-none",
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
