"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Upload, FileText, Download, Trash2, AlertCircle, Check } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface DocumentUploadProps {
  lucrareId: string
  lucrare: any // Tipul complet al lucrării
  onLucrareUpdate: (updatedLucrare: any) => void
}

export function DocumentUpload({ lucrareId, lucrare, onLucrareUpdate }: DocumentUploadProps) {
  const { userData } = useAuth()
  const [isUploading, setIsUploading] = useState<{ factura: boolean; oferta: boolean }>({
    factura: false,
    oferta: false,
  })
  const facturaInputRef = useRef<HTMLInputElement>(null)
  const ofertaInputRef = useRef<HTMLInputElement>(null)

  // Verificăm permisiunile (doar admin și dispecer)
  const hasPermission = userData?.role === "admin" || userData?.role === "dispecer"
  
  // Verificăm dacă lucrarea a fost preluată (condiție pentru upload)
  const isWorkPickedUp = lucrare.preluatDispecer === true
  
  // Verificăm dacă oferta este necesară (condiție pentru upload ofertă)
  const needsOffer = lucrare.necesitaOferta === true

  // Funcție pentru a obține data curentă în format YYYY-MM-DD pentru UX mai bun
  const getCurrentDate = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // State pentru câmpurile de editare (pre-populate cu data curentă pentru UX mai bun)
  const [formData, setFormData] = useState({
    numarFactura: "",
    dataFactura: getCurrentDate(),  // Pre-populat cu data curentă
    numarOferta: "",
    dataOferta: getCurrentDate()    // Pre-populat cu data curentă
  })

  // Funcție pentru validarea fișierului (fără restricții)
  const validateFile = (file: File): string | null => {
    // Eliminăm toate restricțiile - orice tip de fișier este acceptat
    return null
  }

  // Funcție pentru upload factură
  const handleFacturaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Verificăm că sunt completate câmpurile obligatorii
    if (!formData.numarFactura.trim()) {
      toast({
        title: "Câmp lipsă",
        description: "Vă rugăm să completați numărul facturii.",
        variant: "destructive",
      })
      return
    }

    if (!formData.dataFactura.trim()) {
      toast({
        title: "Câmp lipsă", 
        description: "Vă rugăm să completați data facturii.",
        variant: "destructive",
      })
      return
    }

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
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.displayName || userData?.email || "Unknown",
        numarFactura: formData.numarFactura.trim(),
        dataFactura: formData.dataFactura.trim(),
      }

      console.log("📄 SALVEZ factură în Firestore cu date:", documentData)
      await updateLucrare(lucrareId, { facturaDocument: documentData })

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, facturaDocument: documentData }
      onLucrareUpdate(updatedLucrare)

      // Resetăm formul
      setFormData(prev => ({ ...prev, numarFactura: "", dataFactura: getCurrentDate() }))

      toast({
        title: "Factură încărcată",
        description: `Documentul ${fileName} cu numărul ${documentData.numarFactura} din data ${documentData.dataFactura} a fost încărcat cu succes.`,
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

  // Funcție pentru upload ofertă  
  const handleOfertaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Verificăm că sunt completate câmpurile obligatorii
    if (!formData.numarOferta.trim()) {
      toast({
        title: "Câmp lipsă",
        description: "Vă rugăm să completați numărul ofertei.",
        variant: "destructive",
      })
      return
    }

    if (!formData.dataOferta.trim()) {
      toast({
        title: "Câmp lipsă", 
        description: "Vă rugăm să completați data ofertei.",
        variant: "destructive",
      })
      return
    }

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
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.displayName || userData?.email || "Unknown",
        numarOferta: formData.numarOferta.trim(),
        dataOferta: formData.dataOferta.trim(),
      }

      console.log("📄 SALVEZ ofertă în Firestore cu date:", documentData)
      await updateLucrare(lucrareId, { ofertaDocument: documentData })

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, ofertaDocument: documentData }
      onLucrareUpdate(updatedLucrare)

      // Resetăm formul
      setFormData(prev => ({ ...prev, numarOferta: "", dataOferta: getCurrentDate() }))

      toast({
        title: "Ofertă încărcată",
        description: `Documentul ${fileName} cu numărul ${documentData.numarOferta} din data ${documentData.dataOferta} a fost încărcat cu succes.`,
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
      // Extragem path-ul din URL pentru ștergere din Storage
      const pathMatch = document.url.match(/lucrari%2F[^?]+/)
      if (pathMatch) {
        const storagePath = decodeURIComponent(pathMatch[0].replace(/%2F/g, '/'))
        await deleteFile(storagePath)
      }

      // Actualizăm Firestore
      const updateData = type === 'factura' 
        ? { facturaDocument: undefined }
        : { ofertaDocument: undefined }
      
      await updateLucrare(lucrareId, updateData)

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
          Încărcare documente pentru factură și ofertă (orice tip de fișier)
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

          {lucrare.facturaDocument ? (
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
                    onClick={() => window.open(lucrare.facturaDocument.url, '_blank')}
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
                <p><strong>Număr:</strong> {lucrare.facturaDocument.numarFactura}</p>
                <p><strong>Data:</strong> {lucrare.facturaDocument.dataFactura}</p>
                <p>Încărcată pe {new Date(lucrare.facturaDocument.uploadedAt).toLocaleDateString('ro-RO')} de {lucrare.facturaDocument.uploadedBy}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Câmpuri pentru datele facturii */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-700">Numărul facturii *</Label>
                  <Input
                    type="text"
                    value={formData.numarFactura}
                    onChange={(e) => setFormData(prev => ({ ...prev, numarFactura: e.target.value }))}
                    placeholder="Ex: FACT-2024-001"
                    className="mt-1"
                    disabled={!isWorkPickedUp || isUploading.factura}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Data facturii *</Label>
                  <Input
                    type="date"
                    value={formData.dataFactura}
                    onChange={(e) => setFormData(prev => ({ ...prev, dataFactura: e.target.value }))}
                    className="mt-1"
                    disabled={!isWorkPickedUp || isUploading.factura}
                  />
                </div>
              </div>
              
              {/* Upload fișier */}
              <div className="space-y-2">
                <input
                  ref={facturaInputRef}
                  type="file"
                  onChange={handleFacturaUpload}
                  className="hidden"
                  disabled={!isWorkPickedUp || isUploading.factura}
                />
                <Button
                  onClick={() => facturaInputRef.current?.click()}
                  disabled={!isWorkPickedUp || isUploading.factura || !formData.numarFactura.trim() || !formData.dataFactura.trim()}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading.factura ? "Se încarcă..." : "Selectează și încarcă fișier factură"}
                </Button>
              </div>
            </div>
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

          {!needsOffer ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Încărcarea ofertei este dezactivată. Tehnicianul nu a marcat că această lucrare necesită ofertă.
              </AlertDescription>
            </Alert>
          ) : lucrare.ofertaDocument ? (
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
                    onClick={() => window.open(lucrare.ofertaDocument.url, '_blank')}
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
                <p><strong>Număr ofertă:</strong> {lucrare.ofertaDocument.numarOferta}</p>
                {lucrare.ofertaDocument.dataOferta ? (
                  <p><strong>Data ofertă:</strong> {new Date(lucrare.ofertaDocument.dataOferta).toLocaleDateString('ro-RO')}</p>
                ) : (
                  <p className="text-orange-600"><strong>Data ofertă:</strong> Nu este disponibilă (document vechi)</p>
                )}
                <p>Încărcată pe {new Date(lucrare.ofertaDocument.uploadedAt).toLocaleDateString('ro-RO')} de {lucrare.ofertaDocument.uploadedBy}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Câmpuri pentru datele ofertei */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-700">Numărul ofertei *</Label>
                  <Input
                    type="text"
                    value={formData.numarOferta}
                    onChange={(e) => setFormData(prev => ({ ...prev, numarOferta: e.target.value }))}
                    placeholder="Ex: OF-2024-001"
                    className="mt-1"
                    disabled={!isWorkPickedUp || !needsOffer || isUploading.oferta}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Data ofertei *</Label>
                  <Input
                    type="date"
                    value={formData.dataOferta}
                    onChange={(e) => setFormData(prev => ({ ...prev, dataOferta: e.target.value }))}
                    className="mt-1"
                    disabled={!isWorkPickedUp || !needsOffer || isUploading.oferta}
                  />
                </div>
              </div>
              
              {/* Upload fișier */}
              <div className="space-y-2">
                <input
                  ref={ofertaInputRef}
                  type="file"
                  onChange={handleOfertaUpload}
                  className="hidden"
                  disabled={!isWorkPickedUp || !needsOffer || isUploading.oferta}
                />
                <Button
                  onClick={() => ofertaInputRef.current?.click()}
                  disabled={!isWorkPickedUp || !needsOffer || isUploading.oferta || !formData.numarOferta.trim() || !formData.dataOferta.trim()}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading.oferta ? "Se încarcă..." : "Selectează și încarcă fișier ofertă"}
                </Button>
              </div>
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