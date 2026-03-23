"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ExternalLink, Link2, Loader2, MailPlus, RefreshCw, Search, Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { CreateOpportunityDialog } from "@/components/crm/create-opportunity-dialog"
import { SubtleBadge } from "@/components/crm"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  CRM_INBOX_ACCOUNT,
  CRM_INBOX_CATEGORIES,
  CRM_INBOX_LINK_STATES,
  CRM_INBOX_STATUSES,
  type CrmInboxCategory,
  type CrmInboxLinkMethod,
  type CrmInboxMessageListItem,
  type CrmInboxOpportunityRecommendation,
  type CrmInboxStatus,
} from "@/lib/crm/inbox-types"
import { cn } from "@/lib/utils"

type InboxListResponse = {
  ok: boolean
  items: CrmInboxMessageListItem[]
  meta: { scanned: number; returned: number }
}

type InboxItemResponse = {
  ok?: boolean
  item?: CrmInboxMessageListItem
  error?: string
}

type OpportunitySearchResult = {
  id: string
  code?: string
  title?: string
  displayTitle?: string
  clientId?: string
  clientName?: string
  updatedAt?: string | null
}

type OpportunitySearchResponse = {
  ok?: boolean
  items?: OpportunitySearchResult[]
  error?: string
}

type InboxSyncResponse = {
  ok: boolean
  sync: {
    locked: boolean
    fetched: number
    inserted: number
    updated: number
    skipped: number
    autoLinked: number
    bootstrap: boolean
    reset: boolean
  }
}

const ALL_FILTER = "ALL"

const RECOMMENDATION_REASON_LABELS: Record<CrmInboxOpportunityRecommendation["reason"], string> = {
  subject_code: "Cod OP din subiect",
  sender_contact: "Expeditor cunoscut",
}

const LINK_METHOD_LABELS: Record<CrmInboxLinkMethod, string> = {
  subject_code: "Legat din subiect",
  sender_contact: "Legat din contact",
  manual_existing: "Legat manual",
  created_from_email: "Creat din email",
}

const INBOX_GRID_COLUMNS =
  "grid min-w-[1540px] grid-cols-[minmax(0,1.8fr)_minmax(0,1.08fr)_minmax(0,1.16fr)_minmax(0,1.34fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,1.55fr)]"

