"use client"

import { CalendarClock, UserRound } from "lucide-react"
import { StatusBadge } from "@/app/crm/interne/_components/status-badge"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmInternalNote } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

interface ConversationListItemProps {
  row: CrmInternalNote
  selected: boolean
  userNameMap: Record<string, string>
  onSelect: (id: string) => void
}

export function ConversationListItem({ row, selected, userNameMap, onSelect }: ConversationListItemProps) {
  const preview = row.message.trim().slice(0, 120)
  const title = row.context?.trim() || "Conversație internă"

  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={cn(
        "w-full rounded-[18px] border p-3.5 text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        selected
          ? "border-blue-200 bg-white shadow-sm shadow-blue-100 ring-1 ring-blue-100"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-sm font-semibold text-neutral-900">{title}</p>
        <StatusBadge status={row.status} />
      </div>

      <p className="mt-1.5 line-clamp-1 text-sm text-neutral-600">{preview || "Mesaj fără conținut."}</p>

      <div className="mt-2.5 grid grid-cols-1 gap-1 text-[12px] text-neutral-500">
        <p className="inline-flex items-center gap-1.5 truncate">
          <UserRound className="h-3.5 w-3.5" />
          <span className="truncate">
            {userNameMap[row.fromUserId] || row.fromUserId} -> {userNameMap[row.toUserId] || row.toUserId}
          </span>
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatDateTime(row.updatedAt || row.createdAt)}
        </p>
      </div>

      {row.dueAt ? (
        <div className="mt-2.5 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
          Termen: {formatDateTime(row.dueAt)}
        </div>
      ) : null}
    </button>
  )
}
