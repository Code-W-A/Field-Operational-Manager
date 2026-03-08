"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Download, FileText, Trash2, Upload } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { deleteCrmFile, listCrmFiles, updateCrmFileVisibility, uploadCrmFile } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import { useToast } from "@/hooks/use-toast"
import type { CrmFileAttachment } from "@/lib/crm/types"

function canPreviewInBrowser(mime: string) {
  if (!mime) return false
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  )
}

export default function OpportunityFilesPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [files, setFiles] = useState<CrmFileAttachment[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [editVisibility, setEditVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [editVisibleToUserIds, setEditVisibleToUserIds] = useState<string[]>([])
  const [savingFileId, setSavingFileId] = useState<string | null>(null)

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
      const [fileRows, userRows] = await Promise.all([
        listCrmFiles({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
      ])
      setFiles(fileRows)
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
    return <Panel title="Fișiere" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Fișiere"
      subtitle={isTechnician ? "Vizualizare read-only: fișierele vizibile în oportunitate." : "Upload MVP + listă + delete cu permisiuni"}
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 flex justify-end">
          <Button size="sm" className="h-9 text-sm" onClick={() => setIsCreateOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Încarcă fișier
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Încarcă fișier</SheetTitle>
              <SheetDescription>Alege un fișier și setează vizibilitatea.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="crm-file">Fișier</Label>
                  <input
                    id="crm-file"
                    type="file"
                    multiple
                    className="block w-full text-sm"
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                  />
                  {selectedFiles.length > 0 ? (
                    <p className="text-xs text-neutral-500">{selectedFiles.length} fișiere selectate</p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>Visibility</Label>
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
                </div>
              </div>

              {visibility === "CUSTOM" ? (
                <div className="mt-2">
                  <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Alege userii" />
                </div>
              ) : null}
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
                  disabled={selectedFiles.length === 0 || !user?.uid}
                  onClick={async () => {
                    if (selectedFiles.length === 0 || !user?.uid) return
                    let successCount = 0
                    const failed: string[] = []

                    for (const file of selectedFiles) {
                      try {
                        await uploadCrmFile({
                          opportunityId,
                          file,
                          uploadedById: user.uid,
                          visibility,
                          visibleToUserIds,
                        })
                        successCount += 1
                      } catch {
                        failed.push(file.name)
                      }
                    }

                    if (successCount > 0) {
                      toast({
                        title: "Fișiere încărcate",
                        description:
                          successCount === selectedFiles.length
                            ? `Au fost adăugate ${successCount} fișiere în oportunitate.`
                            : `Au fost adăugate ${successCount} din ${selectedFiles.length} fișiere.`,
                      })
                    }

                    if (failed.length > 0) {
                      toast({
                        title: "Unele fișiere nu au fost încărcate",
                        description: failed.length <= 2 ? failed.join(", ") : `${failed.slice(0, 2).join(", ")} +${failed.length - 2} altele`,
                        variant: "destructive",
                      })
                    }

                    setSelectedFiles([])
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

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Editează vizibilitatea fișierului</SheetTitle>
              <SheetDescription>Alege cine poate vedea fișierul.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2 sm:grid-cols-2">
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
                  <MultiSelect options={userOptions} selected={editVisibleToUserIds} onChange={setEditVisibleToUserIds} placeholder="Alege userii" />
                ) : null}
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setIsEditOpen(false)}>
                  Anulează
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-sm"
                  disabled={!editingFileId || savingFileId === editingFileId || !user?.uid}
                  onClick={async () => {
                    if (!user?.uid || !editingFileId) return
                    setSavingFileId(editingFileId)
                    try {
                      await updateCrmFileVisibility({
                        fileId: editingFileId,
                        actorId: user.uid,
                        visibility: editVisibility,
                        visibleToUserIds: editVisibleToUserIds,
                      })
                      setEditingFileId(null)
                      setIsEditOpen(false)
                      await load()
                      toast({
                        title: "Vizibilitate actualizată",
                        description: "Vizibilitatea fișierului a fost actualizată.",
                      })
                    } catch (error) {
                      toast({
                        title: "Actualizare eșuată",
                        description: error instanceof Error ? error.message : "Nu s-a putut actualiza vizibilitatea fișierului.",
                        variant: "destructive",
                      })
                    } finally {
                      setSavingFileId(null)
                    }
                  }}
                >
                  {savingFileId === editingFileId ? "Se salvează..." : "Salvează"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă fișierele...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există fișiere vizibile.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {files.map((file) => (
              <div key={file.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                      {file.mime.startsWith("image/") ? (
                        <img src={file.url} alt={file.filename} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-7 w-7 text-neutral-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {file.internalCode ? <SubtleBadge tone="neutral">{file.internalCode}</SubtleBadge> : null}
                        <p className="truncate text-base font-semibold text-neutral-900">{file.filename}</p>
                      </div>
                      <p className="mt-1 text-sm text-neutral-500">
                        {(file.size / 1024).toFixed(1)} KB • {formatDateTime(file.createdAt)} • by {userNameMap[file.uploadedById] || file.uploadedById}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[file.visibility]}</SubtleBadge>
                    {!isTechnician ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-sm"
                        onClick={() => {
                          setEditingFileId(file.id)
                          setEditVisibility(file.visibility)
                          setEditVisibleToUserIds(file.visibleToUserIds || [])
                          setIsEditOpen(true)
                        }}
                      >
                        Editează vizibilitate
                      </Button>
                    ) : null}
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                      <a href={file.url} target="_blank" rel="noreferrer" download={canPreviewInBrowser(file.mime) ? undefined : file.filename}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {!isTechnician ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-600"
                        onClick={async () => {
                          await deleteCrmFile({ fileId: file.id, actorId: user?.uid || "" })
                          await load()
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
