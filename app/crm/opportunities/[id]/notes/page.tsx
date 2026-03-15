"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Plus } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [notes, setNotes] = useState<CrmNote[]>([])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editVisibility, setEditVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [editVisibleToUserIds, setEditVisibleToUserIds] = useState<string[]>([])
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [isCreatingNote, setIsCreatingNote] = useState(false)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
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
    return (
      <Panel
        title="Note"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Note"
      subtitle={""}
      headerAction={
        !isTechnician ? (
          <Button
            size="sm"
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm xl:inline-flex"
            onClick={() => setIsCreateOpen(true)}
            aria-label="Adaugă notă"
          >
            <Plus className="h-4 w-4" />
            <span>Adaugă notă</span>
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
            aria-label="Adaugă notă"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Adaugă notă</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Notă nouă</SheetTitle>
              <SheetDescription>Adaugă o notă pe oportunitate.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-2">
                <Label htmlFor="note-content">Conținut</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
                  className="min-h-[160px] text-sm"
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
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-sm"
                  disabled={isCreatingNote}
                  onClick={() => setIsCreateOpen(false)}
                >
                  Anulează
                </Button>
            <Button
              size="sm"
              className="h-9 text-sm"
              disabled={isCreatingNote}
              onClick={async () => {
                if (!content.trim() || !user?.uid || isCreatingNote) return
                setIsCreatingNote(true)
                try {
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
                  setIsCreateOpen(false)
                  await load()
                } finally {
                  setIsCreatingNote(false)
                }
              }}
            >
                  {isCreatingNote ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Editează nota</SheetTitle>
              <SheetDescription>Modifică textul și vizibilitatea notei.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2">
                <Label>Conținut</Label>
                <Textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  className="min-h-[160px] text-sm"
                  placeholder="Editează nota..."
                />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
      ) : null}
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-sm"
                  onClick={() => {
                    setIsEditOpen(false)
                    setEditingNoteId(null)
                  }}
                >
                  Anulează
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-sm"
                  disabled={savingNoteId === editingNoteId || !user?.uid}
                  onClick={async () => {
                    if (!user?.uid || !editingNoteId) return
                    setSavingNoteId(editingNoteId)
                    try {
                      await updateCrmNoteContent({
                        noteId: editingNoteId,
                        actorId: user.uid,
                        content: editContent,
                      })
                      await updateCrmNoteVisibility({
                        noteId: editingNoteId,
                        actorId: user.uid,
                        visibility: editVisibility,
                        visibleToUserIds: editVisibleToUserIds,
                      })
                      setIsEditOpen(false)
                      setEditingNoteId(null)
                      await load()
                      toast({
                        title: "Notă actualizată",
                        description: "Conținutul și vizibilitatea notei au fost actualizate.",
                      })
                    } catch (error) {
                      toast({
                        title: "Actualizare eșuată",
                        description: error instanceof Error ? error.message : "Nu s-a putut actualiza nota.",
                        variant: "destructive",
                      })
                    } finally {
                      setSavingNoteId(null)
                    }
                  }}
                >
                  {savingNoteId === editingNoteId ? "Se salvează..." : "Salvează"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă notele...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există note vizibile.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-start justify-end gap-2">
                  <div className="text-right">
                    <p className="text-xs text-neutral-500">Creată la: {formatDateTime(note.createdAt)}</p>
                    <div className="mt-1">
                      <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[note.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
                    </div>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-700">{note.content}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-neutral-400">de {userNameMap[note.createdById] || note.createdById}</p>
                  {!isTechnician ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm"
                        onClick={() => {
                          setEditingNoteId(note.id)
                          setEditContent(note.content)
                          setEditVisibility(note.visibility)
                          setEditVisibleToUserIds(note.visibleToUserIds || [])
                          setIsEditOpen(true)
                        }}
                      >
                        Editează
                      </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-sm text-rose-600"
                      disabled={deletingNoteId === note.id}
                      onClick={async () => {
                        if (deletingNoteId === note.id) return
                        setDeletingNoteId(note.id)
                        try {
                        await deleteCrmNote(note.id, user?.uid || "")
                        await load()
                        } finally {
                          setDeletingNoteId(null)
                        }
                      }}
                    >
                      {deletingNoteId === note.id ? "Se șterge..." : "Șterge"}
                    </Button>
                    </div>
                  ) : null}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
