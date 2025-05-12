"use client"

import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface NavigationPromptDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
}

export function NavigationPromptDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = "Confirmă navigarea",
  description = "Ai modificări nesalvate. Ești sigur că vrei să părăsești această pagină? Toate modificările vor fi pierdute.",
  confirmText = "Părăsește pagina",
  cancelText = "Rămâi pe pagină",
}: NavigationPromptDialogProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(isOpen)
  }, [isOpen])

  const handleConfirm = () => {
    setOpen(false)
    onConfirm()
  }

  const handleCancel = () => {
    setOpen(false)
    onCancel()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen)
        if (!newOpen) {
          onCancel()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{confirmText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
