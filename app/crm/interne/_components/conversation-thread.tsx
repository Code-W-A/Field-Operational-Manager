"use client"

import { CheckCheck, Clock, MessageSquare } from "lucide-react"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmInternalNote } from "@/lib/crm/types"

interface ConversationThreadProps {
  row: CrmInternalNote
  userNameMap: Record<string, string>
}

export function ConversationThread({ row, userNameMap }: ConversationThreadProps) {
  const senderName = userNameMap[row.fromUserId] || row.fromUserId
  const senderInitial = senderName.charAt(0).toUpperCase()

  return (
    <div className="space-y-5 px-6 py-5">
      {/* Sender bubble — left aligned */}
      <div className="flex items-start gap-3 pr-16">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {senderInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl rounded-tl-md border border-neutral-200 bg-white px-4 py-3 shadow-sm shadow-black/[0.02]">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{row.message || "Mesaj fără conținut."}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-neutral-400">
            <span className="font-medium text-neutral-500">{senderName}</span>
            <span>·</span>
            <span>{formatDateTime(row.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Confirmation bubble — right aligned */}
      {row.status === "CONFIRMED" ? (() => {
        const confirmerName = row.confirmedById ? userNameMap[row.confirmedById] || row.confirmedById : "—"
        const confirmerInitial = confirmerName.charAt(0).toUpperCase()
        return (
          <div className="flex items-start gap-3 pl-16">
            <div className="min-w-0 flex-1">
              <div className="rounded-2xl rounded-tr-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                  <CheckCheck className="h-3 w-3" />
                  Confirmat
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-emerald-900">
                  {row.confirmationMessage || "Fără mesaj suplimentar."}
                </p>
              </div>
              <div className="mt-1.5 flex items-center justify-end gap-2 px-1 text-[11px] text-neutral-400">
                <span>{formatDateTime(row.confirmedAt)}</span>
                <span>·</span>
                <span className="font-medium text-emerald-600">{confirmerName}</span>
              </div>
            </div>
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {confirmerInitial}
            </div>
          </div>
        )
      })() : (
        /* Waiting state — centered, subtle */
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-3">
          <Clock className="h-3.5 w-3.5 text-neutral-400" />
          <p className="text-xs text-neutral-500">Se așteaptă confirmare de la destinatar</p>
        </div>
      )}
    </div>
  )
}
