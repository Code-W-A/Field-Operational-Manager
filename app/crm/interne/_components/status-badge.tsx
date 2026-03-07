"use client"

import { CRM_INTERNAL_NOTE_STATUS_LABELS } from "@/lib/crm/constants"
import type { CrmInternalNoteStatus } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: CrmInternalNoteStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        status === "CONFIRMED"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
        className
      )}
    >
      {CRM_INTERNAL_NOTE_STATUS_LABELS[status]}
    </span>
  )
}
