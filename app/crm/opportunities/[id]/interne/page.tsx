"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { CheckCheck, Send } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { confirmCrmInternalNote, createCrmInternalNote, listCrmInternalNotes } from "@/lib/crm/tasks"
import { CRM_INTERNAL_NOTE_STATUS_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmInternalNote } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

export default function OpportunityInternePage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const canOverrideConfirm = userData?.role === "admin" || userData?.role === "dispecer"

  const [toUserId, setToUserId] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmingNoteId, setConfirmingNoteId] = useState<string | null>(null)
  const [confirmationDrafts, setConfirmationDrafts] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [rows, setRows] = useState<CrmInternalNote[]>([])

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

  const load = async () => {
    if (!opportunity || !user?.uid) return

    setLoading(true)
    try {
      const [internalNoteRows, userRows] = await Promise.all([
        listCrmInternalNotes({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
      ])

      setRows(internalNoteRows)
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  if (!opportunity) {
    return <Panel title="Interne" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Interne"
      subtitle="Note interne adresate unui coleg sau adminului, cu confirmare și răspuns scurt."
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-4 shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-[240px_1fr]">
            <div className="grid gap-1">
              <Label>Destinatar</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Selectează colegul" />
                </SelectTrigger>
                <SelectContent>
                  {recipientOptions.map((row) => (
                    <SelectItem key={row.uid} value={row.uid}>
                      {row.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <Label>Mesaj intern</Label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[112px] text-sm"
                placeholder="Scrie nota internă sau întrebarea pentru colegul vizat."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-10 gap-2 text-sm"
              disabled={saving}
              onClick={async () => {
                if (!user?.uid || !toUserId || !message.trim()) {
                  toast({
                    title: "Date incomplete",
                    description: "Selectează destinatarul și completează mesajul intern.",
                    variant: "destructive",
                  })
                  return
                }

                setSaving(true)
                try {
                  await createCrmInternalNote({
                    opportunityId,
                    fromUserId: user.uid,
                    toUserId,
                    message,
                    createdById: user.uid,
                  })

                  setMessage("")
                  setToUserId("")
                  await load()
                  toast({
                    title: "Notă internă trimisă",
                    description: "Mesajul a fost trimis și așteaptă confirmarea destinatarului.",
                  })
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Send className="h-4 w-4" />
              {saving ? "Se trimite..." : "Trimite nota internă"}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă notele interne...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există note interne pe această oportunitate.</p>
        ) : (
          <div className="space-y-3 pb-1">
            {rows.map((row) => {
              const isOwn = row.fromUserId === user?.uid
              const canConfirm =
                row.status === "PENDING" &&
                !!user?.uid &&
                (row.toUserId === user.uid || canOverrideConfirm)
              const confirmationDraft = confirmationDrafts[row.id] || ""

              return (
                <div key={row.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "w-full max-w-3xl rounded-2xl border p-4 shadow-sm shadow-black/[0.02]",
                      isOwn ? "border-blue-200 bg-blue-50/80" : "border-neutral-200 bg-white"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {userNameMap[row.fromUserId] || row.fromUserId}
                          <span className="font-normal text-neutral-500"> către </span>
                          {userNameMap[row.toUserId] || row.toUserId}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">{formatDateTime(row.createdAt)}</p>
                      </div>
                      <SubtleBadge tone={row.status === "CONFIRMED" ? "success" : "warning"}>
                        {CRM_INTERNAL_NOTE_STATUS_LABELS[row.status]}
                      </SubtleBadge>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{row.message}</p>

                    {row.status === "CONFIRMED" ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                          <CheckCheck className="h-4 w-4" />
                          Confirmat de {userNameMap[row.confirmedById || ""] || row.confirmedById || "destinatar"}
                        </div>
                        <p className="mt-1 text-sm text-emerald-700">{formatDateTime(row.confirmedAt)}</p>
                        {row.confirmationMessage ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">{row.confirmationMessage}</p>
                        ) : (
                          <p className="mt-2 text-sm text-emerald-800">Fără mesaj suplimentar de confirmare.</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm text-amber-900">
                          În așteptarea confirmării de la {userNameMap[row.toUserId] || row.toUserId}.
                        </p>

                        {canConfirm ? (
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-1">
                              <Label htmlFor={`confirm-${row.id}`}>Mesaj de confirmare</Label>
                              <Textarea
                                id={`confirm-${row.id}`}
                                value={confirmationDraft}
                                onChange={(event) =>
                                  setConfirmationDrafts((current) => ({
                                    ...current,
                                    [row.id]: event.target.value,
                                  }))
                                }
                                className="min-h-[88px] bg-white text-sm"
                                placeholder="Ex: Am văzut, revin mâine cu răspunsul complet."
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                className="h-9 text-sm"
                                disabled={confirmingNoteId === row.id}
                                onClick={async () => {
                                  if (!user?.uid) return

                                  setConfirmingNoteId(row.id)
                                  try {
                                    await confirmCrmInternalNote({
                                      noteId: row.id,
                                      actorId: user.uid,
                                      confirmationMessage: confirmationDraft,
                                      canOverrideRecipient: canOverrideConfirm,
                                    })
                                    setConfirmationDrafts((current) => ({
                                      ...current,
                                      [row.id]: "",
                                    }))
                                    await load()
                                    toast({
                                      title: "Notă confirmată",
                                      description: "Confirmarea a fost înregistrată în conversația internă.",
                                    })
                                  } catch (error) {
                                    toast({
                                      title: "Confirmare eșuată",
                                      description: error instanceof Error ? error.message : "Nu s-a putut confirma nota internă.",
                                      variant: "destructive",
                                    })
                                  } finally {
                                    setConfirmingNoteId(null)
                                  }
                                }}
                              >
                                {confirmingNoteId === row.id ? "Se confirmă..." : "Confirmă și răspunde"}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}
