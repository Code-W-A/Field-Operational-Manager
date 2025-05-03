"use client"

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface DirectUnsavedChangesDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DirectUnsavedChangesDialog({ open, onConfirm, onCancel }: DirectUnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Modificări nesalvate</DialogTitle>
          </div>
        </DialogHeader>
        <div className="py-4">
          Aveți modificări nesalvate. Dacă părăsiți această pagină, modificările vor fi pierdute.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Rămâneți pe pagină
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Părăsiți fără salvare
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
