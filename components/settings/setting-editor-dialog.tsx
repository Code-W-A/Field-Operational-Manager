"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Setting } from "@/types/settings"

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
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [value, setValue] = useState<any>("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (mode === "edit" && setting) {
        setName(setting.name)
        setDescription(setting.description || "")
        setValue(setting.name)
      } else {
        // Reset for create mode
        setName("")
        setDescription("")
        setValue("")
      }
    }
  }, [open, mode, setting])

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

      if (mode === "create") {
        data.parentId = parentId
      }

      await onSave(data)
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving setting:", error)
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
            <Label>Valoare</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Introdu valoarea..."
            />
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

