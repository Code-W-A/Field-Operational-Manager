"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { createCrmNote, deleteCrmNote, listCrmNotes } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"

export default function OpportunityNotesPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [content, setContent] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("GENERAL")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [notes, setNotes] = useState<Array<{ id: string; content: string; createdById: string; visibility: string; createdAt?: unknown }>>([])
  const [loading, setLoading] = useState(true)

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
      const [noteRows, userRows] = await Promise.all([
        listCrmNotes({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
      ])

      setNotes(noteRows)
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
    return <Panel title="Note"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Note"
      subtitle={
        isTechnician
          ? "Vizualizare read-only: notele vizibile în oportunitate."
          : "CRUD note cu visibility picker (General / Particular / Personalizat)"
      }
    >
      {!isTechnician ? (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="grid gap-2">
            <Label htmlFor="note-content">Notă nouă</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[90px] text-xs"
              placeholder="Scrie nota..."
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
                <SelectTrigger className="h-8 text-xs">
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

          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={async () => {
                if (!content.trim() || !user?.uid) return
                await createCrmNote({
                  opportunityId,
                  content,
                  createdById: user.uid,
                  visibility,
                  visibleToUserIds,
                })
                setContent("")
                setVisibility("GENERAL")
                setVisibleToUserIds([])
                await load()
              }}
            >
              Adaugă notă
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-xs text-neutral-500">Se încarcă notele...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-neutral-500">Nu există note vizibile.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-500">{formatDateTime(note.createdAt)}</p>
                <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[note.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
              </div>
              <p className="text-xs text-neutral-700 whitespace-pre-wrap">{note.content}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-neutral-400">de {userNameMap[note.createdById] || note.createdById}</p>
                {!isTechnician ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-rose-600"
                    onClick={async () => {
                      await deleteCrmNote(note.id, user?.uid || "")
                      await load()
                    }}
                  >
                    Șterge
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
