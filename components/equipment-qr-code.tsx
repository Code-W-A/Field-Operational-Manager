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
  /** Dacă true, generează QR cu format simplu (doar codul) pentru scanare mai ușoară */
  useSimpleFormat?: boolean
}

export function EquipmentQRCode({
  equipment,
  clientName,
  locationName,
  showLabel = false,
  className,
  useSimpleFormat = false, // Default la false pentru compatibilitate
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

  // Generează datele pentru QR code în funcție de format
  const qrData = useSimpleFormat 
    ? equipment.cod // Format simplu: doar codul echipamentului
    : JSON.stringify({ // Format JSON (compatibilitate cu cele vechi)
        type: "equipment",
        code: equipment.cod,
        id: equipment.id,
        name: equipment.nume,
        client: clientName,
        location: locationName,
      })

  console.log(`Generare QR ${useSimpleFormat ? 'format simplu' : 'format JSON'} pentru echipament:`, equipment.cod)

  // Modificăm funcția handlePrint pentru a include noul logo

  /**
   * Calculează font-size-ul optim pentru textele echipamentului în funcție de lungimea conținutului
   * pentru a preveni împingerea QR code-ului pe a doua pagină la printare.
   * 
   * ⚠️ IMPORTANT: Această modificare afectează DOAR printarea QR code-ului, 
   * NU afectează afișarea în dialog sau în alte părți ale aplicației!
   * 
   * QR code-ul rămâne la aceeași dimensiune (100x100px).
   */
  const calculateOptimalFontSize = (clientName: string, locationName: string, equipmentCode: string): number => {
    // Calculăm lungimea textului pentru fiecare linie (inclusiv prefixe)
    const clientText = `Client: ${clientName}`
    const locationText = `Locație: ${locationName}`
    const codeText = `Cod: ${equipmentCode}`
    
    // Lungimea maximă dintre cele 3 linii (factorul limitant pentru încadrarea în pagină)
    const maxLineLength = Math.max(clientText.length, locationText.length, codeText.length)
    
    console.log("📏 Analiză lungime text pentru QR print:", {
      clientText: `"${clientText}" (${clientText.length} chars)`,
      locationText: `"${locationText}" (${locationText.length} chars)`,
      codeText: `"${codeText}" (${codeText.length} chars)`,
      maxLineLength: maxLineLength
    })
    
    // Algoritmul de dimensionare AGRESIVĂ (în puncte tipografice):
    // Scădem font-size-ul mai devreme pentru a forța încadrarea în maxim 2 rânduri
    let fontSize: number
    if (maxLineLength <= 15) {
      fontSize = 8    // Font-size normal pentru texte foarte scurte
    } else if (maxLineLength <= 22) {
      fontSize = 7    // Redus pentru texte medii
    } else if (maxLineLength <= 30) {
      fontSize = 6    // Redus semnificativ pentru texte lungi
    } else if (maxLineLength <= 40) {
      fontSize = 5    // Foarte redus pentru texte foarte lungi
    } else if (maxLineLength <= 50) {
      fontSize = 4.5  // Extrem de redus pentru texte exceptionale
    } else {
      fontSize = 4    // Minimum absolut pentru texte extreme (ex: "CHROM CONSTRUCTII...")
    }
    
    console.log(`📏 Font-size calculat: ${fontSize}pt pentru linia cea mai lungă: ${maxLineLength} caractere`)
    
    // Debugging specific pentru textele problematice
    if (maxLineLength > 45) {
      console.log(`🚨 TEXT FOARTE LUNG DETECTAT: ${maxLineLength} caractere → Font-size extrem de redus: ${fontSize}pt`)
      console.log(`🚨 Ar trebui să se încadreze în maxim 2 rânduri la printare`)
    }
    return fontSize
  }

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

    // Ajustăm dimensiunea QR code-ului (rămâne constantă)
    const svgClone = svgElem.cloneNode(true) as SVGElement
    svgClone.setAttribute("width", "100")
    svgClone.setAttribute("height", "100")

    // Calculăm font-size-ul optim pentru textele echipamentului
    const optimalFontSize = calculateOptimalFontSize(clientName, locationName, equipment.cod)

    console.log("🖨️ Generez QR print cu font-size dinamic:", optimalFontSize + "pt")

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
        height: 6mm;
        max-width: 15mm;
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
        font-size: ${optimalFontSize}pt;
        font-weight: bold;
      }
      .equipment-info p {
        margin: ${optimalFontSize <= 5 ? '0.5mm' : '1mm'} 0;
        line-height: ${optimalFontSize <= 5 ? '1.1' : '1.2'};
        word-wrap: break-word;
        overflow-wrap: break-word;
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

    // Închidem automat dialogul QR code după printare
    setTimeout(() => {
      setOpen(false)
    }, 500)
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
            <DialogTitle>
              QR Code pentru echipament {useSimpleFormat && <span className="text-sm text-green-600">(format simplu)</span>}
            </DialogTitle>
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
