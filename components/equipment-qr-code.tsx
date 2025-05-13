"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Printer, QrCode } from "lucide-react"
import type { Echipament } from "@/lib/firebase/firestore"

/**
 * Componentă mai compactă pentru generarea şi tipărirea QR‐code‑ului unui echipament.
 * Lăţime buton ≈ 32 px (doar icon) sau ≈ 90 px (cu text).
 */
export interface EquipmentQRCodeProps {
  equipment: Echipament
  clientName: string
  locationName: string
  /** Dacă true, afişează şi textul „Generează QR". */
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Obținem URL-ul complet al noului logo
  useEffect(() => {
    // Folosim URL-ul absolut al logo-ului, inclusiv domeniul
    const fullLogoUrl = new URL("/nrglogob.png", window.location.origin).href
    setLogoUrl(fullLogoUrl)

    // Preîncărcăm imaginea pentru a verifica dacă este accesibilă
    const img = new Image()
    img.onload = () => {
      console.log("Logo încărcat cu succes:", fullLogoUrl)
    }
    img.onerror = () => {
      console.error("Eroare la încărcarea logo-ului:", fullLogoUrl)
      setLogoUrl(null)
    }
    img.src = fullLogoUrl
  }, [])

  const qrData = JSON.stringify({
    type: "equipment",
    code: equipment.cod,
    id: equipment.id,
    name: equipment.nume,
    client: clientName,
    location: locationName,
  })

  // Modificăm funcția handlePrint pentru a include noul logo

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert("Popup‑urile sunt blocate. Vă rugăm să permiteți popup‑urile pentru această pagină.")
      return
    }

    const qrElem = document.getElementById("equipment-qr-code")
    if (!qrElem) return

    const svgElem = qrElem.querySelector("svg")
    if (!svgElem) return

    // Ajustăm dimensiunea QR code-ului
    const svgClone = svgElem.cloneNode(true) as SVGElement
    svgClone.setAttribute("width", "100")
    svgClone.setAttribute("height", "100")

    // Generăm HTML-ul cu noul logo
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="NRG Logo" class="logo" />`
      : `<div class="logo-placeholder">NRG</div>` // Placeholder în caz că logo-ul nu se încarcă

    // Adăugăm un script pentru a încărca logo-ul din nou în fereastra de printare
    const reloadLogoScript = logoUrl
      ? `
      // Reîncărcăm logo-ul în fereastra de printare
      const logoImg = document.querySelector('.logo');
      if (logoImg) {
        logoImg.onload = function() {
          console.log('Logo încărcat cu succes în fereastra de printare');
        };
        logoImg.onerror = function() {
          console.error('Eroare la încărcarea logo-ului în fereastra de printare');
          logoImg.style.display = 'none';
          document.querySelector('.logo-placeholder').style.display = 'flex';
        };
      }
    `
      : ""

    const html = `<!DOCTYPE html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <title>QR Code Echipament – ${equipment.nume}</title>
    <style>
      @page {
        size: 60mm 45mm;
        margin: 0;
      }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 2mm;
        width: 56mm;
        height: 41mm;
        box-sizing: border-box;
        overflow: hidden;
      }
      .header {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        margin-bottom: 2mm;
      }
      .logo, .logo-placeholder {
        height: 8mm;
        max-width: 20mm;
        object-fit: contain;
        margin-right: 2mm;
      }
      .logo-placeholder {
        display: none;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 8pt;
        width: 15mm;
        background-color: #f0f0f0;
        border-radius: 2px;
      }
      .company-name {
        font-size: 9pt;
        font-weight: bold;
      }
      .content {
        display: flex;
        width: 100%;
        height: calc(100% - 10mm);
      }
      .qr-code {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 2mm;
      }
      .equipment-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        font-size: 8pt;
        font-weight: bold;
      }
      .equipment-info p {
        margin: 1.5mm 0;
      }
      @media print {
        .no-print { display: none }
        html, body {
          width: 60mm;
          height: 45mm;
        }
      }
    </style>
  </head>
  <body>
    <div class="header">
      ${logoHtml}
      <div class="logo-placeholder">NRG</div>
      <div class="company-name">NRG Access Systems SRL</div>
    </div>
    <div class="content">
      <div class="qr-code">${svgClone.outerHTML}</div>
      <div class="equipment-info">
        <p>Client: ${clientName}</p>
        <p>Locație: ${locationName}</p>
        <p>Cod: ${equipment.cod}</p>
      </div>
    </div>
    <button class="no-print" onclick="window.print()" style="margin-top:1mm;padding:1mm 2mm;font-size:7pt;">Printează</button>
    <script>
      // Auto-print după încărcare
      window.onload = function() {
        ${reloadLogoScript}
        // Delay scurt pentru a permite încărcarea completă
        setTimeout(function() {
          window.print();
        }, 1000);
      };
    </script>
  </body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Add event handler to stop propagation
  const handleQRButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setOpen(true)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleQRButtonClick}
        className={`shrink-0 ${className ?? ""}`.trim()}
        title={showLabel ? undefined : "Generează QR"}
        type="button" // Explicitly set type to button to prevent form submission
      >
        <QrCode className={showLabel ? "h-4 w-4 mr-1" : "h-4 w-4"} />
        {showLabel && "Generează QR"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code pentru echipament</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center p-4">
            <div id="equipment-qr-code" className="border p-4 rounded-lg bg-white">
              <QRCodeSVG value={qrData} size={200} level="H" includeMargin />
            </div>
            <div className="mt-4 text-center">
              <p className="font-medium">{equipment.nume}</p>
              <p className="text-sm text-gray-500">Cod: {equipment.cod}</p>
            </div>
          </div>

          <DialogFooter className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handlePrint} type="button">
              <Printer className="mr-2 h-4 w-4" />
              Printează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
