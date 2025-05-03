"use client"

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface NavigationPromptDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
}

export function NavigationPromptDialog({
  open,
  onConfirm,
  onCancel,
  title = "Modificări nesalvate",
  message = "Aveți modificări nesalvate. Dacă părăsiți această pagină, modificările vor fi pierdute.",
  confirmText = "Părăsiți fără salvare",
  cancelText = "Rămâneți pe pagină",
}: NavigationPromptDialogProps) {
  console.log("NavigationPromptDialog rendered, open:", open)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="py-4">{message}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
