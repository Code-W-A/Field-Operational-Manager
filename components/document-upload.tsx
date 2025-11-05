"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { updateLucrare } from "@/lib/firebase/firestore"
import { deleteField } from "firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Upload, FileText, Download, Trash2, AlertCircle, Check, Eye } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { ReportGenerator } from "@/components/report-generator"
import { NoInvoiceReasonDialog } from "@/components/no-invoice-reason-dialog"

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
  const [isNoInvoiceReasonDialogOpen, setIsNoInvoiceReasonDialogOpen] = useState(false)
  const [isMotivDialogOpen, setIsMotivDialogOpen] = useState(false)
  const [motivTemp, setMotivTemp] = useState(lucrare?.motivNefacturare || "")
  
  // Verificăm dacă lucrarea este arhivată
  const isArchived = lucrare?.statusLucrare === "Arhivată"
  const facturaInputRef = useRef<HTMLInputElement>(null)
  const ofertaInputRef = useRef<HTMLInputElement>(null)
  const reportGeneratorRef = useRef<HTMLButtonElement>(null)

  // Verificăm permisiunile (doar admin și dispecer)
  const hasPermission = userData?.role === "admin" || userData?.role === "dispecer"
  
  // Verificăm dacă lucrarea a fost preluată (condiție pentru upload)
  const isWorkPickedUp = lucrare.preluatDispecer === true
  // Lucrare blocată după reintervenție
  const isLocked = Boolean(lucrare?.lockedAfterReintervention)
  
  // Verificăm dacă oferta este necesară (condiție pentru upload ofertă)
  const needsOffer = lucrare.necesitaOferta === true
  
  // Condiții pentru afișarea upload-ului: afișăm cât timp nu există o factură
  const shouldShowFacturaUpload = !lucrare.facturaDocument && !isLocked
  const shouldShowOfertaUpload = (lucrare.statusOferta === "OFERTAT") && !isLocked

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

  // Primește blob-ul PDF și forțează descărcarea cu un nume sugestiv
  const handleReportGenerate = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const fileName = `Raport_${lucrare?.nrLucrare || lucrare?.numarRaport || lucrareId}.pdf`
    triggerDownload(url, fileName)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
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
      await updateLucrare(lucrareId, { facturaDocument: documentData as any, statusFacturare: "Facturat" } as any)

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, facturaDocument: documentData, statusFacturare: "Facturat" }
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
        ? { facturaDocument: deleteField() as any, statusFacturare: (lucrare.motivNefacturare ? "Nu se facturează" : "Nefacturat") } as any
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
        updatedLucrare.statusFacturare = lucrare.motivNefacturare ? "Nu se facturează" : "Nefacturat"
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

  // Dacă utilizatorul este client (fără permisiuni de upload), afișăm doar descărcări pentru factură/ofertă/raport
  if (!hasPermission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documente
          </CardTitle>
          <CardDescription>Descărcați documentele disponibile</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Generator ascuns pentru raport – permite descărcare directă fără navigare */}
          <div className="hidden">
            <ReportGenerator lucrare={lucrare as any} onGenerate={handleReportGenerate} ref={reportGeneratorRef} />
          </div>
          <div className="grid gap-3">
            {lucrare.raportGenerat && (
              <a
                className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  reportGeneratorRef.current?.click()
                }}
              >
                <div className="p-2 bg-blue-100 rounded">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium">Raport</div>
                  <div className="text-sm text-muted-foreground">Descarcă raportul</div>
                </div>
              </a>
            )}
            {lucrare.facturaDocument?.url && (
              <a
                className="flex items-center gap-3 p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                href={`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=factura&url=${encodeURIComponent(lucrare.facturaDocument.url)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="p-2 bg-green-100 rounded">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium">Factură</div>
                  <div className="text-sm text-muted-foreground">Descarcă factura</div>
                </div>
              </a>
            )}
            {lucrare.ofertaDocument?.url && (
              <a
                className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                href={`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=oferta&url=${encodeURIComponent(lucrare.ofertaDocument.url)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="p-2 bg-purple-100 rounded">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="font-medium">Ofertă</div>
                  <div className="text-sm text-muted-foreground">Descarcă oferta</div>
                </div>
              </a>
            )}
            {!lucrare.raportGenerat && !lucrare.facturaDocument?.url && !lucrare.ofertaDocument?.url && (
              <div className="text-center py-6 text-muted-foreground text-sm">Nu există documente disponibile</div>
            )}
          </div>
      </CardContent>
      </Card>
    )
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
            : "Facturare: Încărcați factura sau marcați 'Nu se facturează' și adăugați motivul"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Generator ascuns pentru raport – permite descărcare directă fără navigare */}
        <div className="hidden">
          <ReportGenerator lucrare={lucrare as any} onGenerate={handleReportGenerate} ref={reportGeneratorRef} />
        </div>
        {/* Verificăm dacă lucrarea a fost preluată */}
        {!isWorkPickedUp && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Încărcarea documentelor este disponibilă doar după preluarea lucrării de către dispecer.
            </AlertDescription>
          </Alert>
        )}

        {/* Secțiunea pentru factură / facturare */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Facturare</h4>
            <Badge variant={lucrare.facturaDocument ? "default" : "secondary"}>
              {lucrare.facturaDocument ? "Încărcată" : "Neîncărcată"}
            </Badge>
          </div>

          {/* Vizualizarea documentului existent - mereu vizibilă */}
          {lucrare.facturaDocument && (
            <div className="p-3 border rounded-lg bg-green-50 border-green-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium truncate">{lucrare.facturaDocument.fileName}</span>
                </div>
                <div className="flex flex-wrap gap-2 justify-start sm:justify-end w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=factura&url=${encodeURIComponent(lucrare.facturaDocument.url)}`, '_blank')}
                    className="w-full sm:w-auto"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Vizualizează
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/download?lucrareId=${encodeURIComponent(lucrareId)}&type=factura&url=${encodeURIComponent(lucrare.facturaDocument.url)}`, '_blank')}
                    className="w-full sm:w-auto"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descarcă
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteDocument('factura')}
                    disabled={!isWorkPickedUp || isLocked}
                    className="w-full sm:w-auto"
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

          {/* Rând: Încarcă factură (stânga) | Nu se facturează + motiv (dreapta) */}
          {!lucrare.facturaDocument && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* Stânga: Upload factură */}
              {shouldShowFacturaUpload && (
                <div className="w-full sm:w-auto">
                  <input
                    ref={facturaInputRef}
                    type="file"
                    onChange={handleFacturaUpload}
                    className="hidden"
                    disabled={!isWorkPickedUp || isUploading.factura || isArchived || lucrare.statusFacturare === "Nu se facturează" || isLocked}
                  />
                  <Button
                    onClick={() => facturaInputRef.current?.click()}
                    disabled={!isWorkPickedUp || isUploading.factura || isArchived || lucrare.statusFacturare === "Nu se facturează" || isLocked}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isLocked ? "Indisponibil pentru lucrări blocate" : (isArchived ? "Indisponibil pentru lucrări arhivate" : (isUploading.factura ? "Se încarcă..." : "Încarcă factură"))}
                  </Button>
                </div>
              )}

              {/* Dreapta: Nu se facturează + motiv */}
              <div className="w-full sm:w-auto">
                {lucrare.statusFacturare !== "Nu se facturează" ? (
                  <Button
                    variant="outline"
                    disabled={!isWorkPickedUp || isArchived || isLocked}
                    onClick={() => {
                      // Deschidem dialogul pentru selectarea motivului ÎNAINTE de a schimba statusul
                      setIsNoInvoiceReasonDialogOpen(true)
                    }}
                    size="sm"
                    className="w-full sm:w-auto bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300"
                  >
                    <AlertCircle className="h-4 w-4 mr-2 text-gray-600" />
                    Nu se facturează
                  </Button>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setMotivTemp(lucrare?.motivNefacturare || "")
                        setIsMotivDialogOpen(true)
                      }}
                      disabled={isLocked || isArchived}
                    >
                      <AlertCircle className="h-4 w-4 mr-2 text-gray-600" />
                      Setează motiv
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await updateLucrare(lucrareId, { statusFacturare: "Nefacturat", motivNefacturare: "" } as any)
                          onLucrareUpdate({ ...lucrare, statusFacturare: "Nefacturat", motivNefacturare: "" })
                        } catch (err) {
                          toast({ title: "Eroare", description: "Nu s-a putut reveni la 'Nefacturat'", variant: "destructive" })
                        }
                      }}
                      className="w-full sm:w-auto"
                      disabled={isLocked || isArchived}
                    >
                      Revocă 'Nu se facturează'
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Afișare motiv nefăcturare sub butoane */}
          {lucrare.statusFacturare === "Nu se facturează" && (lucrare.motivNefacturare?.trim()?.length ?? 0) > 0 && (
            <div className="text-xs sm:text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-md p-2 sm:p-3">
              <span className="font-medium">Motiv nefăcturare:</span> {lucrare.motivNefacturare}
            </div>
          )}
        </div>

        {/* Secțiunea pentru ofertă - ascunsă complet când hideOfertaUpload este activ */}
        {!hideOfertaUpload && !isLocked && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Ofertă</h4>
              <Badge variant={lucrare.ofertaDocument ? "default" : "secondary"}>
                {lucrare.ofertaDocument ? "Încărcată" : "Neîncărcată"}
              </Badge>
            </div>

            {/* Vizualizarea documentului existent */}
            {lucrare.ofertaDocument && (
              <div className="p-3 border rounded-lg bg-green-50 border-green-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium truncate">{lucrare.ofertaDocument.fileName}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2 space-y-1">
                  <p>Încărcată pe {formatRoDate(lucrare.ofertaDocument.uploadedAt)} la {formatRoTime(lucrare.ofertaDocument.uploadedAt)}</p>
                </div>
              </div>
            )}

            {/* Upload ofertă */}
            {!lucrare.ofertaDocument && shouldShowOfertaUpload && (
              <div className="space-y-3">
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

            {/* Mesaj indisponibil */}
            {!lucrare.ofertaDocument && !shouldShowOfertaUpload && (
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
          </div>
        )}

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

        {/* Dialog pentru motivul nefăcturării */}
        <Dialog open={isMotivDialogOpen} onOpenChange={setIsMotivDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Motivul pentru care nu se facturează</DialogTitle>
              <DialogDescription>
                Introdu motivul pentru care această lucrare nu se facturează.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <textarea
                className="w-full border rounded p-2 text-sm"
                rows={4}
                placeholder="Motivul pentru care nu se facturează"
                value={motivTemp}
                onChange={(e) => setMotivTemp(e.target.value)}
              />
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setIsMotivDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                Anulează
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  const value = motivTemp.trim()
                  try {
                    await updateLucrare(lucrareId, { motivNefacturare: value } as any)
                    onLucrareUpdate({ ...lucrare, motivNefacturare: value })
                    if (!value) {
                      toast({ title: "Salvat", description: "Motivul a fost golit." })
                    } else {
                      toast({ title: "Salvat", description: "Motivul a fost salvat." })
                    }
                    setIsMotivDialogOpen(false)
                  } catch (err) {
                    toast({ title: "Eroare", description: "Nu s-a putut salva motivul.", variant: "destructive" })
                  }
                }}
              >
                Salvează
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog pentru selectarea motivului de nefacturare (cu opțiuni predefinite) */}
        <NoInvoiceReasonDialog
          isOpen={isNoInvoiceReasonDialogOpen}
          onClose={() => setIsNoInvoiceReasonDialogOpen(false)}
          onConfirm={async (reason) => {
            try {
              // Setăm statusul și motivul împreună
              await updateLucrare(lucrareId, {
                statusFacturare: "Nu se facturează",
                motivNefacturare: reason
              } as any)
              
              onLucrareUpdate({
                ...lucrare,
                statusFacturare: "Nu se facturează",
                motivNefacturare: reason
              })
              
              toast({
                title: "Succes",
                description: "Statusul de facturare a fost actualizat cu motivul selectat."
              })
              
              setIsNoInvoiceReasonDialogOpen(false)
            } catch (e) {
              console.error("Eroare la setarea 'Nu se facturează':", e)
              toast({
                title: "Eroare",
                description: "Nu s-a putut actualiza statusul de facturare.",
                variant: "destructive"
              })
            }
          }}
          onCancel={() => {
            // Dacă anulează, nu facem nimic și închidem dialogul
            setIsNoInvoiceReasonDialogOpen(false)
            toast({
              title: "Anulat",
              description: "Nu s-au făcut modificări."
            })
          }}
        />
      </CardContent>
    </Card>
  )
} 