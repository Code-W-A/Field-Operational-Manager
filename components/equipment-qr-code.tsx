"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Printer, Download, Share2 } from "lucide-react"
import type { Echipament } from "@/lib/firebase/firestore"

interface EquipmentQRCodeProps {
  equipment: Echipament
  clientName: string
  locationName: string
}

export function EquipmentQRCode({ equipment, clientName, locationName }: EquipmentQRCodeProps) {
  const [showQRDialog, setShowQRDialog] = useState(false)

  // Creăm datele pentru QR code
  const qrData = JSON.stringify({
    type: "equipment",
    code: equipment.cod,
    id: equipment.id,
    name: equipment.nume,
    client: clientName,
    location: locationName,
  })

  // Funcție pentru printarea QR code-ului
  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const qrCodeElement = document.getElementById("equipment-qr-code")
    if (!qrCodeElement) return

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code Echipament - ${equipment.nume}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              text-align: center;
            }
            .qr-container {
              margin: 20px auto;
              max-width: 400px;
            }
            .qr-code {
              width: 100%;
              height: auto;
            }
            .equipment-info {
              margin-top: 20px;
              text-align: left;
              border-top: 1px solid #ccc;
              padding-top: 10px;
            }
            .equipment-info p {
              margin: 5px 0;
            }
            @media print {
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h2>Echipament: ${equipment.nume}</h2>
            <div class="qr-code">
              ${qrCodeElement.outerHTML}
            </div>
            <div class="equipment-info">
              <p><strong>Cod:</strong> ${equipment.cod}</p>
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Locație:</strong> ${locationName}</p>
              ${equipment.model ? `<p><strong>Model:</strong> ${equipment.model}</p>` : ""}
              ${equipment.serie ? `<p><strong>Serie:</strong> ${equipment.serie}</p>` : ""}
            </div>
            <button class="no-print" onclick="window.print()">Printează</button>
          </div>
        </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Funcție pentru descărcarea QR code-ului ca imagine
  const handleDownload = () => {
    const canvas = document.getElementById("equipment-qr-code")?.querySelector("canvas")
    if (!canvas) return

    const url = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    link.href = url
    link.download = `qr-echipament-${equipment.cod}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Funcție pentru partajarea QR code-ului (dacă este suportat de browser)
  const handleShare = async () => {
    if (!navigator.share) {
      alert("Partajarea nu este suportată de browser-ul dvs.")
      return
    }

    try {
      const canvas = document.getElementById("equipment-qr-code")?.querySelector("canvas")
      if (!canvas) return

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
        }, "image/png")
      })

      const file = new File([blob], `qr-echipament-${equipment.cod}.png`, { type: "image/png" })

      await navigator.share({
        title: `QR Code Echipament - ${equipment.nume}`,
        text: `QR Code pentru echipamentul ${equipment.nume} (cod: ${equipment.cod})`,
        files: [file],
      })
    } catch (error) {
      console.error("Eroare la partajare:", error)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowQRDialog(true)}>
        Generează QR
      </Button>

      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code pentru echipament</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4">
            <div id="equipment-qr-code" className="border p-4 rounded-lg bg-white">
              <QRCodeSVG
                value={qrData}
                size={200}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "/nrglogo.png",
                  x: undefined,
                  y: undefined,
                  height: 24,
                  width: 24,
                  excavate: true,
                }}
              />
            </div>
            <div className="mt-4 text-center">
              <p className="font-medium">{equipment.nume}</p>
              <p className="text-sm text-gray-500">Cod: {equipment.cod}</p>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Printează
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Descarcă
            </Button>
            {navigator.share && (
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Partajează
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
