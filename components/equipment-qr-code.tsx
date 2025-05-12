"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Printer, QrCode } from "lucide-react"
import type { Echipament } from "@/lib/firebase/firestore"

/**
 * Componentă mai compactă pentru generarea şi tipărirea QR‐code‑ului unui echipament.
 * Lăţime buton ≈ 32 px (doar icon) sau ≈ 90 px (cu text).
 */
export interface EquipmentQRCodeProps {
  equipment: Echipament
  clientName: string
  locationName: string
  /** Dacă true, afişează şi textul „Generează QR”. */
  showLabel?: boolean
  /** Clase Tailwind suplimentare pentru butonul declanşator. */
  className?: string
}

export function EquipmentQRCode({
  equipment,
  clientName,
  locationName,
  showLabel = false,
  className,
}: EquipmentQRCodeProps) {
  const [open, setOpen] = useState(false)

  const qrData = JSON.stringify({
    type: "equipment",
    code: equipment.cod,
    id: equipment.id,
    name: equipment.nume,
    client: clientName,
    location: locationName,
  })

  /**
   * Deschide o fereastră nouă cu QR‐code‐ul şi detaliile, pregătită de print.
   * Păstrează implementarea existentă pentru compatibilitate.
   */
  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert(
        "Popup‑urile sunt blocate. Vă rugăm să permiteți popup‑urile pentru această pagină."
      )
      return
    }

    const qrElem = document.getElementById("equipment-qr-code")
    if (!qrElem) return

    const svgElem = qrElem.querySelector("svg")
    if (!svgElem) return

    const svgClone = svgElem.cloneNode(true) as SVGElement
    svgClone.setAttribute("width", "200")
    svgClone.setAttribute("height", "200")

    const html = `<!DOCTYPE html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <title>QR Code Echipament – ${equipment.nume}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
      .qr-container { margin: 0 auto; max-width: 400px; padding: 20px; }
      .qr-code { margin: 20px 0; }
      .equipment-info { text-align: left; border-top: 1px solid #ccc; padding-top: 10px; }
      .equipment-info p { margin: 4px 0; }
      @media print { .no-print { display: none } }
    </style>
  </head>
  <body>
    <div class="qr-container">
      <h2>Echipament: ${equipment.nume}</h2>
      <h3>Cod: ${equipment.cod}</h3>
      <div class="qr-code">${svgClone.outerHTML}</div>
      <div class="equipment-info">
        <p><strong>Client:</strong> ${clientName}</p>
        <p><strong>Locație:</strong> ${locationName}</p>
        ${equipment.model ? `<p><strong>Model:</strong> ${equipment.model}</p>` : ""}
        ${equipment.serie ? `<p><strong>Serie:</strong> ${equipment.serie}</p>` : ""}
      </div>
      <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:8px 16px;">Printează</button>
    </div>
  </body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={`shrink-0 ${className ?? ""}`.trim()}
        title={showLabel ? undefined : "Generează QR"}
      >
        <QrCode className={showLabel ? "h-4 w-4 mr-1" : "h-4 w-4"} />
        {showLabel && "Generează QR"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code pentru echipament</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center p-4">
            <div
              id="equipment-qr-code"
              className="border p-4 rounded-lg bg-white"
            >
              <QRCodeSVG value={qrData} size={200} level="H" includeMargin />
            </div>
            <div className="mt-4 text-center">
              <p className="font-medium">{equipment.nume}</p>
              <p className="text-sm text-gray-500">Cod: {equipment.cod}</p>
            </div>
          </div>

          <DialogFooter className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Printează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
