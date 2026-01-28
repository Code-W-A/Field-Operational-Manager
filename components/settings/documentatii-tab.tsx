"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import {
  createDocumentatiiFolder,
  createDocumentatiiSubfolder,
  deleteDocumentatiiFile,
  deleteDocumentatiiFolder,
  deleteDocumentatiiSubfolder,
  renameDocumentatiiFile,
  renameDocumentatiiFolder,
  renameDocumentatiiSubfolder,
  subscribeDocumentatiiFiles,
  subscribeDocumentatiiFolders,
  subscribeDocumentatiiSubfolders,
  uploadDocumentatiiFiles,
  type DocumentatiiFile,
  type DocumentatiiFolder,
  type DocumentatiiSubfolder,
} from "@/lib/firebase/documentatii"
import { Folder, FileText, Plus, Pencil, Trash2, Upload, ArrowLeft, ChevronRight } from "lucide-react"
import { formatUiDate } from "@/lib/utils/time-format"

type NameDialogMode = "create-folder" | "rename-folder" | "create-subfolder" | "rename-subfolder" | "rename-file"

export function DocumentatiiTab() {
  const { userData } = useAuth()
  const isAdmin = userData?.role === "admin"
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [folders, setFolders] = useState<DocumentatiiFolder[]>([])
  const [subfolders, setSubfolders] = useState<DocumentatiiSubfolder[]>([])
  const [files, setFiles] = useState<DocumentatiiFile[]>([])
  const [selectedSubfolderId, setSelectedSubfolderId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameDialogMode, setNameDialogMode] = useState<NameDialogMode>("create-folder")
  const [nameInput, setNameInput] = useState("")
  const [targetId, setTargetId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const folderId = String(searchParams.get("folderId") || "")
  const activeFolder = useMemo(() => folders.find((f) => f.id === folderId) || null, [folders, folderId])
  const activeSubfolder = useMemo(
    () => subfolders.find((sf) => sf.id === selectedSubfolderId) || null,
    [subfolders, selectedSubfolderId]
  )

  useEffect(() => {
    const unsub = subscribeDocumentatiiFolders(setFolders)
    return () => unsub()
  }, [])

  useEffect(() => {
    setSelectedSubfolderId(null)
  }, [folderId])

  useEffect(() => {
    if (!folderId) {
      setSubfolders([])
      setFiles([])
      setSelectedSubfolderId(null)
      return
    }
    const unsub = subscribeDocumentatiiSubfolders(folderId, setSubfolders)
    return () => unsub()
  }, [folderId])

  useEffect(() => {
    if (!folderId) return
    const unsub = subscribeDocumentatiiFiles(folderId, selectedSubfolderId, setFiles)
    return () => unsub()
  }, [folderId, selectedSubfolderId])

  const updateQuery = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(next).forEach(([key, val]) => {
      if (val === null || val === "") params.delete(key)
      else params.set(key, val)
    })
    router.replace(`/dashboard/setari?${params.toString()}`)
  }

  const openNameDialog = (mode: NameDialogMode, initial = "", id?: string) => {
    setNameDialogMode(mode)
    setNameInput(initial)
    setTargetId(id || null)
    setNameDialogOpen(true)
  }

  const handleNameConfirm = async () => {
    const value = nameInput.trim()
    if (!value) return
    try {
      if (nameDialogMode === "create-folder") {
        await createDocumentatiiFolder(value, userData?.displayName || userData?.email || "Admin")
        toast({ title: "Creat", description: "Dosarul a fost creat." })
      } else if (nameDialogMode === "rename-folder" && targetId) {
        await renameDocumentatiiFolder(targetId, value)
        toast({ title: "Actualizat", description: "Dosarul a fost redenumit." })
      } else if (nameDialogMode === "create-subfolder" && folderId) {
        await createDocumentatiiSubfolder(folderId, value, userData?.displayName || userData?.email || "Admin")
        toast({ title: "Creat", description: "Subdosarul a fost creat." })
      } else if (nameDialogMode === "rename-subfolder" && targetId) {
        await renameDocumentatiiSubfolder(targetId, value)
        toast({ title: "Actualizat", description: "Subdosarul a fost redenumit." })
      } else if (nameDialogMode === "rename-file" && targetId) {
        await renameDocumentatiiFile(targetId, value)
        toast({ title: "Actualizat", description: "Fișierul a fost redenumit." })
      }
      setNameDialogOpen(false)
      setNameInput("")
      setTargetId(null)
    } catch (e) {
      toast({ title: "Eroare", description: "Nu s-a putut salva modificarea.", variant: "destructive" })
    }
  }

  const handleDeleteFolder = async (id: string, name?: string) => {
    if (!window.confirm(`Ștergeți dosarul "${name || "fără nume"}" și tot conținutul lui?`)) return
    try {
      await deleteDocumentatiiFolder(id)
      if (folderId === id) {
        updateQuery({ folderId: null })
      }
      toast({ title: "Șters", description: "Dosarul a fost șters." })
    } catch {
      toast({ title: "Eroare", description: "Nu s-a putut șterge dosarul.", variant: "destructive" })
    }
  }

  const handleDeleteSubfolder = async (id: string, name?: string) => {
    if (!folderId) return
    if (!window.confirm(`Ștergeți subdosarul "${name || "fără nume"}" și tot conținutul lui?`)) return
    try {
      await deleteDocumentatiiSubfolder(folderId, id)
      if (selectedSubfolderId === id) setSelectedSubfolderId(null)
      toast({ title: "Șters", description: "Subdosarul a fost șters." })
    } catch {
      toast({ title: "Eroare", description: "Nu s-a putut șterge subdosarul.", variant: "destructive" })
    }
  }

  const handleDeleteFile = async (file: DocumentatiiFile) => {
    if (!window.confirm(`Ștergeți fișierul "${file.name}"?`)) return
    try {
      await deleteDocumentatiiFile(file.id, file.storagePath)
      toast({ title: "Șters", description: "Fișierul a fost șters." })
    } catch {
      toast({ title: "Eroare", description: "Nu s-a putut șterge fișierul.", variant: "destructive" })
    }
  }

  const handleUpload = async (filesToUpload: FileList | null) => {
    if (!folderId || !filesToUpload?.length) return
    setUploading(true)
    try {
      const list = Array.from(filesToUpload)
      await uploadDocumentatiiFiles(folderId, selectedSubfolderId, list, userData?.displayName || userData?.email || "Admin")
      toast({ title: "Încărcat", description: "Fișierele au fost încărcate." })
    } catch (e) {
      toast({ title: "Eroare", description: "Nu s-a putut încărca documentația.", variant: "destructive" })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documentații</CardTitle>
          <CardDescription>Acces restricționat</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Această secțiune este disponibilă doar pentru administratori.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documentații</CardTitle>
          <CardDescription>Vizualizare tip file browser pentru dosare și fișiere.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          {activeFolder ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={() => updateQuery({ folderId: null })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Înapoi
              </Button>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Documentații</span>
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  className="font-medium text-foreground hover:underline"
                  onClick={() => setSelectedSubfolderId(null)}
                >
                  {activeFolder.name}
                </button>
                {activeSubfolder && (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-medium text-foreground">{activeSubfolder.name}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Dosare disponibile</div>
          )}
          {!activeFolder && (
            <Button onClick={() => openNameDialog("create-folder")} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Dosar nou
            </Button>
          )}
          {activeFolder && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => openNameDialog("create-subfolder")}>
                <Plus className="h-4 w-4 mr-2" /> Subdosar
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" /> Adaugă fișier
              </Button>
              <Button variant="outline" size="sm" onClick={() => openNameDialog("rename-folder", activeFolder.name, activeFolder.id)}>
                <Pencil className="h-4 w-4 mr-2" /> Redenumește
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDeleteFolder(activeFolder.id, activeFolder.name)}>
                <Trash2 className="h-4 w-4 mr-2" /> Șterge
              </Button>
              {uploading && <span className="text-sm text-muted-foreground">Se încarcă...</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {!activeFolder && (
        <Card>
          <CardHeader>
            <CardTitle>Browser</CardTitle>
            <CardDescription>Click pe un dosar pentru a naviga.</CardDescription>
          </CardHeader>
          <CardContent>
            {folders.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nu există dosare.</div>
            ) : (
              <ul className="space-y-2">
                {folders.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
                      onClick={() => updateQuery({ folderId: f.id })}
                    >
                      <Folder className="h-4 w-4" />
                      {f.name}
                    </button>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openNameDialog("rename-folder", f.name, f.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteFolder(f.id, f.name)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {activeFolder && (
        <Card>
          <CardHeader>
            <CardTitle>Browser</CardTitle>
            <CardDescription>
              {activeSubfolder ? "Fișierele din subdosar." : "Subdosare și fișiere în dosar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSubfolder && (
              <Button variant="outline" size="sm" onClick={() => setSelectedSubfolderId(null)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Înapoi la dosar
              </Button>
            )}
            {!activeSubfolder && subfolders.length === 0 && files.length === 0 && (
              <div className="text-sm text-muted-foreground">Nu există subdosare sau fișiere.</div>
            )}
            <ul className="space-y-2">
              {!activeSubfolder &&
                subfolders.map((sf) => (
                  <li key={sf.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
                      onClick={() => setSelectedSubfolderId(sf.id)}
                    >
                      <Folder className="h-4 w-4" />
                      {sf.name}
                    </button>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openNameDialog("rename-subfolder", sf.name, sf.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteSubfolder(sf.id, sf.name)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </li>
                ))}
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <a href={f.downloadUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm truncate">
                      <FileText className="h-4 w-4 inline mr-1" />
                      {f.name}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {f.size ? `${Math.ceil(f.size / 1024)} KB` : ""}{" "}
                      {f.uploadedAt ? `• ${formatUiDate(f.uploadedAt?.toDate?.() || new Date(f.uploadedAt))}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openNameDialog("rename-file", f.name, f.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteFile(f)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {activeSubfolder && files.length === 0 && (
              <div className="text-sm text-muted-foreground">Nu există fișiere în acest subdosar.</div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {nameDialogMode === "create-folder" && "Dosar nou"}
              {nameDialogMode === "rename-folder" && "Redenumește dosar"}
              {nameDialogMode === "create-subfolder" && "Creează subdosar"}
              {nameDialogMode === "rename-subfolder" && "Redenumește subdosar"}
              {nameDialogMode === "rename-file" && "Redenumește fișier"}
            </DialogTitle>
            <DialogDescription>Introduceți numele.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-name">Nume</Label>
            <Input id="doc-name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>Anulează</Button>
            <Button onClick={handleNameConfirm} disabled={!nameInput.trim()}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
