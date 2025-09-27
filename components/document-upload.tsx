"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { updateLucrare } from "@/lib/firebase/firestore"
import { deleteField } from "firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Upload, FileText, Download, Trash2, AlertCircle, Check, Eye } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface DocumentUploadProps {
  lucrareId: string
  lucrare: any // Tipul complet al lucrării
  onLucrareUpdate: (updatedLucrare: any) => void
  hideOfertaUpload?: boolean
}

export function DocumentUpload({ lucrareId, lucrare, onLucrareUpdate, hideOfertaUpload = false }: DocumentUploadProps) {
  const { userData } = useAuth()
  const [isUploading, setIsUploading] = useState<{ factura: boolean; oferta: boolean }>({
    factura: false,
    oferta: false,
  })
  
  // Verificăm dacă lucrarea este arhivată
  const isArchived = lucrare?.statusLucrare === "Arhivată"
  const facturaInputRef = useRef<HTMLInputElement>(null)
  const ofertaInputRef = useRef<HTMLInputElement>(null)

  // Verificăm permisiunile (doar admin și dispecer)
  const hasPermission = userData?.role === "admin" || userData?.role === "dispecer"
  
  // Verificăm dacă lucrarea a fost preluată (condiție pentru upload)
  const isWorkPickedUp = lucrare.preluatDispecer === true
  
  // Verificăm dacă oferta este necesară (condiție pentru upload ofertă)
  const needsOffer = lucrare.necesitaOferta === true
  
  // Noi condiții pentru afișarea upload-urilor
  const shouldShowFacturaUpload = lucrare.statusFacturare === "Facturat"
  const shouldShowOfertaUpload = lucrare.statusOferta === "OFERTAT"

  // Eliminăm câmpurile manuale pentru număr și dată; data/ora încărcării se salvează automat
  const formatRoDateTime = (isoString: string) => {
    const d = new Date(isoString)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`
  }
  const formatRoDate = (isoString: string) => {
    const d = new Date(isoString)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  }
  const formatRoTime = (isoString: string) => {
    const d = new Date(isoString)
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${min}`
  }

  // Helper: forțează descărcarea unui fișier
  const triggerDownload = (url: string, suggestedName?: string) => {
    try {
      const a = document.createElement('a')
      a.href = url
      if (suggestedName) a.download = suggestedName
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      window.open(url, '_blank')
    }
  }

  // Funcție pentru validarea fișierului (fără restricții)
  const validateFile = (file: File): string | null => {
    // Eliminăm toate restricțiile - orice tip de fișier este acceptat
    return null
  }

  // Funcție pentru upload factură (fără câmpuri manuale)
  const handleFacturaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(prev => ({ ...prev, factura: true }))

    try {
      // Încărcăm în Firebase Storage (acceptăm orice tip de fișier)
      const fileExtension = file.name.split('.').pop() || 'file'
      const storagePath = `lucrari/${lucrareId}/factura_${Date.now()}.${fileExtension}`
      const { url, fileName } = await uploadFile(file, storagePath)

      // Actualizăm Firestore
      const documentData = {
        url,
        fileName,
        uploadedAt: new Date().toISOString(), // include data și ora
        uploadedBy: userData?.displayName || userData?.email || "Unknown",
      }

      console.log("📄 SALVEZ factură în Firestore cu date:", documentData)
      await updateLucrare(lucrareId, { facturaDocument: documentData as any } as any)

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, facturaDocument: documentData }
      onLucrareUpdate(updatedLucrare)

      toast({
        title: "Factură încărcată",
        description: `Documentul ${fileName} a fost încărcat cu succes la ${new Date(documentData.uploadedAt).toLocaleString('ro-RO')}.`,
      })
    } catch (error) {
      console.error("Eroare la încărcarea facturii:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut încărca documentul.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(prev => ({ ...prev, factura: false }))
      if (facturaInputRef.current) {
        facturaInputRef.current.value = ""
      }
    }
  }

  // Funcție pentru upload ofertă (fără câmpuri manuale)
  const handleOfertaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(prev => ({ ...prev, oferta: true }))

    try {
      // Încărcăm în Firebase Storage (acceptăm orice tip de fișier)
      const fileExtension = file.name.split('.').pop() || 'file'
      const storagePath = `lucrari/${lucrareId}/oferta_${Date.now()}.${fileExtension}`
      const { url, fileName } = await uploadFile(file, storagePath)

      // Actualizăm Firestore
      const documentData = {
        url,
        fileName,
        uploadedAt: new Date().toISOString(), // include data și ora
        uploadedBy: userData?.displayName || userData?.email || "Unknown",
      }

      console.log("📄 SALVEZ ofertă în Firestore cu date:", documentData)
      await updateLucrare(lucrareId, { ofertaDocument: documentData as any } as any)

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, ofertaDocument: documentData }
      onLucrareUpdate(updatedLucrare)

      toast({
        title: "Ofertă încărcată",
        description: `Documentul ${fileName} a fost încărcat cu succes la ${new Date(documentData.uploadedAt).toLocaleString('ro-RO')}.`,
      })
    } catch (error) {
      console.error("Eroare la încărcarea ofertei:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut încărca documentul.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(prev => ({ ...prev, oferta: false }))
      if (ofertaInputRef.current) {
        ofertaInputRef.current.value = ""
      }
    }
  }

  // Funcție pentru ștergerea documentelor
  const handleDeleteDocument = async (type: 'factura' | 'oferta') => {
    const document = type === 'factura' ? lucrare.facturaDocument : lucrare.ofertaDocument
    if (!document) return

    if (!window.confirm(`Sigur doriți să ștergeți ${type === 'factura' ? 'factura' : 'oferta'}?`)) {
      return
    }

    try {
      // Actualizăm Firestore mai întâi (înainte de ștergerea din Storage)
      const updateData = type === 'factura' 
        ? { facturaDocument: deleteField() as any }
        : { ofertaDocument: deleteField() as any }
      
      await updateLucrare(lucrareId, updateData)

      // Apoi ștergem din Storage (cu verificare că fișierul există)
      const pathMatch = document.url.match(/lucrari%2F[^?]+/)
      if (pathMatch) {
        const storagePath = decodeURIComponent(pathMatch[0].replace(/%2F/g, '/'))
        try {
          await deleteFile(storagePath)
        } catch (storageError) {
          // Log warning dar nu oprește procesul - fișierul poate fi deja șters
          console.warn(`Fișierul nu a putut fi șters din Storage (poate fi deja șters):`, storageError)
        }
      }

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare }
      if (type === 'factura') {
        delete updatedLucrare.facturaDocument
      } else {
        delete updatedLucrare.ofertaDocument
      }
      onLucrareUpdate(updatedLucrare)

      toast({
        title: "Document șters",
        description: `${type === 'factura' ? 'Factura' : 'Oferta'} a fost ștearsă cu succes.`,
      })
    } catch (error) {
      console.error(`Eroare la ștergerea ${type}:`, error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut șterge documentul.",
        variant: "destructive",
      })
    }
  }

  // Dacă utilizatorul nu are permisiuni, nu afișăm nimic
  if (!hasPermission) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documente PDF
        </CardTitle>
        <CardDescription>
          {isArchived 
            ? "Documentele pot fi doar vizualizate și descărcate pentru lucrările arhivate"
            : "Încărcare documente pentru factură și ofertă (orice tip de fișier)"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Verificăm dacă lucrarea a fost preluată */}
        {!isWorkPickedUp && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Încărcarea documentelor este disponibilă doar după preluarea lucrării de către dispecer.
            </AlertDescription>
          </Alert>
        )}

        {/* Secțiunea pentru factură */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Factură</h4>
            <Badge variant={lucrare.facturaDocument ? "default" : "secondary"}>
              {lucrare.facturaDocument ? "Încărcată" : "Neîncărcată"}
            </Badge>
          </div>

          {/* Vizualizarea documentului existent - mereu vizibilă */}
          {lucrare.facturaDocument && (
            <div className="p-3 border rounded-lg bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{lucrare.facturaDocument.fileName}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=factura&url=${encodeURIComponent(lucrare.facturaDocument.url)}`, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Vizualizează
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=factura&url=${encodeURIComponent(lucrare.facturaDocument.url)}`, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descarcă
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteDocument('factura')}
                    disabled={!isWorkPickedUp}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Șterge
                  </Button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <p>Încărcată pe {formatRoDate(lucrare.facturaDocument.uploadedAt)} la {formatRoTime(lucrare.facturaDocument.uploadedAt)}</p>
              </div>
            </div>
          )}

          {/* Secțiunea de upload - condiționată de statusFacturare */}
          {!lucrare.facturaDocument && shouldShowFacturaUpload && (
            <div className="space-y-3">
              {/* Upload fișier */}
              <div className="space-y-2">
                <input
                  ref={facturaInputRef}
                  type="file"
                  onChange={handleFacturaUpload}
                  className="hidden"
                  disabled={!isWorkPickedUp || isUploading.factura || isArchived}
                />
                <Button
                  onClick={() => facturaInputRef.current?.click()}
                  disabled={!isWorkPickedUp || isUploading.factura || isArchived}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isArchived ? "Indisponibil pentru lucrări arhivate" : (isUploading.factura ? "Se încarcă..." : "Selectează și încarcă fișier factură")}
                </Button>
              </div>
            </div>
          )}

          {/* Mesaj când upload-ul nu este disponibil */}
          {!lucrare.facturaDocument && !shouldShowFacturaUpload && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Încărcarea facturii este disponibilă doar când statusul facturării este setat pe "Facturat".
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Secțiunea pentru ofertă */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Ofertă</h4>
            <Badge variant={lucrare.ofertaDocument ? "default" : "secondary"}>
              {lucrare.ofertaDocument ? "Încărcată" : "Neîncărcată"}
            </Badge>
          </div>

          {/* Vizualizarea documentului existent - mereu vizibilă */}
          {lucrare.ofertaDocument && (
            <div className="p-3 border rounded-lg bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{lucrare.ofertaDocument.fileName}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=oferta&url=${encodeURIComponent(lucrare.ofertaDocument.url)}`, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Vizualizează
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=oferta&url=${encodeURIComponent(lucrare.ofertaDocument.url)}`, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descarcă
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteDocument('oferta')}
                    disabled={!isWorkPickedUp}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Șterge
                  </Button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <p>Încărcată pe {formatRoDate(lucrare.ofertaDocument.uploadedAt)} la {formatRoTime(lucrare.ofertaDocument.uploadedAt)}</p>
              </div>
            </div>
          )}

          {/* Secțiunea de upload - condiționată de statusOferta (ascunsă dacă hideOfertaUpload) */}
          {!hideOfertaUpload && !lucrare.ofertaDocument && shouldShowOfertaUpload && (
            <div className="space-y-3">
              {/* Upload fișier */}
              <div className="space-y-2">
                <input
                  ref={ofertaInputRef}
                  type="file"
                  onChange={handleOfertaUpload}
                  className="hidden"
                  disabled={!isWorkPickedUp || isUploading.oferta || isArchived}
                />
                <Button
                  onClick={() => ofertaInputRef.current?.click()}
                  disabled={!isWorkPickedUp || isUploading.oferta || isArchived}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isArchived ? "Indisponibil pentru lucrări arhivate" : (isUploading.oferta ? "Se încarcă..." : "Selectează și încarcă fișier ofertă")}
                </Button>
              </div>
            </div>
          )}

          {/* Mesaje când upload-ul nu este disponibil (ascuns dacă hideOfertaUpload) */}
          {!hideOfertaUpload && !lucrare.ofertaDocument && !shouldShowOfertaUpload && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {!needsOffer 
                  ? "Încărcarea ofertei este dezactivată. Tehnicianul nu a marcat că această lucrare necesită ofertă."
                  : "Încărcarea ofertei este disponibilă doar când statusul ofertei este setat pe \"OFERTAT\"."
                }
              </AlertDescription>
            </Alert>
          )}

          {/* Notă informativă când upload-ul ofertei este ascuns */}
          {hideOfertaUpload && !lucrare.ofertaDocument && (
            <div className="text-xs text-muted-foreground">
              Oferta se generează automat după acceptarea clientului în portal.
            </div>
          )}
        </div>

        {/* Informații ajutătoare */}
        {/* <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
          <p><strong>Condiții pentru încărcare:</strong></p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Lucrarea trebuie să fie preluată de dispecer</li>
            <li>Pentru ofertă: tehnicianul trebuie să marcheze "Necesită ofertă"</li>
            <li>Orice tip de fișier este acceptat (fără restricții de dimensiune)</li>
            <li>Completarea numărului și datei este obligatorie</li>
            <li>Documentele pot fi înlocuite prin încărcarea unor fișiere noi</li>
          </ul>
        </div> */}
      </CardContent>
    </Card>
  )
} 