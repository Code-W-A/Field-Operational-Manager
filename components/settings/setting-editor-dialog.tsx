"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, X, FileText, Image as ImageIcon, Download } from "lucide-react"
import type { Setting } from "@/types/settings"
import { storage } from "@/lib/firebase/config"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { useToast } from "@/hooks/use-toast"

interface SettingEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  setting?: Setting | null
  parentId: string | null
  onSave: (data: any) => Promise<void>
  mode: "create" | "edit"
}

export function SettingEditorDialog({
  open,
  onOpenChange,
  setting,
  parentId,
  onSave,
  mode,
}: SettingEditorDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [value, setValue] = useState<any>("")
  const [numericValue, setNumericValue] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string>("")
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (mode === "edit" && setting) {
        setName(setting.name)
        setDescription(setting.description || "")
        setValue(setting.name)
        setNumericValue(setting.numericValue?.toString() || "")
        setImageUrl(setting.imageUrl || "")
        setDocumentUrl(setting.documentUrl || "")
        setFileName(setting.fileName || "")
      } else {
        // Reset for create mode
        setName("")
        setDescription("")
        setValue("")
        setNumericValue("")
        setImageUrl("")
        setDocumentUrl("")
        setFileName("")
      }
    }
  }, [open, mode, setting])

  const handleImageUpload = async (file: File) => {
    if (!file) return
    
    setUploading(true)
    try {
      const timestamp = Date.now()
      const storageRef = ref(storage, `settings/images/${timestamp}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setImageUrl(url)
      setFileName(file.name)
      toast({ title: "Imagine încărcată", description: "Imaginea a fost încărcată cu succes." })
    } catch (error) {
      console.error("Error uploading image:", error)
      toast({ title: "Eroare", description: "Nu s-a putut încărca imaginea.", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleDocumentUpload = async (file: File) => {
    if (!file) return
    
    setUploading(true)
    try {
      const timestamp = Date.now()
      const storageRef = ref(storage, `settings/documents/${timestamp}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setDocumentUrl(url)
      setFileName(file.name)
      toast({ title: "Document încărcat", description: "Documentul a fost încărcat cu succes." })
    } catch (error) {
      console.error("Error uploading document:", error)
      toast({ title: "Eroare", description: "Nu s-a putut încărca documentul.", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = () => {
    setImageUrl("")
    if (imageUrl === documentUrl) {
      setFileName("")
    }
  }

  const handleRemoveDocument = () => {
    setDocumentUrl("")
    if (imageUrl !== documentUrl) {
      setFileName("")
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const data: any = {
        name,
        description,
      }

      // Always variable with value = name (string)
      data.type = "variable"
      data.valueType = "string"
      data.value = name

      // Add optional fields if they exist
      if (numericValue && numericValue.trim() !== "") {
        data.numericValue = parseFloat(numericValue)
      }
      if (imageUrl) {
        data.imageUrl = imageUrl
      }
      if (documentUrl) {
        data.documentUrl = documentUrl
      }
      if (fileName) {
        data.fileName = fileName
      }

      if (mode === "create") {
        data.parentId = parentId
      }

      await onSave(data)
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving setting:", error)
      toast({ title: "Eroare", description: "Nu s-a putut salva setarea.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const renderValueEditor = () => null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {mode === "create" ? "Creare setare nou" : "Editare setare"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {mode === "create"
              ? "Definește o nouă setare. Poți organiza ierarhic prin subsetări."
              : "Modifică proprietățile setării selectate."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Valoare text (obligatorie)</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Introdu valoarea..."
            />
          </div>

          {/* Câmpuri opționale */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium mb-3 text-muted-foreground">Câmpuri suplimentare (opționale)</h3>
            
            {/* Valoare numerică */}
            <div className="space-y-2 mb-4">
              <Label>Valoare numerică</Label>
              <Input
                type="number"
                step="0.01"
                value={numericValue}
                onChange={(e) => setNumericValue(e.target.value)}
                placeholder="Ex: 100, 15.50, etc."
              />
              <p className="text-xs text-muted-foreground">Folosit pentru prețuri, cantități, procente, etc.</p>
            </div>

            {/* Upload imagine */}
            <div className="space-y-2 mb-4">
              <Label>Imagine</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
              />
              {imageUrl ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 p-2 border rounded bg-muted/30">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{fileName || "Imagine încărcată"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(imageUrl, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Se încarcă..." : "Încarcă imagine"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF până la 5MB</p>
            </div>

            {/* Upload document */}
            <div className="space-y-2">
              <Label>Document/Fișier</Label>
              <input
                ref={documentInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleDocumentUpload(file)
                }}
              />
              {documentUrl ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 p-2 border rounded bg-muted/30">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{fileName || "Document încărcat"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(documentUrl, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveDocument}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => documentInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Se încarcă..." : "Încarcă document"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PDF, DOC, XLS, etc. până la 10MB</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Anulează
          </Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {loading ? "Se salvează..." : mode === "create" ? "Creează" : "Salvează"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

