"use client"

import { useEffect, useMemo, useState } from "react"
import { MessageSquare, Send } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { confirmCrmInternalNote, createCrmInternalNoteStandalone, listCrmInternalNotesStandalone } from "@/lib/crm/tasks"
import type { CrmInternalNote } from "@/lib/crm/types"
import { ConversationComposer } from "@/app/crm/interne/_components/conversation-composer"
import { ConversationDetailHeader } from "@/app/crm/interne/_components/conversation-detail-header"
import { ConversationFilters, type MailboxFilter, type StatusFilter } from "@/app/crm/interne/_components/conversation-filters"
import { ConversationList } from "@/app/crm/interne/_components/conversation-list"
import { ConversationThread } from "@/app/crm/interne/_components/conversation-thread"

function getErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const maybeCode = "code" in error ? (error as { code?: unknown }).code : undefined
    const maybeMessage = "message" in error ? (error as { message?: unknown }).message : undefined
    const code = typeof maybeCode === "string" ? maybeCode : "unknown"
    const message = typeof maybeMessage === "string" ? maybeMessage : "Eroare necunoscută"
    return { code, message }
  }
  return { code: "unknown", message: "Eroare necunoscută" }
}

export default function CrmInternePage() {
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const canOverrideConfirm = userData?.role === "admin" || userData?.role === "dispecer"

  const [rows, setRows] = useState<CrmInternalNote[]>([])
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirmingNoteId, setConfirmingNoteId] = useState<string | null>(null)
  const [confirmationDrafts, setConfirmationDrafts] = useState<Record<string, string>>({})
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  const [mailbox, setMailbox] = useState<MailboxFilter>("ALL")
  const [status, setStatus] = useState<StatusFilter>("ALL")
  const [search, setSearch] = useState("")
  const [onlyWithDeadline, setOnlyWithDeadline] = useState(false)
  const [toUserId, setToUserId] = useState("")
  const [message, setMessage] = useState("")
  const [context, setContext] = useState("")
  const [dueAt, setDueAt] = useState("")

  const userNameMap = useMemo(
    () =>
      users.reduce<Record<string, string>>((acc, row) => {
        acc[row.uid] = row.displayName
        return acc
      }, {}),
    [users]
  )

  const recipientOptions = useMemo(
    () => users.filter((row) => row.uid !== user?.uid),
    [users, user?.uid]
  )

  const load = async (override?: { mailbox?: MailboxFilter; status?: StatusFilter }) => {
    if (!user?.uid) return
    const mailboxValue = override?.mailbox || mailbox
    const statusValue = override?.status || status
    setLoading(true)
    try {
      const [internalNoteRows, userRows] = await Promise.all([
        listCrmInternalNotesStandalone({
          userId: user.uid,
          mailbox: mailboxValue,
          status: statusValue,
        }),
        listCrmUsers(),
      ])

      setRows(internalNoteRows)
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
      setSelectedConversationId((prev) => {
        if (!internalNoteRows.length) return null
        if (prev && internalNoteRows.some((row) => row.id === prev)) return prev
        return internalNoteRows[0].id
      })
    } catch (error) {
      const details = getErrorDetails(error)
      console.error("[CRM Interne] load failed", {
        userId: user?.uid || null,
        mailbox: mailboxValue,
        status: statusValue,
        code: details.code,
        message: details.message,
        error,
      })
      toast({
        title: "Eroare la încărcare",
        description: `Nu am putut încărca conversațiile interne (${details.code}).`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, mailbox, status])

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyWithDeadline && !row.dueAt) return false
      if (!normalizedSearch) return true

      const fromLabel = (userNameMap[row.fromUserId] || row.fromUserId || "").toLowerCase()
      const toLabel = (userNameMap[row.toUserId] || row.toUserId || "").toLowerCase()
      const haystack = `${row.context || ""} ${row.message || ""} ${fromLabel} ${toLabel}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [onlyWithDeadline, rows, search, userNameMap])

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedConversationId(null)
      return
    }
    if (selectedConversationId && filteredRows.some((row) => row.id === selectedConversationId)) return
    setSelectedConversationId(filteredRows[0].id)
  }, [filteredRows, selectedConversationId])

  const selectedConversation = useMemo(
    () => filteredRows.find((row) => row.id === selectedConversationId) || null,
    [filteredRows, selectedConversationId]
  )

  const resetCreateForm = () => {
    setToUserId("")
    setMessage("")
    setContext("")
    setDueAt("")
  }

  const handleCreate = async () => {
    if (!user?.uid) return
    if (!toUserId || !message.trim()) {
      toast({
        title: "Câmpuri obligatorii",
        description: "Selectează destinatarul și completează mesajul.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const createdId = await createCrmInternalNoteStandalone({
        fromUserId: user.uid,
        toUserId,
        message,
        context,
        dueAt: dueAt ? new Date(`${dueAt}T09:00:00`) : undefined,
        createdById: user.uid,
      })

      toast({
        title: "Conversație trimisă",
        description: "Nota internă a fost înregistrată. Am comutat pe „Toate” ca să o vezi imediat.",
      })
      setMailbox("ALL")
      setStatus("ALL")
      setIsCreateOpen(false)
      resetCreateForm()
      await load({
        mailbox: "ALL",
        status: "ALL",
      })
      setSelectedConversationId(createdId)
    } catch (error) {
      const details = getErrorDetails(error)
      console.error("[CRM Interne] create failed", {
        fromUserId: user?.uid || null,
        toUserId,
        code: details.code,
        message: details.message,
        error,
      })
      toast({
        title: "Eroare la salvare",
        description: `Nu am putut trimite nota internă (${details.code}).`,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async (noteId: string) => {
    if (!user?.uid) return
    setConfirmingNoteId(noteId)
    try {
      await confirmCrmInternalNote({
        noteId,
        actorId: user.uid,
        confirmationMessage: confirmationDrafts[noteId],
        canOverrideRecipient: canOverrideConfirm,
      })
      toast({
        title: "Confirmare salvată",
        description: "Conversația a fost marcată ca confirmată.",
      })
      await load()
    } catch (error) {
      const details = getErrorDetails(error)
      console.error("[CRM Interne] confirm failed", {
        noteId,
        actorId: user?.uid || null,
        code: details.code,
        message: details.message,
        error,
      })
      toast({
        title: "Eroare la confirmare",
        description: `${details.message} (${details.code})`,
        variant: "destructive",
      })
    } finally {
      setConfirmingNoteId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <section className="grid h-full min-h-0 w-full flex-1 overflow-hidden border-y border-neutral-200 bg-white xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3.5 py-3">
            <p className="text-sm font-semibold text-neutral-800">Conversații interne</p>
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="h-8 rounded-lg bg-blue-600 px-3 text-xs text-white shadow-none hover:bg-blue-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Nouă
            </Button>
          </div>
          <ConversationFilters
            search={search}
            mailbox={mailbox}
            status={status}
            onlyWithDeadline={onlyWithDeadline}
            onSearchChange={setSearch}
            onMailboxChange={setMailbox}
            onStatusChange={setStatus}
            onOnlyWithDeadlineChange={setOnlyWithDeadline}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              rows={filteredRows}
              loading={loading}
              selectedConversationId={selectedConversationId}
              userNameMap={userNameMap}
              onSelect={setSelectedConversationId}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden border-t border-neutral-200 bg-white xl:border-l xl:border-t-0">
          {!selectedConversation ? (
            <div className="flex h-full min-h-[460px] flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="rounded-full border border-neutral-200 bg-neutral-50 p-3">
                <MessageSquare className="h-6 w-6 text-neutral-400" />
              </div>
              <p className="text-sm font-medium text-neutral-700">Selectează o conversație pentru a vedea detaliile</p>
              <p className="max-w-sm text-xs leading-6 text-neutral-500">
                Panoul din dreapta afișează istoricul solicitării și acțiunile de confirmare.
              </p>
            </div>
          ) : (
            <>
              <ConversationDetailHeader row={selectedConversation} userNameMap={userNameMap} />
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/30">
                <ConversationThread row={selectedConversation} userNameMap={userNameMap} />
              </div>
              <ConversationComposer
                canConfirm={
                  selectedConversation.status === "PENDING" &&
                  (selectedConversation.toUserId === user?.uid || canOverrideConfirm)
                }
                value={confirmationDrafts[selectedConversation.id] || ""}
                loading={confirmingNoteId === selectedConversation.id}
                onChange={(value) =>
                  setConfirmationDrafts((prev) => ({
                    ...prev,
                    [selectedConversation.id]: value,
                  }))
                }
                onConfirm={() => void handleConfirm(selectedConversation.id)}
              />
            </>
          )}
        </div>
      </section>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-neutral-200 px-6 py-5 text-left">
              <SheetTitle>Conversație internă nouă</SheetTitle>
              <SheetDescription>Canal intern pentru solicitări care necesită confirmare/răspuns.</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="internal-note-to-user">Destinatar</Label>
                <select
                  id="internal-note-to-user"
                  value={toUserId}
                  onChange={(event) => setToUserId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"
                >
                  <option value="">Alege colegul destinatar</option>
                  {recipientOptions.map((recipient) => (
                    <option key={recipient.uid} value={recipient.uid}>
                      {recipient.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internal-note-context">Context (opțional)</Label>
                <Input
                  id="internal-note-context"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="Ex: cash, HR, reminder"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internal-note-due-at">Termen (opțional)</Label>
                <Input id="internal-note-due-at" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internal-note-message">Mesaj</Label>
                <Textarea
                  id="internal-note-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="Ex: Am predat 2500 lei cash. Te rog să confirmi primirea."
                />
              </div>
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  resetCreateForm()
                }}
              >
                Anulează
              </Button>
              <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
                Salvează
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
