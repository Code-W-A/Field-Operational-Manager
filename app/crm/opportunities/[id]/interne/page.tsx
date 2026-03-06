"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { confirmCrmInternalHandoff, createCrmInternalHandoff, listCrmInternalHandoffs } from "@/lib/crm/tasks"
import { CRM_INTERNAL_HANDOFF_STATUS_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"

export default function OpportunityInternePage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"
  const canOverrideConfirm = userData?.role === "admin" || userData?.role === "dispecer"

  const [toUserId, setToUserId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("RON")
  const [handedOverAt, setHandedOverAt] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [rows, setRows] = useState<
    Array<{
      id: string
      fromUserId: string
      toUserId: string
      amount: number
      currency: string
      handedOverAt?: unknown
      note: string
      status: "IN_ASTEPTARE" | "CONFIRMAT"
      createdAt?: unknown
      confirmedAt?: unknown
      confirmedById?: string
    }>
  >([])

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
      const [handoffs, userRows] = await Promise.all([
        listCrmInternalHandoffs({ opportunityId }),
        listCrmUsers(),
      ])
      setRows(handoffs as typeof rows)
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
    return <Panel title="Interne"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  if (opportunity.opportunityType !== "INTERNE") {
    return (
      <Panel title="Interne">
        <p className="text-xs text-neutral-500">
          Tabul Interne este disponibil doar pentru oportunități de tipul "Interne".
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Interne"
      subtitle="Predare internă valori între colegi, cu confirmare de primire înregistrată."
    >
      {!isTechnician ? (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>Predat către</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selectează coleg" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((row) => row.uid !== user?.uid)
                      .map((row) => (
                        <SelectItem key={row.uid} value={row.uid}>
                          {row.displayName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Data predării</Label>
                <Input
                  type="datetime-local"
                  value={handedOverAt}
                  onChange={(event) => setHandedOverAt(event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
              <div className="grid gap-1">
                <Label>Suma</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Ex: 2500"
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label>Monedă</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Monedă" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RON">RON</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Notă</Label>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-[84px] text-xs"
                placeholder="Ex: Azi 05.03.2026 am predat 2500 lei lui Alin Ionescu."
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={saving}
              onClick={async () => {
                if (!user?.uid || !toUserId || !amount || Number(amount) <= 0 || !handedOverAt || !note.trim()) {
                  toast({
                    title: "Date incomplete",
                    description: "Completează toate câmpurile obligatorii.",
                    variant: "destructive",
                  })
                  return
                }

                setSaving(true)
                try {
                  await createCrmInternalHandoff({
                    opportunityId,
                    fromUserId: user.uid,
                    toUserId,
                    amount: Number(amount),
                    currency,
                    handedOverAt: new Date(handedOverAt),
                    note,
                    createdById: user.uid,
                  })
                  setToUserId("")
                  setAmount("")
                  setCurrency("RON")
                  setHandedOverAt("")
                  setNote("")
                  await load()
                  toast({
                    title: "Notă înregistrată",
                    description: "Predarea internă a fost trimisă pentru confirmare.",
                  })
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? "Se salvează..." : "Înregistrează predarea"}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-xs text-neutral-500">Se încarcă înregistrările...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-neutral-500">Nu există înregistrări interne.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const canConfirm = row.status === "IN_ASTEPTARE" && !!user?.uid && (row.toUserId === user.uid || canOverrideConfirm)
            return (
              <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-neutral-500">{formatDateTime(row.createdAt)}</p>
                  <SubtleBadge tone={row.status === "CONFIRMAT" ? "success" : "warning"}>
                    {CRM_INTERNAL_HANDOFF_STATUS_LABELS[row.status]}
                  </SubtleBadge>
                </div>

                <p className="text-sm text-neutral-800">
                  <span className="font-medium">{userNameMap[row.fromUserId] || row.fromUserId}</span>
                  {" a predat "}
                  <span className="font-semibold">
                    {row.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}
                  </span>
                  {" către "}
                  <span className="font-medium">{userNameMap[row.toUserId] || row.toUserId}</span>
                  {row.handedOverAt ? ` (${formatDateTime(row.handedOverAt)}).` : "."}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600">{row.note}</p>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-neutral-400">
                    Confirmat de: {row.confirmedById ? (userNameMap[row.confirmedById] || row.confirmedById) : "-"}
                    {row.confirmedAt ? ` • ${formatDateTime(row.confirmedAt)}` : ""}
                  </p>
                  {canConfirm ? (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        try {
                          await confirmCrmInternalHandoff({
                            handoffId: row.id,
                            actorId: user?.uid || "",
                            canOverrideRecipient: canOverrideConfirm,
                          })
                          await load()
                          toast({
                            title: "Primire confirmată",
                            description: "Înregistrarea a fost confirmată cu succes.",
                          })
                        } catch (error) {
                          toast({
                            title: "Confirmare eșuată",
                            description: error instanceof Error ? error.message : "Nu s-a putut confirma primirea.",
                            variant: "destructive",
                          })
                        }
                      }}
                    >
                      Confirm primirea
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
