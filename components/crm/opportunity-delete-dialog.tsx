"use client"

import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export type OpportunityDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "single" | "bulk"
  label?: string
  bulkCount?: number
  busy?: boolean
  onConfirm: () => void | Promise<void>
}

export function OpportunityDeleteAlertDialog({
  open,
  onOpenChange,
  mode,
  label,
  bulkCount = 0,
  busy = false,
  onConfirm,
}: OpportunityDeleteDialogProps) {
  const title = mode === "bulk" ? "Ștergere oportunități selectate" : "Ștergere oportunitate"
  const description =
    mode === "bulk"
      ? `Sigur vrei să ștergi definitiv ${bulkCount} oportunități? Acțiunea nu poate fi anulată și va elimina sarcinile, ofertele și fișierele asociate.`
      : `Sigur vrei să ștergi definitiv oportunitatea${label ? ` „${label}"` : ""}? Acțiunea nu poate fi anulată și va elimina sarcinile, ofertele și fișierele asociate.`

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Anulează</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void onConfirm()
            }}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Se șterge…
              </>
            ) : (
              "Șterge definitiv"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}