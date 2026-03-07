"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { createCrmEmail, listCrmEmails } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_DIRECTIONS, CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"

export default function OpportunityEmailsPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [emails, setEmails] = useState<Array<{ id: string; direction: string; subject: string; from: string; to: string[]; bodySnippet: string; createdById: string; createdAt?: unknown; visibility: string }>>([])
  const [loading, setLoading] = useState(true)

  const [direction, setDirection] = useState<(typeof CRM_DIRECTIONS)[number]>("OUT")
  const [subject, setSubject] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [snippet, setSnippet] = useState("")
  const [sentAt, setSentAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)

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
      const [emailRows, userRows] = await Promise.all([
        listCrmEmails({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
      ])

      setEmails(emailRows)
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  if (!opportunity) {
    return <Panel title="Email" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Email"
      subtitle={isTechnician ? "Vizualizare read-only: emailurile vizibile în oportunitate." : "MVP email log (IN/OUT) tratat ca activity record"}
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 flex justify-end">
          <Button size="sm" className="h-9 text-sm" onClick={() => setIsCreateOpen(true)}>
            Adaugă email
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Email nou</SheetTitle>
              <SheetDescription>Adaugă un email IN/OUT ca activitate pe oportunitate.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Direcție</Label>
              <Select value={direction} onValueChange={(value) => setDirection(value as typeof direction)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="IN / OUT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">IN</SelectItem>
                  <SelectItem value="OUT">OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sentAt">Data</Label>
              <Input id="sentAt" type="datetime-local" value={sentAt} onChange={(event) => setSentAt(event.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="mt-2 grid gap-2">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="h-9 text-sm" />
            <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="From" className="h-9 text-sm" />
            <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="To (separate cu virgulă)" className="h-9 text-sm" />
                <Textarea value={snippet} onChange={(event) => setSnippet(event.target.value)} placeholder="Body snippet" className="min-h-[120px] text-sm" />
          </div>

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
                  onClick={() => setIsCreateOpen(false)}
                >
                  Anulează
                </Button>
            <Button
              size="sm"
              className="h-9 text-sm"
              onClick={async () => {
                if (!subject.trim() || !from.trim() || !to.trim() || !user?.uid) return

                await createCrmEmail({
                  opportunityId,
                  direction,
                  subject,
                  from,
                  to: to.split(",").map((item) => item.trim()).filter(Boolean),
                  bodySnippet: snippet,
                  sentAt: sentAt ? new Date(sentAt) : undefined,
                  createdById: user.uid,
                  visibility,
                  visibleToUserIds,
                })

                setDirection("OUT")
                setSubject("")
                setFrom("")
                setTo("")
                setSnippet("")
                setSentAt("")
                    setVisibility("PRIVATE")
                setVisibleToUserIds([])
                    setIsCreateOpen(false)
                await load()
              }}
            >
                  Salvează
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
                <p className="mt-1 text-sm text-neutral-700">{email.bodySnippet || "-"}</p>
                <p className="mt-2 text-sm text-neutral-400">{formatDateTime(email.createdAt)} • {userNameMap[email.createdById] || email.createdById}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
