"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { QrCode } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import QRCode from "qrcode.react"
import type { Echipament } from "@/lib/firebase/firestore"

interface EquipmentQRCodeProps {
  equipment: Echipament
  clientName: string
  locationName: string
}

export function EquipmentQRCode({ equipment, clientName, locationName }: EquipmentQRCodeProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Create QR code data
  const qrData = JSON.stringify({
    id: equipment.id,
    cod: equipment.cod,
    nume: equipment.nume,
    model: equipment.model,
    serie: equipment.serie,
    client: clientName,
    locatie: locationName,
  })

  // Function to handle QR code button click
  const handleQRButtonClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent the click from affecting parent components
    e.stopPropagation()
    e.preventDefault()
    setIsOpen(true)
  }

  // Function to handle dialog close
  const handleDialogClose = () => {
    setIsOpen(false)
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={handleQRButtonClick} className="h-8 w-8">
        <QrCode className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cod QR pentru echipament</DialogTitle>
            <DialogDescription>
              Scanați acest cod QR pentru a accesa rapid informațiile despre echipament.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-md">
              <QRCode value={qrData} size={200} />
            </div>
            <div className="mt-4 text-center">
              <p className="font-medium">{equipment.nume}</p>
              <p className="text-sm text-muted-foreground">Cod: {equipment.cod}</p>
              {equipment.model && <p className="text-sm text-muted-foreground">Model: {equipment.model}</p>}
              {equipment.serie && <p className="text-sm text-muted-foreground">Serie: {equipment.serie}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
