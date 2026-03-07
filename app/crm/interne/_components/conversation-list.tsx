"use client"

import type { CrmInternalNote } from "@/lib/crm/types"
import { ConversationListItem } from "@/app/crm/interne/_components/conversation-list-item"

interface ConversationListProps {
  rows: CrmInternalNote[]
  loading: boolean
  selectedConversationId: string | null
  userNameMap: Record<string, string>
  onSelect: (id: string) => void
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-2.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100/70" />
      ))}
    </div>
  )
}

export function ConversationList({ rows, loading, selectedConversationId, userNameMap, onSelect }: ConversationListProps) {
  if (loading) return <ListSkeleton />

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center p-6 text-center">
        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-700">Nu există conversații</p>
          <p className="text-xs text-neutral-500">Ajustează filtrele sau inițiază o conversație nouă.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2.5">
      {rows.map((row) => (
        <ConversationListItem
          key={row.id}
          row={row}
          selected={selectedConversationId === row.id}
          userNameMap={userNameMap}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
