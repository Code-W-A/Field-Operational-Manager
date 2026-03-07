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
import { useToast } from "@/hooks/use-toast"
import { createCrmNote, deleteCrmNote, listCrmNotes, updateCrmNoteContent, updateCrmNoteVisibility } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmNote } from "@/lib/crm/types"

export default function OpportunityNotesPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [content, setContent] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [notes, setNotes] = useState<CrmNote[]>([])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editVisibility, setEditVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [editVisibleToUserIds, setEditVisibleToUserIds] = useState<string[]>([])
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [editingContentNoteId, setEditingContentNoteId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [savingContentNoteId, setSavingContentNoteId] = useState<string | null>(null)
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
    return <Panel title="Note" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Note"
      subtitle={
        isTechnician
          ? "Vizualizare read-only: notele vizibile în oportunitate."
          : "CRUD note cu visibility picker (General / Particular / Personalizat)"
      }
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="grid gap-2">
            <Label htmlFor="note-content">Notă nouă</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[104px] text-sm"
              placeholder="Scrie nota..."
            />

            <div className="grid gap-2 sm:grid-cols-2">
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

          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-9 text-sm"
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
                setVisibility("PRIVATE")
                setVisibleToUserIds([])
                await load()
              }}
            >
              Adaugă notă
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă notele...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există note vizibile.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-neutral-500">{formatDateTime(note.createdAt)}</p>
                  <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[note.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
                </div>
                {editingContentNoteId === note.id ? (
                  <div className="mt-1 space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      className="min-h-[104px] text-sm"
                      placeholder="Editează nota..."
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        className="h-8 text-sm"
                        disabled={savingContentNoteId === note.id || !user?.uid}
                        onClick={async () => {
                          if (!user?.uid) return
                          setSavingContentNoteId(note.id)
                          try {
                            await updateCrmNoteContent({
                              noteId: note.id,
                              actorId: user.uid,
                              content: editContent,
                            })
                            setEditingContentNoteId(null)
                            setEditContent("")
                            await load()
                            toast({
                              title: "Notă actualizată",
                              description: "Conținutul notei a fost salvat.",
                            })
                          } catch (error) {
                            toast({
                              title: "Actualizare eșuată",
                              description: error instanceof Error ? error.message : "Nu s-a putut actualiza nota.",
                              variant: "destructive",
                            })
                          } finally {
                            setSavingContentNoteId(null)
                          }
                        }}
                      >
                        {savingContentNoteId === note.id ? "Se salvează..." : "Salvează"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-sm"
                        disabled={savingContentNoteId === note.id}
                        onClick={() => {
                          setEditingContentNoteId(null)
                          setEditContent("")
                        }}
                      >
                        Anulează
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-neutral-700">{note.content}</p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-neutral-400">de {userNameMap[note.createdById] || note.createdById}</p>
                  {!isTechnician ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm"
                        onClick={() => {
                          setEditingContentNoteId(note.id)
                          setEditContent(note.content)
                          setEditingNoteId(null)
                        }}
                      >
                        Editează notă
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm"
                        onClick={() => {
                          setEditingNoteId(note.id)
                          setEditVisibility(note.visibility)
                          setEditVisibleToUserIds(note.visibleToUserIds || [])
                          setEditingContentNoteId(null)
                          setEditContent("")
                        }}
                      >
                        Edit visibility
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-sm text-rose-600"
                        onClick={async () => {
                          await deleteCrmNote(note.id, user?.uid || "")
                          await load()
                        }}
                      >
                        Șterge
                      </Button>
                    </div>
                  ) : null}
                </div>

                {!isTechnician && editingNoteId === note.id ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Select value={editVisibility} onValueChange={(value) => setEditVisibility(value as typeof editVisibility)}>
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

                    {editVisibility === "CUSTOM" ? (
                      <MultiSelect options={userOptions} selected={editVisibleToUserIds} onChange={setEditVisibleToUserIds} placeholder="Alege useri" />
                    ) : (
                      <div />
                    )}

                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        className="h-9 text-sm"
                        disabled={savingNoteId === note.id || !user?.uid}
                        onClick={async () => {
                          if (!user?.uid) return
                          setSavingNoteId(note.id)
                          try {
                            await updateCrmNoteVisibility({
                              noteId: note.id,
                              actorId: user.uid,
                              visibility: editVisibility,
                              visibleToUserIds: editVisibleToUserIds,
                            })
                            setEditingNoteId(null)
                            await load()
                            toast({
                              title: "Vizibilitate actualizată",
                              description: "Vizibilitatea notei a fost actualizată.",
                            })
                          } catch (error) {
                            toast({
                              title: "Actualizare eșuată",
                              description: error instanceof Error ? error.message : "Nu s-a putut actualiza vizibilitatea notei.",
                              variant: "destructive",
                            })
                          } finally {
                            setSavingNoteId(null)
                          }
                        }}
                      >
                        {savingNoteId === note.id ? "Se salvează..." : "Salvează"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 text-sm"
                        disabled={savingNoteId === note.id}
                        onClick={() => {
                          setEditingNoteId(null)
                          setEditVisibleToUserIds([])
                        }}
                      >
                        Anulează
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
