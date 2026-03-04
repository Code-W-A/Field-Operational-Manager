"use client"

import { useState, type ReactNode } from "react"
import { ClientForm } from "@/components/client-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

interface ClientAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode
  onClientCreated?: (client: { clientId: string; clientName: string }) => void
}

export function ClientAddDialog({ open, onOpenChange, trigger, onClientCreated }: ClientAddDialogProps) {
  const [showCloseAlert, setShowCloseAlert] = useState(false)

  const handleCloseRequest = () => {
    setShowCloseAlert(true)
  }

  const handleConfirmClose = () => {
    setShowCloseAlert(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseRequest()
            return
          }
          onOpenChange(true)
        }}
      >
        {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
        <DialogContent className="w-[calc(100%-2rem)] max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adaugă Client Nou</DialogTitle>
            <DialogDescription>Completați detaliile pentru a adăuga un client nou</DialogDescription>
          </DialogHeader>
          <ClientForm
            mode="add"
            onSuccess={() => {
              onOpenChange(false)
            }}
            onCreatedClient={(client) => {
              onClientCreated?.(client)
            }}
            onCancel={handleCloseRequest}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi
              pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setShowCloseAlert(false)} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="w-full sm:w-auto">
              Da, închide formularul
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

