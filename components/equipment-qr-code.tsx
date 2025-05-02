"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Printer } from "lucide-react"
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

  // Înlocuiește funcția handlePrint cu această versiune îmbunătățită
  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert("Popup-urile sunt blocate. Vă rugăm să permiteți popup-urile pentru această pagină.")
      return
    }

    const qrCodeElement = document.getElementById("equipment-qr-code")
    if (!qrCodeElement) return

    // Obținem SVG-ul QR code
    const svgElement = qrCodeElement.querySelector("svg")
    if (!svgElement) return

    // Clonăm SVG-ul pentru a-l putea modifica
    const svgClone = svgElement.cloneNode(true) as SVGElement
    svgClone.setAttribute("width", "200")
    svgClone.setAttribute("height", "200")

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code Echipament - ${equipment.nume}</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              text-align: center;
            }
            .qr-container {
              margin: 20px auto;
              max-width: 400px;
              border: 1px solid #ccc;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .qr-code {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: center;
              margin: 20px 0;
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
            .title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .subtitle {
              font-size: 14px;
              color: #666;
              margin-bottom: 20px;
            }
            @media print {
              .no-print {
                display: none;
              }
              body {
                padding: 0;
              }
              .qr-container {
                border: none;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <div class="title">Echipament: ${equipment.nume}</div>
            <div class="subtitle">Cod: ${equipment.cod}</div>
          <div class="qr-code">
            ${svgClone.outerHTML}
          </div>
          <div class="equipment-info">
            <p><strong>Client:</strong> ${clientName}</p>
            <p><strong>Locație:</strong> ${locationName}</p>
            ${equipment.model ? `<p><strong>Model:</strong> ${equipment.model}</p>` : ""}
            ${equipment.serie ? `<p><strong>Serie:</strong> ${equipment.serie}</p>` : ""}
          </div>
          <button class="no-print" onclick="window.print();return false;" style="margin-top:20px;padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;">Printează</button>
        </div>
      </body>
    </html>
  `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
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
              <QRCodeSVG value={qrData} size={200} level="H" includeMargin={true} />
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
