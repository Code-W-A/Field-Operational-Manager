"use client"

import { CalendarClock, UserRound } from "lucide-react"
import { StatusBadge } from "@/app/crm/interne/_components/status-badge"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmInternalNote } from "@/lib/crm/types"

interface ConversationDetailHeaderProps {
  row: CrmInternalNote
  userNameMap: Record<string, string>
}

export function ConversationDetailHeader({ row, userNameMap }: ConversationDetailHeaderProps) {
  return (
    <div className="space-y-3 border-b border-neutral-200 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-[20px] font-semibold tracking-[-0.02em] text-neutral-900">{row.context?.trim() || "Conversație internă"}</p>
          <p className="text-xs text-neutral-500">Solicitare internă și flux de confirmare</p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
        <p className="inline-flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-medium text-neutral-700">De la:</span> {userNameMap[row.fromUserId] || row.fromUserId}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-medium text-neutral-700">Către:</span> {userNameMap[row.toUserId] || row.toUserId}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-medium text-neutral-700">Creat:</span> {formatDateTime(row.createdAt)}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-medium text-neutral-700">Actualizat:</span> {formatDateTime(row.updatedAt || row.createdAt)}
        </p>
        {row.dueAt ? (
          <p className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-700">Termen:</span> {formatDateTime(row.dueAt)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
