"use client"

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
import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"

interface UnsavedChangesDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function UnsavedChangesDialog({ open, onConfirm, onCancel }: UnsavedChangesDialogProps) {
  // Log when dialog state changes for debugging
  useEffect(() => {
    console.log("UnsavedChangesDialog open state:", open)
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-[450px]">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>Modificări nesalvate</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="py-2">
            Aveți modificări nesalvate în formular. Dacă părăsiți această pagină, toate modificările vor fi pierdute.
            <div className="mt-2 text-sm font-medium text-gray-700">Doriți să continuați?</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCancel} className="mt-0">
            Rămâneți pe pagină
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            Părăsiți fără salvare
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
