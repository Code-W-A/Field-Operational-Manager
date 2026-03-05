"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Download, Trash2, Upload } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { deleteCrmFile, listCrmFiles, uploadCrmFile } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import { useToast } from "@/hooks/use-toast"
import type { CrmFileAttachment } from "@/lib/crm/types"

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

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("GENERAL")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])

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
    return <Panel title="Fișiere"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Fișiere"
      subtitle={isTechnician ? "Vizualizare read-only: fișierele vizibile în oportunitate." : "Upload MVP + listă + delete cu permisiuni"}
    >
      {!isTechnician ? (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="crm-file">Fișier</Label>
              <input
                id="crm-file"
                type="file"
                className="block w-full text-xs"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Visibility</Label>
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
            </div>
          </div>

          {visibility === "CUSTOM" ? (
            <div className="mt-2">
              <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Alege userii" />
            </div>
          ) : null}

          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!selectedFile || !user?.uid}
              onClick={async () => {
                if (!selectedFile || !user?.uid) return
                await uploadCrmFile({
                  opportunityId,
                  file: selectedFile,
                  uploadedById: user.uid,
                  visibility,
                  visibleToUserIds,
                })
                toast({
                  title: "Fișier încărcat",
                  description: `${selectedFile.name} a fost adăugat în oportunitate.`,
                })
                setSelectedFile(null)
                setVisibility("GENERAL")
                setVisibleToUserIds([])
                await load()
              }}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-xs text-neutral-500">Se încarcă fișierele...</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-neutral-500">Nu există fișiere vizibile.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{file.filename}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {(file.size / 1024).toFixed(1)} KB • {formatDateTime(file.createdAt)} • by {userNameMap[file.uploadedById] || file.uploadedById}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[file.visibility]}</SubtleBadge>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                    <a href={file.url} target="_blank" rel="noreferrer">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  {!isTechnician ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-rose-600"
                      onClick={async () => {
                        await deleteCrmFile({ fileId: file.id, actorId: user?.uid || "" })
                        await load()
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
