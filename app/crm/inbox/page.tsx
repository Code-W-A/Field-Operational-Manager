"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLink, Link2, Loader2, MailPlus, Search, Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { CreateOpportunityDialog } from "@/components/crm/create-opportunity-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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

  return cleaned || subject.trim() || "Oportunitate noua din email"
}

function getLinkedOpportunityHref(item: CrmInboxMessageListItem) {
  const opportunityId = item.linkedOpportunity?.id || item.opportunityId
  if (!opportunityId) return null
  return `/crm/opportunities/${opportunityId}/emails`
}

function getSuggestionDisplay(recommendation: CrmInboxOpportunityRecommendation) {
  const code = recommendation.code || "Fara cod"
  const title = recommendation.title || "Fara titlu"
  const reason = RECOMMENDATION_REASON_LABELS[recommendation.reason]
  return { code, title, reason }
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

  const selectedOpportunity = useMemo(
    () => opportunityResults.find((item) => item.id === selectedOpportunityId) || null,
    [opportunityResults, selectedOpportunityId]
  )

  if (disabled) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="border-neutral-200">
          <CardHeader>
            <CardTitle>Emailuri CRM sunt dezactivate</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            Activeaza `CRM_INBOX_ENABLED=true` pentru a folosi acest modul.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <Card className="border-neutral-200">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Emailuri</CardTitle>
              <p className="mt-1 text-sm text-neutral-500">
                Inbox de lucru pentru mesajele incoming din {CRM_INBOX_ACCOUNT}, cu recomandare si legare la oportunitati.
              </p>
            </div>
            <div className="text-xs text-neutral-500">
              Scanate: {meta.scanned} | Afisate: {meta.returned}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="flex flex-col gap-1 text-sm text-neutral-600">
              Status
              <select
                className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value={ALL_FILTER}>Toate</option>
                {CRM_INBOX_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-neutral-600">
              Categorie
              <select
                className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value={ALL_FILTER}>Toate</option>
                {CRM_INBOX_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-neutral-600">
              Legare
              <select
                className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm"
                value={linkStateFilter}
                onChange={(event) => setLinkStateFilter(event.target.value)}
              >
                <option value={ALL_FILTER}>Toate</option>
                {CRM_INBOX_LINK_STATES.map((linkState) => (
                  <option key={linkState} value={linkState}>
                    {linkState}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStatusFilter(ALL_FILTER)
                  setCategoryFilter(ALL_FILTER)
                  setLinkStateFilter(ALL_FILTER)
                }}
              >
                Reseteaza filtrele
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-neutral-500">Se incarca inbox-ul...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500">Nu exista emailuri pentru filtrele curente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">Sugestie</th>
                    <th className="px-3 py-2 font-medium">Oportunitate</th>
                    <th className="px-3 py-2 font-medium">Categorie</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Primit</th>
                    <th className="px-3 py-2 font-medium">Actiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const topRecommendation = item.recommendedOpportunities[0]
                    const linkedHref = getLinkedOpportunityHref(item)

                    return (
                      <tr key={item.id} className="border-b border-neutral-100 align-top">
                        <td className="min-w-[320px] px-3 py-3">
                          <div className="font-medium text-neutral-900">{item.subject || "(fara subiect)"}</div>
                          <div className="mt-1 max-w-xl text-xs text-neutral-500">{item.bodySnippet || "-"}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.subjectOpportunityCode ? (
                              <Badge variant="secondary" className="bg-sky-100 text-sky-700 hover:bg-sky-100">
                                {item.subjectOpportunityCode}
                              </Badge>
                            ) : null}
                            {item.crmEmailId ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                Logat in CRM Email
                              </Badge>
                            ) : null}
                          </div>
                        </td>

                        <td className="min-w-[220px] px-3 py-3 text-neutral-700">{item.from}</td>

                        <td className="min-w-[260px] px-3 py-3">
                          {item.recommendedOpportunities.length === 0 ? (
                            <span className="text-xs text-neutral-500">Fara recomandare</span>
                          ) : (
                            <div className="space-y-2">
                              {item.recommendedOpportunities.slice(0, 2).map((recommendation) => {
                                const display = getSuggestionDisplay(recommendation)
                                return (
                                  <div key={`${item.id}-${recommendation.id}`} className="rounded-md border border-neutral-200 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-xs font-semibold text-neutral-900">
                                          {display.code} - {display.title}
                                        </div>
                                        <div className="mt-1 text-[11px] text-neutral-500">{display.reason}</div>
                                        {recommendation.clientName ? (
                                          <div className="mt-1 text-[11px] text-neutral-500">{recommendation.clientName}</div>
                                        ) : null}
                                      </div>
                                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>

                        <td className="min-w-[260px] px-3 py-3">
                          {item.linkedOpportunity?.id || item.opportunityId ? (
                            <div className="space-y-2">
                              <div className="rounded-md border border-neutral-200 p-2">
                                <div className="text-xs font-semibold text-neutral-900">
                                  {item.linkedOpportunity?.code || item.opportunityCode || "Fara cod"} -{" "}
                                  {item.linkedOpportunity?.title || "Oportunitate legata"}
                                </div>
                                {item.linkedOpportunity?.clientName ? (
                                  <div className="mt-1 text-[11px] text-neutral-500">{item.linkedOpportunity.clientName}</div>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.linkMethod ? (
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                      {LINK_METHOD_LABELS[item.linkMethod]}
                                    </Badge>
                                  ) : null}
                                  {linkedHref ? (
                                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
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
                            <span className="text-xs text-neutral-500">Neasignat</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <select
                            className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs"
                            value={item.category}
                            disabled={savingId === item.id}
                            onChange={(event) =>
                              void handleUpdate(item.id, { category: event.target.value as CrmInboxCategory })
                            }
                          >
                            {CRM_INBOX_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-3 py-3">
                          <select
                            className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs"
                            value={item.status}
                            disabled={savingId === item.id}
                            onChange={(event) =>
                              void handleUpdate(item.id, { status: event.target.value as CrmInboxStatus })
                            }
                          >
                            {CRM_INBOX_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-neutral-600">{formatReceivedAt(item.receivedAt)}</td>

                        <td className="min-w-[260px] px-3 py-3">
                          <div className="flex flex-col gap-2">
                            {topRecommendation && !item.opportunityId ? (
                              <Button
                                type="button"
                                size="sm"
                                className="justify-start"
                                disabled={linkingId === item.id}
                                onClick={() => void handleLink(item, topRecommendation.id, topRecommendation.reason)}
                              >
                                {linkingId === item.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="mr-2 h-4 w-4" />
                                )}
                                Asigneaza la sugestie
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(item.opportunityId)}
                              onClick={() => setLinkDialogItem(item)}
                            >
                              <Search className="mr-2 h-4 w-4" />
                              Asigneaza la oportunitate
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!user?.uid || Boolean(item.opportunityId)}
                              onClick={() => setCreateDialogItem(item)}
                            >
                              <MailPlus className="mr-2 h-4 w-4" />
                              Oportunitate noua
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(linkDialogItem)} onOpenChange={(open) => (!open ? setLinkDialogItem(null) : undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Asigneaza email la oportunitate existenta</DialogTitle>
            <DialogDescription>
              Cauta o oportunitate accesibila si leaga acest email. Dupa legare, mesajul este logat in tab-ul Email.
            </DialogDescription>
          </DialogHeader>

          {linkDialogItem ? (
            <div className="space-y-4">
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <div className="font-medium text-neutral-900">{linkDialogItem.subject || "(fara subiect)"}</div>
                <div className="mt-1 text-xs text-neutral-500">{linkDialogItem.from}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Cauta oportunitate</label>
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
                  Se cauta oportunitati...
                </div>
              ) : opportunityResults.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-500">
                  Nu am gasit oportunitati pentru cautarea curenta.
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
                        {result.code || "Fara cod"} - {result.title || result.displayTitle || "Fara titlu"}
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
                      Selectat: {selectedOpportunity.code || "Fara cod"} - {selectedOpportunity.title || selectedOpportunity.displayTitle}
                    </>
                  ) : (
                    "Selecteaza o oportunitate din lista."
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
                  Leaga emailul
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