function splitSenderDisplay(value: string) {
  const trimmed = value.trim()
  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const email = emailMatch?.[0] || ""

  let label = trimmed
  if (email) {
    label = trimmed.replace(email, "").replace(/[<>"]/g, " ").replace(/\s+/g, " ").trim()
  }

  if (!label) {
    label = email || trimmed || "-"
  }

  return {
    label,
    email: email || trimmed || "-",
  }
}

function formatReceivedAt(value: unknown) {
  const date = value ? new Date(String(value)) : null
  if (!date || Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function getOpportunityDraftTitle(subject: string) {
  const cleaned = subject
    .replace(/\bOP\.\s*0*\d+\b/gi, "")
    .replace(/^[\s\-:|#]+|[\s\-:|#]+$/g, "")
    .trim()

  return cleaned || subject.trim() || "Oportunitate nouă din email"
}

function getLinkedOpportunityHref(item: CrmInboxMessageListItem) {
  const opportunityId = item.linkedOpportunity?.id || item.opportunityId
  if (!opportunityId) return null
  return `/crm/opportunities/${opportunityId}/emails`
}

function getSuggestionDisplay(recommendation: CrmInboxOpportunityRecommendation) {
  const code = recommendation.code || "Fără cod"
  const title = recommendation.title || "Fără titlu"
  const reason = RECOMMENDATION_REASON_LABELS[recommendation.reason]
  return { code, title, reason }
}

function InboxStatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-3.5 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-neutral-900">{value}</span>
    </div>
  )
}

function InboxSelect({
  label,
  value,
  onChange,
  children,
  className,
  compact = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">{label}</span> : null}
      <div className="relative">
        <select
          className={cn(
            "w-full appearance-none rounded-full border border-neutral-200/80 bg-white pl-3 pr-9 text-[13px] font-medium text-neutral-800 shadow-none outline-none transition focus:border-neutral-300 focus:ring-4 focus:ring-neutral-900/[0.04]",
            compact ? "h-8" : "h-10",
            !label && "text-xs",
          )}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
      </div>
    </label>
  )
}

function InboxEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <SubtleBadge tone="neutral" className="mb-3 px-3">
        Inbox curat
      </SubtleBadge>
      <h3 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-500">{description}</p>
    </div>
  )
}

function InboxLoadingState() {
  return (
    <div className="space-y-3 px-5 py-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-[24px] border border-neutral-200/70 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          <div className={INBOX_GRID_COLUMNS + " gap-4"}>
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-8 w-full rounded-full" />
            <Skeleton className="h-8 w-full rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-full" />
              <Skeleton className="h-9 w-full rounded-full" />
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CrmInboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || ALL_FILTER)
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || ALL_FILTER)
  const [linkStateFilter, setLinkStateFilter] = useState(searchParams.get("linkState") || ALL_FILTER)
  const [items, setItems] = useState<CrmInboxMessageListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ scanned: number; returned: number }>({ scanned: 0, returned: 0 })

  const [linkDialogItem, setLinkDialogItem] = useState<CrmInboxMessageListItem | null>(null)
  const [opportunityQuery, setOpportunityQuery] = useState("")
  const [opportunityResults, setOpportunityResults] = useState<OpportunitySearchResult[]>([])
  const [opportunitySearchLoading, setOpportunitySearchLoading] = useState(false)
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("")

  const [createDialogItem, setCreateDialogItem] = useState<CrmInboxMessageListItem | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (statusFilter !== ALL_FILTER) params.set("status", statusFilter)
    if (categoryFilter !== ALL_FILTER) params.set("category", categoryFilter)
    if (linkStateFilter !== ALL_FILTER) params.set("linkState", linkStateFilter)
    return params.toString()
  }, [categoryFilter, linkStateFilter, statusFilter])

  useEffect(() => {
    router.replace(queryString ? `/crm/inbox?${queryString}` : "/crm/inbox")
  }, [queryString, router])

  const loadInbox = useCallback(
    async (showSpinner = true) => {
      if (disabled) return
      if (showSpinner) {
        setLoading(true)
      }

      try {
        const response = await fetch(`/api/crm/inbox/list${queryString ? `?${queryString}` : ""}`, {
          method: "GET",
          credentials: "same-origin",
        })

        if (response.status === 404) {
          setDisabled(true)
          setItems([])
          setMeta({ scanned: 0, returned: 0 })
          return
        }

        const data = (await response.json()) as InboxListResponse | { error?: string }
        if (!response.ok) {
          throw new Error("error" in data && data.error ? data.error : "Nu am putut incarca inbox-ul")
        }

        const successData = data as InboxListResponse
        setItems(successData.items)
        setMeta(successData.meta)
      } catch (error) {
        toast({
          title: "Eroare la incarcare",
          description: error instanceof Error ? error.message : "Nu am putut incarca inbox-ul",
          variant: "destructive",
        })
      } finally {
        if (showSpinner) {
          setLoading(false)
        }
      }
    },
    [disabled, queryString, toast]
  )

  useEffect(() => {
    void loadInbox(true)
  }, [loadInbox])

  useEffect(() => {
    if (!linkDialogItem) {
      setOpportunityQuery("")
      setOpportunityResults([])
      setOpportunitySearchLoading(false)
      setSelectedOpportunityId("")
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setOpportunitySearchLoading(true)
      try {
        const params = new URLSearchParams()
        if (opportunityQuery.trim()) {
          params.set("q", opportunityQuery.trim())
        }

        const response = await fetch(`/api/crm/opportunities/search${params.toString() ? `?${params.toString()}` : ""}`, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        })

        const data = (await response.json()) as OpportunitySearchResponse
        if (!response.ok) {
          throw new Error(data.error || "Nu am putut cauta oportunitati")
        }

        if (!cancelled) {
          setOpportunityResults(data.items || [])
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          toast({
            title: "Eroare la cautare",
            description: error instanceof Error ? error.message : "Nu am putut cauta oportunitati",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) {
          setOpportunitySearchLoading(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [linkDialogItem, opportunityQuery, toast])

  const handleUpdate = async (
    id: string,
    patch: Partial<Pick<CrmInboxMessageListItem, "status" | "category">>
  ) => {
    setSavingId(id)
    try {
      const response = await fetch("/api/crm/inbox/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ id, ...patch }),
      })

      const data = (await response.json()) as InboxItemResponse
      if (!response.ok || !data.item) {
        throw new Error(data.error || "Actualizarea a esuat")
      }

      await loadInbox(false)
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Actualizarea a esuat",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  const handleLink = async (
    item: CrmInboxMessageListItem,
    opportunityId: string,
    linkMethod: CrmInboxLinkMethod
  ) => {
    if (!opportunityId) return

    setLinkingId(item.id)
    try {
      const response = await fetch("/api/crm/inbox/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          inboxMessageId: item.id,
          opportunityId,
          linkMethod,
        }),
      })

      const data = (await response.json()) as InboxItemResponse
      if (!response.ok || !data.item) {
        throw new Error(data.error || "Nu am putut lega emailul la oportunitate")
      }

      setLinkDialogItem(null)
      await loadInbox(false)
      toast({
        title: "Email asignat",
        description: "Emailul a fost legat la oportunitate si logat in tab-ul Email.",
      })
    } catch (error) {
      toast({
        title: "Eroare la asignare",
        description: error instanceof Error ? error.message : "Nu am putut lega emailul la oportunitate",
        variant: "destructive",
      })
    } finally {
      setLinkingId(null)
    }
  }

  const handleSync = async () => {
    if (disabled) return

    setSyncing(true)
    try {
      const response = await fetch("/api/crm/inbox/sync", {
        method: "POST",
        credentials: "same-origin",
      })

      if (response.status === 404) {
        setDisabled(true)
        setItems([])
        setMeta({ scanned: 0, returned: 0 })
        return
      }

      const data = (await response.json()) as InboxSyncResponse | { error?: string }
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Nu am putut sincroniza inbox-ul")
      }

      const successData = data as InboxSyncResponse
      if (successData.sync.locked) {
        toast({
          title: "Sincronizare în curs",
          description: "Există deja o sincronizare activă pentru inbox. Reîncearcă în scurt timp.",
        })
        return
      }

      await loadInbox(false)

      const flags = [
        successData.sync.bootstrap ? "bootstrap" : null,
        successData.sync.reset ? "reset UIDVALIDITY" : null,
      ].filter(Boolean)

      toast({
        title: "Inbox sincronizat",
        description: [
          `Preluate ${successData.sync.fetched}`,
          `noi ${successData.sync.inserted}`,
          `actualizate ${successData.sync.updated}`,
          `auto-legate ${successData.sync.autoLinked}`,
          flags.length ? `(${flags.join(", ")})` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })
    } catch (error) {
      toast({
        title: "Eroare la sincronizare",
        description: error instanceof Error ? error.message : "Nu am putut sincroniza inbox-ul",
        variant: "destructive",
      })
    } finally {
      setSyncing(false)
    }
  }

  const selectedOpportunity = useMemo(
    () => opportunityResults.find((item) => item.id === selectedOpportunityId) || null,
    [opportunityResults, selectedOpportunityId]
  )

  if (disabled) {
    return (
      <div className="mx-auto flex min-h-full max-w-[1680px] items-start px-4 py-5 sm:px-6 lg:px-8">
        <div className="w-full rounded-[28px] border border-neutral-200/80 bg-white/95 px-6 py-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <SubtleBadge tone="neutral" className="mb-4 px-3">
            CRM Inbox
          </SubtleBadge>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Emailuri CRM sunt dezactivate</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
            Activează `CRM_INBOX_ENABLED=true` pentru a folosi acest modul.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="rounded-[32px] border border-neutral-200/80 bg-white/95 px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
            
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Emailuri</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                
                <SubtleBadge tone="neutral" className="px-3">
                  {items.length} emailuri vizibile
                </SubtleBadge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <InboxStatPill label="Scanate" value={meta.scanned} />
              <InboxStatPill label="Afisate" value={meta.returned} />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSync()}
                disabled={syncing || loading}
                className="h-10 rounded-full border-neutral-200/80 bg-white px-4 text-sm font-medium text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
              >
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizează
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-neutral-200/80 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="border-b border-neutral-100/80 px-4 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-3 xl:flex xl:flex-1 xl:flex-wrap">
                <InboxSelect label="Status" value={statusFilter} onChange={setStatusFilter} className="sm:min-w-[180px]">
                  <option value={ALL_FILTER}>Toate</option>
                  {CRM_INBOX_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </InboxSelect>

                <InboxSelect label="Categorie" value={categoryFilter} onChange={setCategoryFilter} className="sm:min-w-[180px]">
                  <option value={ALL_FILTER}>Toate</option>
                  {CRM_INBOX_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </InboxSelect>

                <InboxSelect label="Legare" value={linkStateFilter} onChange={setLinkStateFilter} className="sm:min-w-[180px]">
                  <option value={ALL_FILTER}>Toate</option>
                  {CRM_INBOX_LINK_STATES.map((linkState) => (
                    <option key={linkState} value={linkState}>
                      {linkState}
                    </option>
                  ))}
                </InboxSelect>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStatusFilter(ALL_FILTER)
                  setCategoryFilter(ALL_FILTER)
                  setLinkStateFilter(ALL_FILTER)
                }}
                className="h-10 rounded-full px-4 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                Resetează filtrele
              </Button>
            </div>
          </div>

          {loading ? (
            <InboxLoadingState />
          ) : items.length === 0 ? (
            <InboxEmptyState
              title="Nu există emailuri pentru filtrele curente."
              description="Încearcă alt filtru sau apasă Sincronizează pentru a prelua mesaje noi în inbox."
            />
          ) : (
            <div className="overflow-x-auto">
              <div className={INBOX_GRID_COLUMNS}>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Email
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  From
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Sugestie
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Oportunitate
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Categorie
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Status
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Primit
                </div>
                <div className="border-b border-neutral-100/80 bg-neutral-50/80 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Actiuni
                </div>
              </div>

              <div className="space-y-3 p-3">
                {items.map((item) => {
                  const topRecommendation = item.recommendedOpportunities[0]
                  const linkedHref = getLinkedOpportunityHref(item)
                  const sender = splitSenderDisplay(item.from)

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        INBOX_GRID_COLUMNS,
                        "group overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-[border-color,box-shadow,background-color] duration-150 hover:border-neutral-300 hover:bg-white hover:shadow-[0_3px_8px_rgba(15,23,42,0.03)] focus-within:border-neutral-300 focus-within:bg-white",
                      )}
                    >
                      <div className="px-5 py-4 align-top">
                        <div className="space-y-2">
                          <div className="text-[15px] font-medium leading-6 tracking-tight text-neutral-950 transition-colors group-hover:text-neutral-900">
                            {item.subject || "(fără subiect)"}
                          </div>
                          <div className="max-w-[58ch] text-[13px] leading-5 text-neutral-500 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                            {item.bodySnippet || "-"}
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {item.subjectOpportunityCode ? (
                              <SubtleBadge tone="accent" className="h-6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                                {item.subjectOpportunityCode}
                              </SubtleBadge>
                            ) : null}
                            {item.crmEmailId ? (
                              <SubtleBadge tone="success" className="h-6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                                Logat in CRM Email
                              </SubtleBadge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="px-5 py-4 align-top">
                        <div className="space-y-1">
                          <div className="text-[14px] font-medium leading-6 text-neutral-900">{sender.label}</div>
                          <div className="text-xs leading-5 text-neutral-500">{sender.email}</div>
                        </div>
                      </div>

                      <div className="px-5 py-4 align-top">
                        {item.recommendedOpportunities.length === 0 ? (
                          <SubtleBadge tone="neutral" className="h-6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                            Fără recomandare
                          </SubtleBadge>
                        ) : (
                          <div className="space-y-2">
                            {item.recommendedOpportunities.slice(0, 2).map((recommendation) => {
                              const display = getSuggestionDisplay(recommendation)
                              return (
                                <div key={`${item.id}-${recommendation.id}`} className="rounded-2xl border border-neutral-200/70 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                      <SubtleBadge tone="accent" className="h-6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                                        {display.code}
                                      </SubtleBadge>
                                      <div className="text-sm font-medium leading-5 text-neutral-900">{display.title}</div>
                                      <div className="text-[11px] leading-4 text-neutral-500">{display.reason}</div>
                                      {recommendation.clientName ? <div className="text-[11px] leading-4 text-neutral-500">{recommendation.clientName}</div> : null}
                                    </div>
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div className="px-5 py-4 align-top">
                        {item.linkedOpportunity?.id || item.opportunityId ? (
                          <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                            <div className="space-y-1">
                              <div className="text-[14px] font-semibold leading-5 text-neutral-950">
                                {item.linkedOpportunity?.code || item.opportunityCode || "Fără cod"}{" "}
                                <span className="text-neutral-300">•</span> {item.linkedOpportunity?.title || "Oportunitate legata"}
                              </div>
                              {item.linkedOpportunity?.clientName ? <div className="text-xs leading-5 text-neutral-500">{item.linkedOpportunity.clientName}</div> : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {item.linkMethod ? (
                                  <SubtleBadge tone="neutral" className="h-6 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                                    {LINK_METHOD_LABELS[item.linkMethod]}
                                  </SubtleBadge>
                                ) : null}
                                {linkedHref ? (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-full px-2 text-[11px] font-medium text-neutral-600 transition hover:bg-white hover:text-neutral-900"
                                  >
                                    <Link href={linkedHref}>
                                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                      Deschide
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-500">Neasignat</span>
                        )}
                      </div>

                      <div className="px-5 py-4 align-top">
                        <InboxSelect
                          value={item.category}
                          onChange={(value) => void handleUpdate(item.id, { category: value as CrmInboxCategory })}
                          compact
                        >
                          {CRM_INBOX_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </InboxSelect>
                      </div>

                      <div className="px-5 py-4 align-top">
                        <InboxSelect
                          value={item.status}
                          onChange={(value) => void handleUpdate(item.id, { status: value as CrmInboxStatus })}
                          compact
                        >
                          {CRM_INBOX_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </InboxSelect>
                      </div>

                      <div className="px-5 py-4 align-top">
                        <div className="text-sm font-medium leading-6 text-neutral-700">{formatReceivedAt(item.receivedAt)}</div>
                      </div>

                      <div className="px-5 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 justify-start rounded-full border-neutral-200/80 bg-white px-3.5 text-xs font-medium text-neutral-800 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-neutral-50"
                            disabled={Boolean(item.opportunityId)}
                            onClick={() => setLinkDialogItem(item)}
                          >
                            <Search className="mr-2 h-4 w-4" />
                            Asignează la oportunitate
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 justify-start rounded-full px-3.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
                            disabled={!user?.uid || Boolean(item.opportunityId)}
                            onClick={() => setCreateDialogItem(item)}
                          >
                            <MailPlus className="mr-2 h-4 w-4" />
                            Oportunitate nouă
                          </Button>

                          {topRecommendation && !item.opportunityId ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 justify-start rounded-full px-2.5 text-[11px] font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
                              disabled={linkingId === item.id}
                              onClick={() => void handleLink(item, topRecommendation.id, topRecommendation.reason)}
                            >
                              {linkingId === item.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                              )}
                              Asignează sugestia
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(linkDialogItem)} onOpenChange={(open) => (!open ? setLinkDialogItem(null) : undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
          <DialogTitle>Asignează email la oportunitate existentă</DialogTitle>
            <DialogDescription>
              Cauta o oportunitate accesibila si leaga acest email. Dupa legare, mesajul este logat in tab-ul Email.
            </DialogDescription>
          </DialogHeader>

          {linkDialogItem ? (
            <div className="space-y-4">
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <div className="font-medium text-neutral-900">{linkDialogItem.subject || "(fără subiect)"}</div>
                <div className="mt-1 text-xs text-neutral-500">{linkDialogItem.from}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Caută oportunitate</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input
                    value={opportunityQuery}
                    onChange={(event) => setOpportunityQuery(event.target.value)}
                    placeholder="Cod OP, titlu sau client"
                    className="pl-9"
                  />
                </div>
              </div>

              {opportunitySearchLoading ? (
                <div className="flex items-center gap-2 rounded-md border border-neutral-200 p-3 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se caută oportunități...
                </div>
              ) : opportunityResults.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-500">
                  Nu am găsit oportunități pentru căutarea curentă.
                </div>
              ) : (
                <div className="max-h-[360px] space-y-2 overflow-y-auto">
                  {opportunityResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className={`w-full rounded-md border p-3 text-left transition ${
                        selectedOpportunityId === result.id
                          ? "border-blue-300 bg-blue-50"
                          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                      onClick={() => setSelectedOpportunityId(result.id)}
                    >
                      <div className="text-sm font-semibold text-neutral-900">
                        {result.code || "Fără cod"} - {result.title || result.displayTitle || "Fără titlu"}
                      </div>
                      {result.clientName ? <div className="mt-1 text-xs text-neutral-500">{result.clientName}</div> : null}
                      {result.updatedAt ? (
                        <div className="mt-1 text-[11px] text-neutral-400">Actualizat: {formatReceivedAt(result.updatedAt)}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
                <div className="text-xs text-neutral-500">
                  {selectedOpportunity ? (
                    <>
                      Selectat: {selectedOpportunity.code || "Fără cod"} - {selectedOpportunity.title || selectedOpportunity.displayTitle}
                    </>
                  ) : (
                    "Selectează o oportunitate din listă."
                  )}
                </div>
                <Button
                  type="button"
                  disabled={!selectedOpportunityId || linkingId === linkDialogItem.id}
                  onClick={() => void handleLink(linkDialogItem, selectedOpportunityId, "manual_existing")}
                >
                  {linkingId === linkDialogItem.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Leagă emailul
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <CreateOpportunityDialog
        actorId={user?.uid || ""}
        open={Boolean(createDialogItem)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogItem(null)
          }
        }}
        hideTrigger
        prefilledClientId={createDialogItem?.draftClientId || ""}
        prefilledTitle={createDialogItem ? getOpportunityDraftTitle(createDialogItem.subject) : ""}
        onCreated={(opportunityId) => {
          if (!createDialogItem) return
          void handleLink(createDialogItem, opportunityId, "created_from_email")
        }}
      />
    </div>
  )
}
