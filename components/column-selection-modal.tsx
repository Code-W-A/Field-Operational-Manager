"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLockBody } from "@/hooks/use-lock-body"

export interface ColumnOption {
  id: string
  label: string
  isVisible: boolean
}

interface ColumnSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  columns: ColumnOption[]
  onToggleColumn: (columnId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function ColumnSelectionModal({
  isOpen,
  onClose,
  title,
  columns,
  onToggleColumn,
  onSelectAll,
  onDeselectAll,
}: ColumnSelectionModalProps) {
  const [mounted, setMounted] = useState(false)

  // Use our custom hook to manage body scroll locking
  useLockBody(isOpen)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Ensure proper cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Force any remaining overlay elements to be removed
      const overlays = document.querySelectorAll("[data-radix-dialog-overlay]")
      overlays.forEach((overlay) => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay)
        }
      })
    }
  }, [])

  if (!mounted) return null

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          // Ensure we properly clean up when dialog is closed
          setTimeout(() => onClose(), 10)
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[425px] max-h-[85vh] overflow-hidden flex flex-col"
        onEscapeKeyDown={onClose}
        onInteractOutside={onClose}
        onPointerDownOutside={onClose}
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{title}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 rounded-md p-0">
            <X className="h-4 w-4" />
            <span className="sr-only">Închide</span>
          </Button>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            Selectează toate
          </Button>
          <Button variant="outline" size="sm" onClick={onDeselectAll}>
            Deselectează toate
          </Button>
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {columns.map((column) => (
              <div key={column.id} className="flex items-center space-x-2">
                <Checkbox id={column.id} checked={column.isVisible} onCheckedChange={() => onToggleColumn(column.id)} />
                <Label htmlFor={column.id} className="flex-1 cursor-pointer">
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Închide</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
