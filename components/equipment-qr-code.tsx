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

  // Înlocuiește funcția handleDownload cu această versiune îmbunătățită
  const handleDownload = () => {
    const qrCodeElement = document.getElementById("equipment-qr-code")
    if (!qrCodeElement) return

    // Creăm un canvas temporar pentru a genera imaginea
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return

    // Setăm dimensiunile canvas-ului
    const size = 300
    canvas.width = size
    canvas.height = size + 80 // Extra spațiu pentru text

    // Desenăm fundalul alb
    context.fillStyle = "#FFFFFF"
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Obținem SVG-ul QR code
    const svgElement = qrCodeElement.querySelector("svg")
    if (!svgElement) return

    // Convertim SVG în imagine
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const img = new Image()
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))

    img.onload = () => {
      // Desenăm QR code-ul pe canvas
      context.drawImage(img, 50, 20, 200, 200)

      // Adăugăm informații despre echipament
      context.fillStyle = "#000000"
      context.font = "bold 14px Arial"
      context.textAlign = "center"
      context.fillText(equipment.nume, size / 2, size + 30)

      context.font = "12px Arial"
      context.fillText(`Cod: ${equipment.cod}`, size / 2, size + 50)

      // Convertim canvas în imagine și descărcăm
      const url = canvas.toDataURL("image/png")
      const link = document.createElement("a")
      link.href = url
      link.download = `qr-echipament-${equipment.cod}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Înlocuiește funcția handleShare cu această versiune îmbunătățită
  const handleShare = async () => {
    try {
      // Verificăm dacă API-ul Web Share este disponibil
      if (!navigator.share) {
        // Fallback pentru browsere care nu suportă Web Share API
        const tempInput = document.createElement("input")
        const qrData = JSON.stringify({
          type: "equipment",
          code: equipment.cod,
          id: equipment.id,
          name: equipment.nume,
          client: clientName,
          location: locationName,
        })

        tempInput.value = `Echipament: ${equipment.nume}\nCod: ${equipment.cod}\nClient: ${clientName}\nLocație: ${locationName}`
        document.body.appendChild(tempInput)
        tempInput.select()
        document.execCommand("copy")
        document.body.removeChild(tempInput)
        alert(
          "Informațiile despre echipament au fost copiate în clipboard. API-ul de partajare nu este disponibil în acest browser.",
        )
        return
      }

      // Generăm imaginea pentru partajare
      const qrCodeElement = document.getElementById("equipment-qr-code")
      if (!qrCodeElement) return

      // Creăm un canvas temporar
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) return

      // Setăm dimensiunile canvas-ului
      const size = 300
      canvas.width = size
      canvas.height = size + 80

      // Desenăm fundalul alb
      context.fillStyle = "#FFFFFF"
      context.fillRect(0, 0, canvas.width, canvas.height)

      // Obținem SVG-ul QR code
      const svgElement = qrCodeElement.querySelector("svg")
      if (!svgElement) return

      // Convertim SVG în imagine
      const svgData = new XMLSerializer().serializeToString(svgElement)
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))

      await new Promise((resolve) => {
        img.onload = resolve
      })

      // Desenăm QR code-ul pe canvas
      context.drawImage(img, 50, 20, 200, 200)

      // Adăugăm informații despre echipament
      context.fillStyle = "#000000"
      context.font = "bold 14px Arial"
      context.textAlign = "center"
      context.fillText(equipment.nume, size / 2, size + 30)

      context.font = "12px Arial"
      context.fillText(`Cod: ${equipment.cod}`, size / 2, size + 50)

      // Convertim canvas în blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
        }, "image/png")
      })

      // Creăm fișierul pentru partajare
      const file = new File([blob], `qr-echipament-${equipment.cod}.png`, { type: "image/png" })

      // Partajăm
      await navigator.share({
        title: `QR Code Echipament - ${equipment.nume}`,
        text: `QR Code pentru echipamentul ${equipment.nume} (cod: ${equipment.cod})`,
        files: [file],
      })
    } catch (error) {
      console.error("Eroare la partajare:", error)

      // Fallback în caz de eroare
      try {
        await navigator.share({
          title: `Echipament - ${equipment.nume}`,
          text: `Echipament: ${equipment.nume}\nCod: ${equipment.cod}\nClient: ${clientName}\nLocație: ${locationName}`,
        })
      } catch (fallbackError) {
        console.error("Eroare la partajarea fallback:", fallbackError)
        alert("Nu s-a putut partaja QR code-ul. Încercați să folosiți butonul de descărcare.")
      }
    }
  }

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
