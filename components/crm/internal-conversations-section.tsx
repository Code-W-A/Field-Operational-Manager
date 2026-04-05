"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCheck, Clock, MessageSquare, PanelLeft, Plus, Send } from "lucide-react"
import { MobileRailSheet } from "@/components/crm/mobile-rail-sheet"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { listCrmUsers } from "@/lib/crm/opportunities"
import {
  addThreadMessage,
  confirmCrmInternalNote,
  confirmThreadMessage,
  createThreadWithFirstMessage,
  listCrmInternalNotesStandalone,
  listInternalThreadsForUser,
  listThreadMessages,
} from "@/lib/crm/tasks"
import type { CrmInternalMessage, CrmInternalMessageCycleStatus, CrmInternalNote, CrmInternalThread } from "@/lib/crm/types"
import { formatDateTime } from "@/lib/crm/presenters"
import { SegmentedControl } from "@/components/crm/segmented-control"

type ConversationSortOrder = "NEWEST_FIRST" | "OLDEST_FIRST"

const CRM_INTERNE_SORT_STORAGE_PREFIX = "crm:interne:conversationSortOrder"

function readStoredConversationSortOrder(userId: string | undefined): ConversationSortOrder {
  if (typeof window === "undefined") return "NEWEST_FIRST"
  try {
    const raw = window.localStorage.getItem(`${CRM_INTERNE_SORT_STORAGE_PREFIX}:${userId || "anonymous"}`)
    if (raw === "OLDEST_FIRST") return "OLDEST_FIRST"
  } catch {
    /* ignore */
  }
  return "NEWEST_FIRST"
}

