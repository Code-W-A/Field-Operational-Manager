"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type MailboxFilter = "INBOX" | "SENT" | "ALL"
export type StatusFilter = "ALL" | "PENDING" | "CONFIRMED"

interface ConversationFiltersProps {
  search: string
  mailbox: MailboxFilter
  status: StatusFilter
  onlyWithDeadline: boolean
  onSearchChange: (value: string) => void
  onMailboxChange: (value: MailboxFilter) => void
  onStatusChange: (value: StatusFilter) => void
  onOnlyWithDeadlineChange: (value: boolean) => void
}

export function ConversationFilters({
  search,
  mailbox,
  status,
  onlyWithDeadline,
  onSearchChange,
  onMailboxChange,
  onStatusChange,
  onOnlyWithDeadlineChange,
}: ConversationFiltersProps) {
  return (
    <div className="space-y-3 border-b border-neutral-200 bg-white px-3.5 py-3.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Caută după mesaj, context, participanți"
          className="h-9 rounded-lg border-neutral-200 bg-neutral-50 pl-9 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select value={mailbox} onValueChange={(value: MailboxFilter) => onMailboxChange(value)}>
          <SelectTrigger className="h-9 rounded-lg border-neutral-200 bg-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INBOX">Inbox</SelectItem>
            <SelectItem value="SENT">Trimise</SelectItem>
            <SelectItem value="ALL">Toate</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(value: StatusFilter) => onStatusChange(value)}>
          <SelectTrigger className="h-9 rounded-lg border-neutral-200 bg-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Toate statusurile</SelectItem>
            <SelectItem value="PENDING">În așteptare</SelectItem>
            <SelectItem value="CONFIRMED">Confirmat</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 px-0.5 text-[12px] text-neutral-600">
        <input
          type="checkbox"
          checked={onlyWithDeadline}
          onChange={(event) => onOnlyWithDeadlineChange(event.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
        />
        <Label className="cursor-pointer text-xs font-normal text-neutral-600">Doar conversații cu termen</Label>
      </label>
    </div>
  )
}
