"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Plus } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useToast } from "@/hooks/use-toast"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { listCrmEmails, sendCrmOpportunityEmail } from "@/lib/crm/tasks"
import { getCrmClientById, listCrmClientContacts, listCrmUsers } from "@/lib/crm/opportunities"
import type { CrmClientContact } from "@/lib/crm/types"
import { CRM_OPPORTUNITY_TYPE_LABELS, CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"

function parseEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function appendEmailValue(currentValue: string, email: string) {
  return parseEmailList([currentValue, email].filter(Boolean).join(", ")).join(", ")
}

function buildOpportunityEmailTemplate(params: {
  opportunityCode: string
  opportunityTitle: string
  opportunityType: keyof typeof CRM_OPPORTUNITY_TYPE_LABELS
  clientName: string
  primaryContactName: string
  senderName: string
}) {
  const typeLabel = CRM_OPPORTUNITY_TYPE_LABELS[params.opportunityType] || params.opportunityType
  const salutation = params.primaryContactName ? `Bună ziua, ${params.primaryContactName},` : "Bună ziua,"
  const clientPart = params.clientName ? ` pentru ${params.clientName}` : ""

  const introByType: Record<string, string> = {
    OFERTE: `Revenim cu o actualizare legată de oferta ${params.opportunityCode}${clientPart}.`,
    VANZARI: `Vă contactăm în legătură cu oportunitatea de vânzare ${params.opportunityCode}${clientPart}.`,
    PROIECTE: `Revenim cu detalii privind proiectul ${params.opportunityCode}${clientPart}.`,
    CONTRACTARE: `Vă transmitem o actualizare privind etapa de contractare pentru ${params.opportunityCode}${clientPart}.`,
    ACHIZITII: `Vă scriem în legătură cu etapa de achiziții pentru ${params.opportunityCode}${clientPart}.`,
    LIVRARI: `Vă transmitem o actualizare privind livrarea aferentă ${params.opportunityCode}${clientPart}.`,
    INSTALARI: `Vă scriem în legătură cu programarea/etapa de instalare pentru ${params.opportunityCode}${clientPart}.`,
    FACTURARE: `Vă transmitem o actualizare privind facturarea pentru ${params.opportunityCode}${clientPart}.`,
    EVENIMENTE: `Vă contactăm în legătură cu evenimentul ${params.opportunityCode}${clientPart}.`,
    INTERNE: `Vă transmitem o actualizare privind solicitarea ${params.opportunityCode}${clientPart}.`,
    ACASA: `Vă contactăm în legătură cu oportunitatea ${params.opportunityCode}${clientPart}.`,
  }

  return {
    subject: `${params.opportunityCode} - ${typeLabel}${params.clientName ? ` - ${params.clientName}` : ""}`,
    body: `${salutation}

${introByType[params.opportunityType] || `Vă contactăm în legătură cu oportunitatea ${params.opportunityCode}${clientPart}.`}

Subiect oportunitate: ${params.opportunityTitle}

Revenim cu detaliile complete în acest mesaj.

Cu stimă,
${params.senderName}`,
  }
}

export default function OpportunityEmailsPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string; email: string; role?: string }>>([])
  const [emails, setEmails] = useState<Array<{ id: string; direction: string; subject: string; from: string; to: string[]; cc?: string[]; bcc?: string[]; bodySnippet: string; createdById: string; sentAt?: unknown; createdAt?: unknown; visibility: string }>>([])
  const [clientName, setClientName] = useState("")
  const [clientContacts, setClientContacts] = useState<CrmClientContact[]>([])
  const [loading, setLoading] = useState(true)

  const [subject, setSubject] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [snippet, setSnippet] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreatingEmail, setIsCreatingEmail] = useState(false)

  const userOptions = useMemo(() => users.map((row) => ({ value: row.uid, label: row.displayName })), [users])
  const userNameMap = useMemo(
    () =>
      users.reduce<Record<string, string>>((acc, row) => {
        acc[row.uid] = row.displayName
        return acc
      }, {}),
    [users]
  )

  const load = async () => {
    if (!opportunity || !user?.uid) return

    setLoading(true)
    try {
      const [emailRows, userRows, clientRow, clientContactRows] = await Promise.all([
        listCrmEmails({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
        getCrmClientById(opportunity.clientId),
        listCrmClientContacts(opportunity.clientId),
      ])

      setEmails(emailRows)
      setUsers(
        userRows.map((row) => ({
          uid: row.uid,
          displayName: row.displayName || row.email || row.uid,
          email: row.email || "",
          role: row.role || "",
        }))
      )
      setClientName(clientRow?.name || "")
      setClientContacts(clientContactRows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  useEffect(() => {
    if (!from && user?.email) {
      setFrom(user.email)
    }
  }, [from, user?.email])

  const primaryContact = useMemo(() => {
    if (!opportunity) return null
    return clientContacts.find((contact) => contact.id === opportunity.primaryContactId) || clientContacts.find((contact) => Boolean(contact.email)) || null
  }, [clientContacts, opportunity])

  const suggestedDraft = useMemo(() => {
    if (!opportunity) return null
    return buildOpportunityEmailTemplate({
      opportunityCode: opportunity.code || "OP",
      opportunityTitle: opportunity.displayTitle || opportunity.title || opportunity.code,
      opportunityType: opportunity.opportunityType,
      clientName,
      primaryContactName: primaryContact?.name || "",
      senderName: userData?.displayName || user?.displayName || user?.email || "Echipa CRM",
    })
  }, [clientName, opportunity, primaryContact?.name, user?.displayName, user?.email, userData?.displayName])

  const contactRecipientSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const suggestions: Array<{ email: string; label: string; category: string }> = []

    if (primaryContact?.email) {
      seen.add(primaryContact.email.toLowerCase())
      suggestions.push({
        email: primaryContact.email,
        label: primaryContact.name || primaryContact.email,
        category: "Contact principal",
      })
    }

    clientContacts.forEach((contact) => {
      if (!contact.email) return
      const key = contact.email.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      suggestions.push({
        email: contact.email,
        label: contact.name || contact.email,
        category: "Contact client",
      })
    })

    return suggestions
  }, [clientContacts, primaryContact])

  const internalRecipientSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return users
      .filter((row) => row.email)
      .filter((row) => {
        const key = row.email.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((row) => ({
        email: row.email,
        label: row.displayName || row.email,
        category: "User intern",
      }))
  }, [users])

  const allRecipientSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...contactRecipientSuggestions, ...internalRecipientSuggestions].filter((row) => {
      const key = row.email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [contactRecipientSuggestions, internalRecipientSuggestions])

  const ccBccSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...internalRecipientSuggestions, ...contactRecipientSuggestions].filter((row) => {
      const key = row.email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [contactRecipientSuggestions, internalRecipientSuggestions])

  useEffect(() => {
    if (!isCreateOpen || !opportunity) return
    if (!to && primaryContact?.email) {
      setTo(primaryContact.email)
    }
    if (!subject && suggestedDraft?.subject) {
      setSubject(suggestedDraft.subject)
    }
    if (!snippet && suggestedDraft?.body) {
      setSnippet(suggestedDraft.body)
    }
  }, [isCreateOpen, opportunity, primaryContact?.email, snippet, subject, suggestedDraft, to])

  if (!opportunity) {
    return (
      <Panel
        title="Email"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Email"
      subtitle={""}
      headerAction={
        !isTechnician ? (
          <Button
            size="sm"
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm xl:inline-flex"
            onClick={() => setIsCreateOpen(true)}
            aria-label="Adaugă email"
          >
            <Plus className="h-4 w-4" />
            <span>Adaugă email</span>
          </Button>
        ) : undefined
      }
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 flex justify-end xl:hidden">
          <Button
            size="sm"
            className="h-8 w-8 p-0 text-sm sm:h-9 sm:w-auto sm:px-3"
            onClick={() => setIsCreateOpen(true)}
            aria-label="Adaugă email"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Adaugă email</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Email nou</SheetTitle>
              <SheetDescription>Trimite emailul direct din CRM. Intrarea apare în oportunitate doar după trimitere cu succes.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-800">
                {primaryContact?.email
                  ? `Destinatar precompletat din contactul principal: ${primaryContact.name || primaryContact.email} (${primaryContact.email}).`
                  : "Nu există email pe contactul principal; completează manual destinatarii."}
                {suggestedDraft?.subject ? ` Template implicit: ${CRM_OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}.` : ""}
              </div>
              <div className="mt-2 grid gap-2">
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subiect" className="h-9 text-sm" />
                <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="From (adresa expeditorului)" className="h-9 text-sm" />
                <div className="space-y-1.5">
                  <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="To (destinatari, separați cu virgulă)" className="h-9 text-sm" list="crm-email-to-suggestions" />
                  {allRecipientSuggestions.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {allRecipientSuggestions.slice(0, 8).map((row) => (
                        <Button
                          key={`to-${row.email}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 max-w-full px-2 text-[11px]"
                          onClick={() => setTo((current) => appendEmailValue(current, row.email))}
                        >
                          <span className="truncate">{row.label} · {row.email}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="CC (opțional, separați cu virgulă)" className="h-9 text-sm" list="crm-email-cc-suggestions" />
                  {ccBccSuggestions.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ccBccSuggestions.slice(0, 8).map((row) => (
                        <Button
                          key={`cc-${row.email}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 max-w-full px-2 text-[11px]"
                          onClick={() => setCc((current) => appendEmailValue(current, row.email))}
                        >
                          <span className="truncate">{row.label} · {row.email}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Input value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="BCC (opțional, separați cu virgulă)" className="h-9 text-sm" list="crm-email-bcc-suggestions" />
                  {ccBccSuggestions.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ccBccSuggestions.slice(0, 8).map((row) => (
                        <Button
                          key={`bcc-${row.email}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 max-w-full px-2 text-[11px]"
                          onClick={() => setBcc((current) => appendEmailValue(current, row.email))}
                        >
                          <span className="truncate">{row.label} · {row.email}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Textarea value={snippet} onChange={(event) => setSnippet(event.target.value)} placeholder="Mesaj" className="min-h-[120px] text-sm" />
              </div>
              <datalist id="crm-email-to-suggestions">
                {allRecipientSuggestions.map((row) => (
                  <option key={`datalist-to-${row.email}`} value={row.email}>
                    {row.label} ({row.category})
                  </option>
                ))}
              </datalist>
              <datalist id="crm-email-cc-suggestions">
                {ccBccSuggestions.map((row) => (
                  <option key={`datalist-cc-${row.email}`} value={row.email}>
                    {row.label} ({row.category})
                  </option>
                ))}
              </datalist>
              <datalist id="crm-email-bcc-suggestions">
                {ccBccSuggestions.map((row) => (
                  <option key={`datalist-bcc-${row.email}`} value={row.email}>
                    {row.label} ({row.category})
                  </option>
                ))}
              </datalist>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_VISIBILITIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {CRM_VISIBILITY_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visibility === "CUSTOM" ? (
                  <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Alege useri" />
                ) : null}
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-sm"
                  disabled={isCreatingEmail}
                  onClick={() => setIsCreateOpen(false)}
                >
                  Anulează
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-sm"
                  disabled={isCreatingEmail}
                  onClick={async () => {
                    if (!subject.trim() || !from.trim() || !to.trim() || !user?.uid || isCreatingEmail) return
                    setIsCreatingEmail(true)
                    try {
                      await sendCrmOpportunityEmail({
                        opportunityId,
                        subject,
                        from,
                        to: parseEmailList(to),
                        cc: parseEmailList(cc),
                        bcc: parseEmailList(bcc),
                        bodySnippet: snippet,
                        visibility,
                        visibleToUserIds,
                      })

                      setSubject("")
                      setFrom("")
                      setTo("")
                      setCc("")
                      setBcc("")
                      setSnippet("")
                      setVisibility("PRIVATE")
                      setVisibleToUserIds([])
                      setIsCreateOpen(false)
                      toast({
                        title: "Email trimis",
                        description: "Emailul a fost trimis și logat în oportunitate.",
                      })
                      await load()
                    } catch (error) {
                      toast({
                        title: "Eroare la trimitere",
                        description: error instanceof Error ? error.message : "Nu am putut trimite emailul.",
                        variant: "destructive",
                      })
                    } finally {
                      setIsCreatingEmail(false)
                    }
                  }}
                >
                  {isCreatingEmail ? "Se trimite..." : "Trimite"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă emailurile...</p>
        ) : emails.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există emailuri vizibile.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {emails.map((email) => (
              <div key={email.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-neutral-900">[{email.direction}] {email.subject}</p>
                  <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[email.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">{email.from} → {email.to.join(", ")}</p>
                {email.cc?.length ? <p className="mt-1 text-sm text-neutral-500">CC: {email.cc.join(", ")}</p> : null}
                {email.bcc?.length ? <p className="mt-1 text-sm text-neutral-500">BCC: {email.bcc.join(", ")}</p> : null}
                <p className="mt-1 text-sm text-neutral-700">{email.bodySnippet || "-"}</p>
                <p className="mt-2 text-sm text-neutral-400">{formatDateTime(email.sentAt || email.createdAt)} • {userNameMap[email.createdById] || email.createdById}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