function writeStoredConversationSortOrder(userId: string | undefined, order: ConversationSortOrder) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${CRM_INTERNE_SORT_STORAGE_PREFIX}:${userId || "anonymous"}`, order)
  } catch {
    /* ignore */
  }
}

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

type MailboxFilter = "INBOX" | "SENT" | "ALL"
type StatusFilter = "ALL" | "PENDING" | "CONFIRMED" | "NONE"
type ConversationRow = {
  key: string
  kind: "thread" | "legacy"
  id: string
  title: string
  preview: string
  updatedAt: unknown
  fromUserId: string
  toUserId: string
  status: CrmInternalMessageCycleStatus
}
type SelectedConversation =
  | { kind: "thread"; id: string }
  | { kind: "legacy"; id: string }
  | null

export function InternalConversationsSection() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const incomingDeepLinkRef = useRef<{ thread?: string; legacy?: string; msg?: string } | null>(null)
  const pendingScrollToMessageIdRef = useRef("")

  const toMillis = (value: unknown) => {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate()
      return date.getTime()
    }
    if (value instanceof Date) return value.getTime()
    if (typeof value === "number") return value
    if (typeof value === "string") return new Date(value).getTime()
    return 0
  }

  const { user, userData } = useAuth()
  const { toast } = useToast()
  const canOverrideConfirm = userData?.role === "admin" || userData?.role === "dispecer"

  const [threads, setThreads] = useState<CrmInternalThread[]>([])
  const [legacyRows, setLegacyRows] = useState<CrmInternalNote[]>([])
  const [activeThreadMessages, setActiveThreadMessages] = useState<CrmInternalMessage[]>([])
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirmingMessageId, setConfirmingMessageId] = useState<string | null>(null)
  const [confirmingLegacyId, setConfirmingLegacyId] = useState<string | null>(null)
  const [confirmationDrafts, setConfirmationDrafts] = useState<Record<string, string>>({})
  const [selectedConversation, setSelectedConversation] = useState<SelectedConversation>(null)

  const [mailbox, setMailbox] = useState<MailboxFilter>("ALL")
  const [status, setStatus] = useState<StatusFilter>("ALL")
  const [conversationSortOrder, setConversationSortOrder] = useState<ConversationSortOrder>("NEWEST_FIRST")
  const [search, setSearch] = useState("")
  const [onlyWithDeadline, setOnlyWithDeadline] = useState(false)
  const [toUserId, setToUserId] = useState("")
  const [message, setMessage] = useState("")
  const [context, setContext] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [requiresConfirmation, setRequiresConfirmation] = useState(true)
  const [replyMessage, setReplyMessage] = useState("")
  const [replyContext, setReplyContext] = useState("")
  const [replyDueAt, setReplyDueAt] = useState("")
  const [replyRequiresConfirmation, setReplyRequiresConfirmation] = useState(false)
  const [replyToUserId, setReplyToUserId] = useState("")

  const stripInternalDeepLinkParams = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString())
    p.delete("thread")
    p.delete("msg")
    p.delete("legacyNote")
    const qs = p.toString()
    router.replace(qs ? `/crm/opportunities?${qs}` : "/crm/opportunities")
  }, [router, searchParams])

  useEffect(() => {
    const t = searchParams.get("thread")?.trim() || ""
    const l = searchParams.get("legacyNote")?.trim() || ""
    const m = searchParams.get("msg")?.trim() || ""
    if (!t && !l) return
    incomingDeepLinkRef.current = { thread: t || undefined, legacy: l || undefined, msg: m || undefined }
    if (mailbox !== "ALL" || status !== "ALL") {
      setMailbox("ALL")
      setStatus("ALL")
    }
    setSearch("")
    setOnlyWithDeadline(false)
    // Păstrăm conversationSortOrder la deep link (preferință utilizator).
  }, [searchParams, mailbox, status])

  useEffect(() => {
    setConversationSortOrder(readStoredConversationSortOrder(user?.uid))
  }, [user?.uid])

  const setConversationSortOrderPersisted = useCallback(
    (order: ConversationSortOrder) => {
      setConversationSortOrder(order)
      writeStoredConversationSortOrder(user?.uid, order)
    },
    [user?.uid]
  )

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

  const getCycleLabel = (statusValue: CrmInternalMessageCycleStatus) => {
    if (statusValue === "PENDING") return "În așteptare"
    if (statusValue === "CONFIRMED") return "Confirmat"
    return "Fără confirmare"
  }

  const load = async (override?: { mailbox?: MailboxFilter; status?: StatusFilter }) => {
    if (!user?.uid) return
    const deepThread = searchParams.get("thread")?.trim() || ""
    const deepLegacy = searchParams.get("legacyNote")?.trim() || ""
    const hasInternalDeepLink = Boolean(deepThread || deepLegacy)
    const mailboxValue = hasInternalDeepLink ? "ALL" : override?.mailbox || mailbox
    const statusValue = hasInternalDeepLink ? "ALL" : override?.status || status
    setLoading(true)
    try {
      const [threadResult, internalNoteResult, userResult] = await Promise.allSettled([
        listInternalThreadsForUser({
          userId: user.uid,
          mailbox: mailboxValue,
          status: statusValue,
        }),
        listCrmInternalNotesStandalone({
          userId: user.uid,
          mailbox: mailboxValue,
          status: statusValue === "NONE" ? "ALL" : statusValue,
        }),
        listCrmUsers(),
      ])

      const threadRows = threadResult.status === "fulfilled" ? threadResult.value : []
      const internalNoteRows = internalNoteResult.status === "fulfilled" ? internalNoteResult.value : []
      const userRows = userResult.status === "fulfilled" ? userResult.value : []

      setThreads(threadRows)
      setLegacyRows(internalNoteRows)
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
      setSelectedConversation((prev) => {
        const hasPrev =
          prev &&
          ((prev.kind === "thread" && threadRows.some((row) => row.id === prev.id)) ||
            (prev.kind === "legacy" && internalNoteRows.some((row) => row.id === prev.id)))
        if (hasPrev) return prev
        if (threadRows.length > 0) return { kind: "thread", id: threadRows[0].id }
        if (internalNoteRows.length > 0) return { kind: "legacy", id: internalNoteRows[0].id }
        return null
      })

      if (threadResult.status === "rejected") {
        const details = getErrorDetails(threadResult.reason)
        console.error("[CRM Interne] thread load failed", {
          userId: user?.uid || null,
          mailbox: mailboxValue,
          status: statusValue,
          code: details.code,
          message: details.message,
          error: threadResult.reason,
        })
      }

      if (internalNoteResult.status === "rejected") {
        const details = getErrorDetails(internalNoteResult.reason)
        console.error("[CRM Interne] legacy load failed", {
          userId: user?.uid || null,
          mailbox: mailboxValue,
          status: statusValue,
          code: details.code,
          message: details.message,
          error: internalNoteResult.reason,
        })
      }

      if (userResult.status === "rejected") {
        const details = getErrorDetails(userResult.reason)
        console.error("[CRM Interne] user load failed", {
          userId: user?.uid || null,
          code: details.code,
          message: details.message,
          error: userResult.reason,
        })
      }

      if (threadResult.status === "rejected" && internalNoteResult.status === "rejected") {
        const details = getErrorDetails(threadResult.reason)
        toast({
          title: "Eroare la încărcare",
          description: `Nu am putut încărca conversațiile interne (${details.code}).`,
          variant: "destructive",
        })
      }
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
    const threadRows: ConversationRow[] = threads
      .filter((row) => {
        if (status === "NONE" && row.lastMessageCycleStatus !== "NONE") return false
        if (onlyWithDeadline && !row.lastMessageDeadlineAt) return false
        return true
      })
      .map((row) => ({
        key: `thread:${row.id}`,
        kind: "thread" as const,
        id: row.id,
        title: row.context || "Conversație internă",
        preview: row.lastMessagePreview || "",
        updatedAt: row.lastMessageAt || row.updatedAt || row.createdAt,
        fromUserId: row.lastMessageFromUserId || "",
        toUserId: row.lastMessageToUserId || "",
        status: row.lastMessageCycleStatus || "NONE",
      }))
    const legacyFiltered: ConversationRow[] =
      status === "NONE"
        ? []
        : legacyRows
            .filter((row) => {
              if (onlyWithDeadline && !row.dueAt) return false
              return true
            })
            .map((row) => ({
              key: `legacy:${row.id}`,
              kind: "legacy" as const,
              id: row.id,
              title: row.context || "Conversație internă (legacy)",
              preview: row.message || "",
              updatedAt: row.updatedAt || row.createdAt,
              fromUserId: row.fromUserId,
              toUserId: row.toUserId,
              status: row.status === "CONFIRMED" ? "CONFIRMED" : "PENDING",
            }))
    const allRows: ConversationRow[] = [...threadRows, ...legacyFiltered]
      .filter((row) => {
        if (!normalizedSearch) return true
        const fromLabel = (userNameMap[row.fromUserId] || row.fromUserId || "").toLowerCase()
        const toLabel = (userNameMap[row.toUserId] || row.toUserId || "").toLowerCase()
        const haystack = `${row.title} ${row.preview} ${fromLabel} ${toLabel}`.toLowerCase()
        return haystack.includes(normalizedSearch)
      })
      .sort((left, right) => {
        const leftDate = toMillis(left.updatedAt)
        const rightDate = toMillis(right.updatedAt)
        if (conversationSortOrder === "NEWEST_FIRST") return rightDate - leftDate
        return leftDate - rightDate
      })
    return allRows
  }, [conversationSortOrder, legacyRows, onlyWithDeadline, search, status, threads, userNameMap])

  const selectedThread = useMemo(() => {
    if (!selectedConversation || selectedConversation.kind !== "thread") return null
    return threads.find((row) => row.id === selectedConversation.id) || null
  }, [selectedConversation, threads])

  const selectedLegacy = useMemo(() => {
    if (!selectedConversation || selectedConversation.kind !== "legacy") return null
    return legacyRows.find((row) => row.id === selectedConversation.id) || null
  }, [legacyRows, selectedConversation])

  const canConfirmSelectedLegacy = useMemo(() => {
    if (!selectedLegacy || !user?.uid) return false
    if (selectedLegacy.status === "CONFIRMED") return false
    if (selectedLegacy.fromUserId === user.uid) return false
    return selectedLegacy.toUserId === user.uid || canOverrideConfirm
  }, [canOverrideConfirm, selectedLegacy, user?.uid])

  useEffect(() => {
    if (!filteredRows.length) {
      if (!incomingDeepLinkRef.current) {
        setSelectedConversation(null)
      }
      return
    }

    const deep = incomingDeepLinkRef.current
    if (deep?.thread) {
      const hit = filteredRows.find((r) => r.kind === "thread" && r.id === deep.thread)
      if (hit) {
        if (deep.msg) pendingScrollToMessageIdRef.current = deep.msg
        incomingDeepLinkRef.current = null
        stripInternalDeepLinkParams()
        setSelectedConversation({ kind: "thread", id: deep.thread })
        return
      }
    }
    if (deep?.legacy) {
      const hit = filteredRows.find((r) => r.kind === "legacy" && r.id === deep.legacy)
      if (hit) {
        incomingDeepLinkRef.current = null
        stripInternalDeepLinkParams()
        setSelectedConversation({ kind: "legacy", id: deep.legacy })
        return
      }
    }
    if (deep && (deep.thread || deep.legacy)) {
      if (!loading && mailbox === "ALL" && status === "ALL") {
        incomingDeepLinkRef.current = null
        stripInternalDeepLinkParams()
      }
    }

    if (!selectedConversation) {
      setSelectedConversation({
        kind: filteredRows[0].kind,
        id: filteredRows[0].id,
      })
      return
    }
    const stillThere = filteredRows.some((row) => row.kind === selectedConversation.kind && row.id === selectedConversation.id)
    if (!stillThere) {
      setSelectedConversation({
        kind: filteredRows[0].kind,
        id: filteredRows[0].id,
      })
    }
  }, [filteredRows, loading, mailbox, selectedConversation, status, stripInternalDeepLinkParams])

  useEffect(() => {
    const loadMessages = async () => {
      if (!user?.uid || !selectedThread) {
        setActiveThreadMessages([])
        return
      }
      try {
        const messages = await listThreadMessages({ threadId: selectedThread.id, userId: user.uid })
        setActiveThreadMessages(messages)
      } catch (error) {
        const details = getErrorDetails(error)
        toast({
          title: "Nu am putut încărca mesajele",
          description: `${details.message} (${details.code})`,
          variant: "destructive",
        })
      }
    }
    void loadMessages()
  }, [selectedThread, toast, user?.uid])

  useEffect(() => {
    const targetId = pendingScrollToMessageIdRef.current
    if (!targetId || !activeThreadMessages.length) return
    if (!activeThreadMessages.some((m) => m.id === targetId)) return
    pendingScrollToMessageIdRef.current = ""
    requestAnimationFrame(() => {
      document.getElementById(`crm-internal-msg-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [activeThreadMessages])

  useEffect(() => {
    if (!selectedThread || !user?.uid) return
    const defaultRecipient = selectedThread.participantUserIds.find((id) => id !== user.uid) || ""
    setReplyToUserId(defaultRecipient)
  }, [selectedThread, user?.uid])

  const resetCreateForm = () => {
    setToUserId("")
    setMessage("")
    setContext("")
    setDueAt("")
    setRequiresConfirmation(true)
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
      const created = await createThreadWithFirstMessage({
        fromUserId: user.uid,
        toUserId,
        message,
        context,
        requiresConfirmation,
        deadlineAt: requiresConfirmation && dueAt ? new Date(`${dueAt}T09:00:00`) : undefined,
        createdById: user.uid,
      })

      toast({
        title: "Conversație trimisă",
        description: "Thread-ul intern a fost creat.",
      })
      setMailbox("ALL")
      setStatus("ALL")
      setIsCreateOpen(false)
      resetCreateForm()
      await load({
        mailbox: "ALL",
        status: "ALL",
      })
      setSelectedConversation({ kind: "thread", id: created.threadId })
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

  const handleConfirmLegacy = async (noteId: string) => {
    if (!user?.uid || !selectedLegacy || !canConfirmSelectedLegacy) return
    setConfirmingLegacyId(noteId)
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
      setConfirmingLegacyId(null)
    }
  }

  const handleConfirmMessage = async (messageId: string) => {
    if (!user?.uid || !selectedThread) return
    const targetMessage = activeThreadMessages.find((row) => row.id === messageId)
    if (!targetMessage) return
    const canConfirmTargetMessage =
      targetMessage.requiresConfirmation &&
      targetMessage.cycleStatus === "PENDING" &&
      targetMessage.fromUserId !== user.uid &&
      (targetMessage.toUserId === user.uid || canOverrideConfirm)
    if (!canConfirmTargetMessage) return
    setConfirmingMessageId(messageId)
    try {
      await confirmThreadMessage({
        threadId: selectedThread.id,
        messageId,
        actorId: user.uid,
        confirmationMessage: confirmationDrafts[messageId],
        canOverrideRecipient: canOverrideConfirm,
      })
      setConfirmationDrafts((prev) => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
      await load()
      const messages = await listThreadMessages({ threadId: selectedThread.id, userId: user.uid })
      setActiveThreadMessages(messages)
      toast({
        title: "Mesaj confirmat",
        description: "Confirmarea a fost trimisă în conversație, iar reminderele pentru acest ciclu sunt oprite.",
      })
    } catch (error) {
      const details = getErrorDetails(error)
      toast({
        title: "Eroare la confirmare",
        description: `${details.message} (${details.code})`,
        variant: "destructive",
      })
    } finally {
      setConfirmingMessageId(null)
    }
  }

  const handleSendReply = async () => {
    if (!user?.uid || !selectedThread || !replyToUserId || !replyMessage.trim()) return
    setSaving(true)
    try {
      await addThreadMessage({
        threadId: selectedThread.id,
        fromUserId: user.uid,
        toUserId: replyToUserId,
        message: replyMessage,
        context: replyContext || selectedThread.context,
        requiresConfirmation: replyRequiresConfirmation,
        deadlineAt: replyRequiresConfirmation && replyDueAt ? new Date(`${replyDueAt}T09:00:00`) : undefined,
        createdById: user.uid,
        replyToMessageId: selectedThread.lastMessageId,
      })
      setReplyMessage("")
      setReplyContext("")
      setReplyDueAt("")
      setReplyRequiresConfirmation(false)
      await load()
      const messages = await listThreadMessages({ threadId: selectedThread.id, userId: user.uid })
      setActiveThreadMessages(messages)
    } catch (error) {
      const details = getErrorDetails(error)
      toast({
        title: "Eroare la trimitere",
        description: `${details.message} (${details.code})`,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const renderConversationRail = (onSelectConversation?: () => void) => (
    <div className="flex min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 xl:px-3.5 xl:py-3">
        <p className="text-xs font-semibold text-neutral-800 xl:text-sm">Conversații interne</p>
        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="h-7 rounded-md bg-blue-600 px-2.5 text-[11px] text-white shadow-none hover:bg-blue-700 xl:h-8 xl:rounded-lg xl:px-3 xl:text-xs"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nou
        </Button>
      </div>
      <div className="space-y-2 border-b border-neutral-200 bg-white px-3 py-2.5 xl:space-y-3 xl:px-3.5 xl:py-3.5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Caută conversații"
          className="h-8 text-xs xl:h-9 xl:text-sm"
        />
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-neutral-500 xl:text-xs">Căsuță poștală</label>
          <select
            value={mailbox}
            onChange={(event) => setMailbox(event.target.value as MailboxFilter)}
            className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs xl:h-9 xl:rounded-lg xl:px-2.5 xl:text-sm"
          >
            <option value="ALL">Toate</option>
            <option value="INBOX">Inbox</option>
            <option value="SENT">Trimise</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-neutral-500 xl:text-xs">Ordonare după dată</label>
          <SegmentedControl
            value={conversationSortOrder}
            items={[
              { id: "NEWEST_FIRST", label: "Cele mai noi" },
              { id: "OLDEST_FIRST", label: "Cele mai vechi" },
            ]}
            onValueChange={(id) => setConversationSortOrderPersisted(id as ConversationSortOrder)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-neutral-500 xl:text-xs">Status</label>
          <SegmentedControl
            value={status}
            items={[
              { id: "ALL", label: "Toate" },
              { id: "PENDING", label: "Active" },
              { id: "CONFIRMED", label: "Arhivate" },
              { id: "NONE", label: "Fără confirmare" },
            ]}
            onValueChange={(id) => setStatus(id as StatusFilter)}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 xl:gap-2 xl:text-xs">
          <input
            type="checkbox"
            checked={onlyWithDeadline}
            onChange={(event) => setOnlyWithDeadline(event.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600"
          />
          Doar cu deadline
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1.5 p-2 xl:space-y-2 xl:p-2.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-md border border-neutral-200 bg-neutral-100/70 xl:h-24 xl:rounded-2xl" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-center text-xs text-neutral-500 xl:min-h-[280px] xl:p-6 xl:text-sm">
            Nu există conversații.
          </div>
        ) : (
          <div className="space-y-1.5 p-2 xl:space-y-2 xl:p-2.5">
            {filteredRows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => {
                  setSelectedConversation({ kind: row.kind, id: row.id })
                  onSelectConversation?.()
                }}
                className={`w-full rounded-md border p-2.5 text-left transition xl:rounded-[18px] xl:p-3.5 ${
                  selectedConversation?.kind === row.kind && selectedConversation?.id === row.id
                    ? "border-blue-200 bg-white shadow-sm shadow-blue-100 ring-1 ring-blue-100"
                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-xs font-semibold text-neutral-900 xl:text-sm">{row.title}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium xl:px-2 xl:text-[11px] ${
                      row.status === "CONFIRMED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : row.status === "PENDING"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-neutral-200 bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    {getCycleLabel(row.status)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-neutral-600 xl:text-xs">{row.preview || "Fără preview"}</p>
                <p className="mt-1.5 text-[10px] text-neutral-500 xl:mt-2 xl:text-[11px]">
                  {userNameMap[row.fromUserId] || row.fromUserId} {"->"} {userNameMap[row.toUserId] || row.toUserId}
                </p>
                <p className="text-[10px] text-neutral-400 xl:text-[11px]">{formatDateTime(row.updatedAt)}</p>
                {row.kind === "legacy" ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">Istoric legacy (read-only)</p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <section className="grid h-full min-h-0 w-full flex-1 overflow-hidden rounded-md border border-neutral-300 bg-[#f6f8fc] shadow-none xl:rounded-none xl:border-y xl:border-x-0 xl:border-neutral-200 xl:bg-white xl:grid-cols-[340px_minmax(0,1fr)] min-[1800px]:grid-cols-[680px_minmax(0,1fr)]">
        <div className="hidden min-h-0 xl:flex xl:flex-col xl:overflow-hidden">
          {renderConversationRail()}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden border-t border-neutral-200 bg-white xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white/95 px-2 py-2 xl:hidden">
            <MobileRailSheet side="left" title="Conversații interne" triggerLabel="Conversații" triggerIcon={PanelLeft}>
              {({ close }) => renderConversationRail(() => close())}
            </MobileRailSheet>
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="h-7 rounded-md bg-blue-600 px-2.5 text-[11px] text-white shadow-none hover:bg-blue-700"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Nou
            </Button>
          </div>
          {!selectedConversation || (!selectedThread && !selectedLegacy) ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center xl:min-h-[460px] xl:gap-3 xl:p-10">
              <div className="rounded-full border border-neutral-200 bg-neutral-50 p-3">
                <MessageSquare className="h-6 w-6 text-neutral-400" />
              </div>
              <p className="text-xs font-medium text-neutral-700 xl:text-sm">Selectează o conversație pentru a vedea detaliile</p>
            </div>
          ) : selectedLegacy ? (
            <>
              <div className="space-y-1.5 border-b border-neutral-200 px-3 py-2.5 xl:space-y-3 xl:px-6 xl:py-4">
                <p className="text-sm font-semibold text-neutral-900 xl:text-lg">{selectedLegacy.context || "Conversație legacy"}</p>
                <p className="text-[11px] text-neutral-500 xl:text-xs">Istoric vechi păstrat read-only.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/30 p-3 xl:p-5">
                <div className="rounded-md border border-neutral-200 bg-white p-3 xl:rounded-xl xl:p-4">
                  <p className="text-xs text-neutral-800 xl:text-sm">{selectedLegacy.message}</p>
                  <p className="mt-1.5 text-[11px] text-neutral-500 xl:mt-2 xl:text-xs">
                    {userNameMap[selectedLegacy.fromUserId] || selectedLegacy.fromUserId} {"->"}{" "}
                    {userNameMap[selectedLegacy.toUserId] || selectedLegacy.toUserId}
                  </p>
                  <p className="text-[11px] text-neutral-400 xl:text-xs">{formatDateTime(selectedLegacy.createdAt)}</p>
                </div>
                {selectedLegacy.status === "CONFIRMED" ? (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 xl:mt-3 xl:rounded-xl xl:p-4 xl:text-sm">
                    Confirmat: {selectedLegacy.confirmationMessage || "Fără mesaj suplimentar."}
                  </div>
                ) : null}
              </div>
              <div className="border-t border-neutral-200 bg-white px-3 py-2.5 xl:px-6 xl:py-3">
                <Textarea
                  className="min-h-[64px] text-xs xl:text-sm"
                  value={confirmationDrafts[selectedLegacy.id] || ""}
                  onChange={(event) =>
                    setConfirmationDrafts((prev) => ({
                      ...prev,
                      [selectedLegacy.id]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Mesaj confirmare (legacy)"
                  disabled={!canConfirmSelectedLegacy}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => void handleConfirmLegacy(selectedLegacy.id)}
                    disabled={!canConfirmSelectedLegacy || confirmingLegacyId === selectedLegacy.id}
                  >
                    <CheckCheck className="mr-1.5 h-4 w-4" />
                    Confirmă
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5 border-b border-neutral-200 px-3 py-2.5 xl:space-y-3 xl:px-6 xl:py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900 xl:text-lg">{selectedThread?.context || "Conversație internă"}</p>
                  <span className="text-[11px] text-neutral-500 xl:text-xs">
                    {getCycleLabel(selectedThread?.lastMessageCycleStatus || "NONE")}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 xl:text-xs">
                  Participanți:{" "}
                  {(selectedThread?.participantUserIds || [])
                    .map((id) => userNameMap[id] || id)
                    .join(", ")}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/30">
                <div className="space-y-2.5 px-3 py-3 xl:space-y-4 xl:px-6 xl:py-5">
                  {activeThreadMessages.map((row) => {
                    const mine = row.fromUserId === user?.uid
                    const canConfirm =
                      row.requiresConfirmation &&
                      row.cycleStatus === "PENDING" &&
                      row.fromUserId !== user?.uid &&
                      (row.toUserId === user?.uid || canOverrideConfirm)
                    return (
                      <div
                        key={row.id}
                        id={`crm-internal-msg-${row.id}`}
                        className={`flex scroll-mt-4 ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[90%] rounded-md border px-3 py-2.5 xl:max-w-[85%] xl:rounded-2xl xl:px-4 xl:py-3 ${mine ? "border-blue-200 bg-blue-50" : "border-neutral-200 bg-white"}`}>
                          <p className="whitespace-pre-wrap text-xs text-neutral-800 xl:text-sm">{row.message}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500 xl:mt-2 xl:gap-2 xl:text-[11px]">
                            <span>{userNameMap[row.fromUserId] || row.fromUserId}</span>
                            <span>{formatDateTime(row.createdAt)}</span>
                            {row.requiresConfirmation ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 xl:px-2">
                                <Clock className="h-3 w-3" />
                                {getCycleLabel(row.cycleStatus)}
                              </span>
                            ) : null}
                            {row.deadlineAt ? <span>Deadline: {formatDateTime(row.deadlineAt)}</span> : null}
                          </div>
                          {row.cycleStatus === "CONFIRMED" ? (
                            <p className="mt-1.5 text-[11px] text-emerald-700 xl:mt-2 xl:text-xs">
                              Confirmat de {userNameMap[row.confirmedById || ""] || row.confirmedById} -{" "}
                              {formatDateTime(row.confirmedAt)}
                            </p>
                          ) : null}
                          {canConfirm ? (
                            <div className="mt-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-2 xl:mt-2 xl:rounded-lg">
                              <Textarea
                                className="min-h-[58px] text-xs xl:text-sm"
                                value={confirmationDrafts[row.id] || ""}
                                onChange={(event) =>
                                  setConfirmationDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: event.target.value,
                                  }))
                                }
                                rows={2}
                                placeholder='Mesaj confirmare (opțional). Dacă lași gol, se trimite "Confirmat".'
                              />
                              <p className="mt-1 text-[10px] text-neutral-500 xl:text-[11px]">
                                Confirmarea va apărea ca reply nou în conversație.
                              </p>
                              <div className="mt-2 flex justify-end">
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={() => void handleConfirmMessage(row.id)}
                                  disabled={confirmingMessageId === row.id}
                                >
                                  <CheckCheck className="mr-1.5 h-4 w-4" />
                                  Confirmă și trimite
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="border-t border-neutral-200 bg-white px-3 py-2.5 xl:px-6 xl:py-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={replyToUserId}
                    onChange={(event) => setReplyToUserId(event.target.value)}
                    className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs xl:h-9 xl:rounded-lg xl:px-2.5 xl:text-sm"
                  >
                    <option value="">Alege destinatar</option>
                    {(selectedThread?.participantUserIds || [])
                      .filter((id) => id !== user?.uid)
                      .map((id) => (
                        <option key={id} value={id}>
                          {userNameMap[id] || id}
                        </option>
                      ))}
                  </select>
                  <Input
                    className="h-8 text-xs xl:h-9 xl:text-sm"
                    value={replyContext}
                    onChange={(event) => setReplyContext(event.target.value)}
                    placeholder="Context (opțional)"
                  />
                </div>
                <Textarea
                  className="mt-2 min-h-[72px] text-xs xl:text-sm"
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  rows={3}
                  placeholder="Răspunde în thread..."
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 xl:gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 xl:gap-2 xl:text-xs">
                    <input
                      type="checkbox"
                      checked={replyRequiresConfirmation}
                      onChange={(event) => setReplyRequiresConfirmation(event.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-blue-600"
                    />
                    Solicit confirmare
                  </label>
                  {replyRequiresConfirmation ? (
                    <Input
                      type="date"
                      className="h-8 w-auto text-xs xl:h-9 xl:text-sm"
                      value={replyDueAt}
                      onChange={(event) => setReplyDueAt(event.target.value)}
                    />
                  ) : null}
                  <Button size="sm" className="ml-auto" type="button" onClick={() => void handleSendReply()} disabled={saving}>
                    <Send className="mr-1.5 h-4 w-4" />
                    Trimite
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-neutral-200 px-4 py-3 text-left xl:px-6 xl:py-5">
              <SheetTitle>Conversație internă nouă</SheetTitle>
              <SheetDescription>Canal intern pentru solicitări care necesită confirmare/răspuns.</SheetDescription>
            </SheetHeader>

            <div className="space-y-3 px-4 py-3 xl:space-y-4 xl:px-6 xl:py-5">
              <div className="space-y-1.5">
                <Label htmlFor="internal-note-to-user">Destinatar</Label>
                <select
                  id="internal-note-to-user"
                  value={toUserId}
                  onChange={(event) => setToUserId(event.target.value)}
                  className="h-9 w-full rounded-md border border-neutral-200 bg-white px-2.5 text-xs xl:h-10 xl:rounded-lg xl:px-3 xl:text-sm"
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
                  className="h-9 text-xs xl:text-sm"
                  id="internal-note-context"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="Ex: cash, HR, reminder"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internal-note-due-at">Termen (opțional)</Label>
                <Input
                  className="h-9 text-xs xl:text-sm"
                  id="internal-note-due-at"
                  type="date"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  disabled={!requiresConfirmation}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internal-note-message">Mesaj</Label>
                <Textarea
                  className="min-h-[96px] text-xs xl:text-sm"
                  id="internal-note-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="Ex: Am predat 2500 lei cash. Te rog să confirmi primirea."
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-neutral-700 xl:text-sm">
                <input
                  type="checkbox"
                  checked={requiresConfirmation}
                  onChange={(event) => setRequiresConfirmation(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600"
                />
                Solicit confirmare
              </label>
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 xl:px-6 xl:py-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  resetCreateForm()
                }}
              >
                Anulează
              </Button>
              <Button size="sm" type="button" onClick={() => void handleCreate()} disabled={saving}>
                Salvează
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
