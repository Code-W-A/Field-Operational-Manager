"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Printer, QrCode, Share2 } from "lucide-react"
import type { Echipament } from "@/lib/firebase/firestore"
import { useToast } from "@/hooks/use-toast"

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
  const { toast } = useToast()

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
   * Calculează font-size-uri pentru valorile de după ":" în funcție de lungimea specifică.
   * Prefixele "Client:", "Locație:", "Cod:" rămân cu font normal (8pt).
   * Doar valorile efective (numele clientului, locația, codul) vor avea font adaptat.
   * 
   * ⚠️ IMPORTANT: Această modificare afectează DOAR printarea QR code-ului, 
   * NU afectează afișarea în dialog sau în alte părți ale aplicației!
   * 
   * QR code-ul rămâne la aceeași dimensiune (100x100px).
   */
  const calculateValueFontSizes = (clientName: string, locationName: string, equipmentCode: string) => {
    // Calculăm lungimea DOAR pentru valorile efective (fără prefixe)
    const clientValueLength = clientName.length
    const locationValueLength = locationName.length
    const codeValueLength = equipmentCode.length
    
    // Funcție helper pentru calcularea font-size-ului bazat pe lungime
    const getFontSizeForLength = (length: number): number => {
      if (length <= 15) return 8      // Font-size normal pentru texte scurte
      if (length <= 22) return 7      // Redus pentru texte medii
      if (length <= 30) return 6      // Redus semnificativ pentru texte lungi
      if (length <= 40) return 5      // Foarte redus pentru texte foarte lungi
      if (length <= 50) return 4.5    // Extrem de redus pentru texte exceptionale
      return 4                        // Minimum absolut pentru texte extreme
    }
    
    // Calculăm font-size DOAR pentru valorile de după ":"
    const clientValueFontSize = getFontSizeForLength(clientValueLength)
    const locationValueFontSize = getFontSizeForLength(locationValueLength)
    const codeValueFontSize = getFontSizeForLength(codeValueLength)
    
    console.log("📏 Analiză font-size pentru VALORILE de după ':' (prefixele rămân 8pt):", {
      clientValue: `"${clientName}" (${clientValueLength} chars) → ${clientValueFontSize}pt`,
      locationValue: `"${locationName}" (${locationValueLength} chars) → ${locationValueFontSize}pt`,
      codeValue: `"${equipmentCode}" (${codeValueLength} chars) → ${codeValueFontSize}pt`
    })
    
    // Debugging pentru valorile problematice
    const debugItems = [
      { name: "Client value", text: clientName, length: clientValueLength, fontSize: clientValueFontSize },
      { name: "Locație value", text: locationName, length: locationValueLength, fontSize: locationValueFontSize },
      { name: "Cod value", text: equipmentCode, length: codeValueLength, fontSize: codeValueFontSize }
    ]
    debugItems.forEach((item: { name: string; text: string; length: number; fontSize: number }) => {
      if (item.length > 40) {
        console.log(`🚨 ${item.name.toUpperCase()} FOARTE LUNG: "${item.text}" (${item.length} chars) → Font: ${item.fontSize}pt`)
      }
    })
    
    return {
      clientValueFontSize,
      locationValueFontSize,
      codeValueFontSize
    }
  }

  // Funcție pentru convertirea SVG-ului QR code în PNG
  const convertQRToImage = async (): Promise<Blob | null> => {
    const qrElem = document.getElementById("equipment-qr-code")
    if (!qrElem) return null

    const svgElem = qrElem.querySelector("svg")
    if (!svgElem) return null

    const svgData = new XMLSerializer().serializeToString(svgElem)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx?.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          resolve(blob)
        }, "image/png")
      }
      img.onerror = () => resolve(null)
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))
    })
  }

  // Funcție pentru share
  const handleShare = async () => {
    try {
      const blob = await convertQRToImage()
      
      if (!blob) {
        toast({
          title: "Eroare",
          description: "Nu s-a putut genera imaginea QR code",
          variant: "destructive",
        })
        return
      }

      const fileName = `QR_${equipment.cod}_${clientName.replace(/\s+/g, "_")}.png`
      const file = new File([blob], fileName, { type: "image/png" })

      // Verificăm dacă dispozitivul suportă Web Share API cu fișiere
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `QR Code - ${equipment.nume}`,
          text: `QR Code pentru echipament: ${equipment.cod}\nClient: ${clientName}\nLocație: ${locationName}`,
          files: [file],
        })
        
        toast({
          title: "Succes",
          description: "QR code partajat cu succes",
        })
      } else {
        // Fallback: Descărcăm imaginea
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        toast({
          title: "Descărcat",
          description: "QR code descărcat cu succes",
        })
      }
    } catch (error) {
      console.error("Eroare la share:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut partaja QR code-ul",
        variant: "destructive",
      })
    }
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
    svgClone.style.display = "block"
    svgClone.style.margin = "0"
    svgClone.style.padding = "0"

    // Calculăm font-size-uri pentru valorile de după ":"
    const fontSizes = calculateValueFontSizes(clientName, locationName, equipment.cod)

    console.log("🖨️ Generez QR print cu font-size-uri pentru valorile de după ':':", {
      clientValue: fontSizes.clientValueFontSize + "pt",
      locationValue: fontSizes.locationValueFontSize + "pt", 
      codeValue: fontSizes.codeValueFontSize + "pt"
    })

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
<html>
  <head>
    <meta charset="utf-8" />
    <title>QR Code</title>
    <style>
      @page { size: 60mm 45mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { 
        width: 60mm; height: 45mm; overflow: hidden; 
        font-family: Arial, sans-serif; 
      }
      body { padding: 2mm; }
      .header { 
        display: flex; align-items: center; justify-content: center; 
        margin-bottom: 2mm; height: 6mm; 
      }
      .logo { height: 6mm; max-width: 15mm; margin-right: 2mm; }
      .logo-placeholder { 
        display: none; width: 15mm; height: 6mm; background: #f0f0f0; 
        align-items: center; justify-content: center; font-size: 8pt; font-weight: bold; 
      }
      .company-name { font-size: 9pt; font-weight: bold; }
      .content { display: flex; height: 31mm; }
      .qr-code { margin-right: 2mm; }
      .equipment-info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .equipment-info p { margin: 0; line-height: 1.0; font-weight: bold; }
      @media print { 
        .no-print { display: none !important; }
        @page { size: 60mm 45mm; margin: 0; }
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
        <p><span style="font-size: 8pt;">Client: </span><span style="font-size: ${fontSizes.clientValueFontSize}pt;">${clientName}</span></p>
        <p><span style="font-size: 8pt;">Locație: </span><span style="font-size: ${fontSizes.locationValueFontSize}pt;">${locationName}</span></p>
        <p><span style="font-size: 8pt;">Cod: </span><span style="font-size: ${fontSizes.codeValueFontSize}pt;">${equipment.cod}</span></p>
      </div>
    </div>

    <script>
      window.onload = function() {
        ${reloadLogoScript}
        setTimeout(() => window.print(), 500);
      };
      window.onafterprint = () => window.close();
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

          <DialogFooter className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} type="button">
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
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
