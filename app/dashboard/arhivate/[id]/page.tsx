"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { 
  ArrowLeft, 
  ArchiveRestore, 
  Download, 
  Eye,
  Calendar,
  User,
  MapPin,
  FileText,
  Phone,
  Clock,
  AlertCircle,
  Info,
  Building2,
  CreditCard,
  Wrench,
  Timer,
  CheckCircle,
  XCircle,
  Signature,
  Package,
  ShieldCheck,
  FileSpreadsheet,
  Users,
  Settings,
  DollarSign,
  Archive
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { getLucrareById, updateLucrare, getClientById, type Lucrare, type Client } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { WORK_STATUS } from "@/lib/utils/constants"
import { formatDate } from "@/lib/utils/date-formatter"
import { formatDate as formatISODate, formatTime, formatDateTime } from "@/lib/utils/time-format"
import { getWorkStatusClass } from "@/lib/utils/status-classes"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DocumentUpload } from "@/components/document-upload"
import { ImageDefectViewer } from "@/components/image-defect-viewer"
import { calculateWarranty, getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"

interface ArchivedWorkDetailPageProps {
  params: { id: string }
}

export default function ArchivedWorkDetailPage({ params }: ArchivedWorkDetailPageProps) {
  const { userData } = useAuth()
  const router = useRouter()
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Verificăm accesul - doar admin și dispecer
  const hasAccess = userData?.role === "admin" || userData?.role === "dispecer"

  useEffect(() => {
    if (!hasAccess) {
      router.push("/dashboard")
      return
    }

    const fetchData = async () => {
      try {
        const lucrareData = await getLucrareById(params.id)
        if (lucrareData) {
          // Verificăm că lucrarea este efectiv arhivată
          if (lucrareData.statusLucrare !== WORK_STATUS.ARCHIVED) {
            toast({
              title: "Eroare",
              description: "Această lucrare nu este arhivată.",
              variant: "destructive",
            })
            router.push("/dashboard/arhivate")
            return
          }
          setLucrare(lucrareData)

          // Încercăm să găsim clientul în baza de date
          if (lucrareData.clientInfo?.id) {
            const clientData = await getClientById(lucrareData.clientInfo.id)
            setClient(clientData)
          }
        } else {
          toast({
            title: "Eroare",
            description: "Lucrarea nu a fost găsită.",
            variant: "destructive",
          })
          router.push("/dashboard/arhivate")
        }
      } catch (error) {
        console.error("Eroare la încărcarea datelor:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca datele.",
          variant: "destructive",
        })
        router.push("/dashboard/arhivate")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id, hasAccess, router])

  // Funcție pentru dezarhivare
  const handleDezarhivare = async () => {
    if (!lucrare) return

    setIsUpdating(true)
    try {
      // Eliminăm statusul de arhivare și câmpurile asociate
      await updateLucrare(params.id, { 
        statusLucrare: WORK_STATUS.COMPLETED,
        archivedAt: null as any, // Eliminăm data arhivării
        archivedBy: null as any  // Eliminăm utilizatorul care a arhivat
      })
      toast({
        title: "Succes",
        description: "Lucrarea a fost dezarhivată cu succes și a fost mutată în lucrările active.",
      })
      
      // Refresh cache-ul Next.js pentru a actualiza toate paginile
      router.refresh()
      
      // Mică întârziere pentru a se asigura că toast-ul este vizibil
      setTimeout(() => {
        // Redirect către lucrări active unde va apărea lucrarea dezarhivată
        router.push("/dashboard/lucrari")
      }, 1000)
    } catch (error) {
      console.error("Eroare la dezarhivare:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut dezarhiva lucrarea.",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  // Calculăm garanția pentru echipament
  const warrantyInfo = lucrare?.echipamentCod && client?.echipamente ? 
    (() => {
      const echipament = client.echipamente.find(eq => eq.cod === lucrare.echipamentCod)
      return echipament ? getWarrantyDisplayInfo(echipament) : null
    })() : null

  if (!hasAccess) {
    return null // Se va redirecționa în useEffect
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Se încarcă lucrarea arhivată...</p>
          </div>
        </div>
      </DashboardShell>
    )
  }

  if (!lucrare) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Lucrarea nu a fost găsită</h2>
            <p className="text-gray-500 mb-4">Nu s-a putut găsi lucrarea solicitată.</p>
            <Button onClick={() => router.push("/dashboard/arhivate")}>
              Înapoi la Lucrări Arhivate
            </Button>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <TooltipProvider>
      <DashboardShell>
        <DashboardHeader
          heading="Detalii Lucrare Arhivată"
          text={`ID Baza de Date: ${params.id} • Status: ${lucrare.statusLucrare}`}
        >
          <div className="flex items-center space-x-2">
            {lucrare.raportGenerat && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/raport/${params.id}`)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Descarcă Raport
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Descarcă raportul PDF generat</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    onClick={handleDezarhivare}
                    disabled={isUpdating}
                  >
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    {isUpdating ? "Se dezarhivează..." : "Dezarhivează"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dezarhivează lucrarea și o returnează la statusul Finalizat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DashboardHeader>

        <div className="space-y-6">
          {/* Alert pentru status arhivat */}
          <Alert className="border-orange-200 bg-orange-50">
            <Archive className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <strong>Lucrare Arhivată:</strong> Această lucrare este arhivată și poate fi doar vizualizată. 
              Pentru a face modificări, dezarhivați-o mai întâi.
            </AlertDescription>
          </Alert>

          {/* Informații generale lucrare */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informații Generale Lucrare
                </CardTitle>
                <Badge className={getWorkStatusClass(lucrare.statusLucrare)}>
                  {lucrare.statusLucrare}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Client</label>
                    <p className="text-sm font-medium">{lucrare.client}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Persoană Contact</label>
                    <p className="text-sm">{lucrare.persoanaContact}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Telefon</label>
                    <p className="text-sm flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      {lucrare.telefon}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Locație</label>
                    <p className="text-sm flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {lucrare.locatie}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tip Lucrare</label>
                    <p className="text-sm">{lucrare.tipLucrare}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Data Emiterii</label>
                    <p className="text-sm flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(lucrare.dataEmiterii)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Data Intervenție</label>
                    <p className="text-sm flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(lucrare.dataInterventie)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status Facturare</label>
                    <p className="text-sm">{lucrare.statusFacturare}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {lucrare.statusEchipament && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status Echipament</label>
                      <p className="text-sm">{lucrare.statusEchipament}</p>
                    </div>
                  )}
                  {lucrare.statusFinalizareInterventie && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status Finalizare</label>
                      <Badge variant={lucrare.statusFinalizareInterventie === "FINALIZAT" ? "default" : "destructive"}>
                        {lucrare.statusFinalizareInterventie}
                      </Badge>
                    </div>
                  )}
                  {lucrare.preluatDispecer !== undefined && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Preluat Dispecer</label>
                      <Badge variant={lucrare.preluatDispecer ? "default" : "secondary"}>
                        {lucrare.preluatDispecer ? "DA" : "NU"}
                      </Badge>
                    </div>
                  )}
                  {lucrare.equipmentVerified && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Echipament Verificat</label>
                      <p className="text-sm flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {lucrare.equipmentVerifiedAt ? formatDateTime(lucrare.equipmentVerifiedAt) : "DA"}
                      </p>
                      {lucrare.equipmentVerifiedBy && (
                        <p className="text-xs text-gray-500">de către {lucrare.equipmentVerifiedBy}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {lucrare.tehnicieni.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-gray-500 mb-2 block">Tehnicieni Atribuiți</label>
                    <div className="flex flex-wrap gap-2">
                      {lucrare.tehnicieni.map((tehnician, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {tehnician}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Persoane contact multiple */}
              {lucrare.persoaneContact && lucrare.persoaneContact.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-gray-500 mb-2 block">Persoane Contact</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {lucrare.persoaneContact.map((persoana, index) => (
                        <div key={index} className="border rounded-lg p-3 bg-gray-50">
                          <p className="font-medium text-sm">{persoana.nume}</p>
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {persoana.telefon}
                          </p>
                          {persoana.email && (
                            <p className="text-sm text-gray-600">{persoana.email}</p>
                          )}
                          {persoana.functie && (
                            <p className="text-xs text-gray-500">{persoana.functie}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Informații client complete */}
          {client && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Informații Client Complete
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Nume Complet</label>
                      <p className="text-sm font-medium">{client.nume}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Adresa</label>
                      <p className="text-sm">{client.adresa}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="text-sm">{client.email}</p>
                    </div>
                    {client.telefon && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Telefon</label>
                        <p className="text-sm">{client.telefon}</p>
                      </div>
                    )}
                    {client.reprezentantFirma && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Reprezentant Firmă</label>
                        <p className="text-sm">{client.reprezentantFirma}{client.functieReprezentant ? `, ${client.functieReprezentant}` : ''}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">CUI</label>
                      <p className="text-sm font-mono">{client.cui}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Reg. Com.</label>
                      <p className="text-sm font-mono">{client.regCom}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Cont Bancar</label>
                      <p className="text-sm font-mono">{client.contBancar}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Banca</label>
                      <p className="text-sm">{client.banca}</p>
                    </div>
                  </div>
                </div>

                {/* Locații client */}
                {client.locatii && client.locatii.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Locații Client</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {client.locatii.map((locatie, index) => (
                          <div key={index} className="border rounded-lg p-3 bg-blue-50">
                            <p className="font-medium text-sm flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {locatie.nume}
                            </p>
                            <p className="text-sm text-gray-600">{locatie.adresa}</p>
                            {locatie.persoaneContact.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-gray-500 mb-1">Contact:</p>
                                {locatie.persoaneContact.map((contact, idx) => (
                                  <p key={idx} className="text-xs text-gray-600">
                                    {contact.nume} - {contact.telefon}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Contracte client */}
                {client.contracte && client.contracte.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Contracte Active</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {client.contracte.map((contract, index) => (
                          <div key={index} className="border rounded-lg p-3 bg-green-50">
                            <p className="font-medium text-sm flex items-center gap-1">
                              <FileSpreadsheet className="h-4 w-4" />
                              Contract #{contract.numar}
                            </p>
                            <p className="text-sm text-gray-600">{contract.tip}</p>
                            <p className="text-sm text-gray-600">
                              {formatDate(contract.dataIncepere)} - {formatDate(contract.dataExpirare)}
                            </p>
                            <p className="text-sm font-medium text-green-700">
                              {contract.valoare} {contract.moneda}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Echipament și garanție */}
          {(lucrare.echipament || lucrare.echipamentCod || lucrare.echipamentModel || warrantyInfo) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Informații Echipament
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {lucrare.echipament && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Echipament</label>
                        <p className="text-sm">{lucrare.echipament}</p>
                      </div>
                    )}
                    {lucrare.echipamentCod && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Cod Echipament</label>
                        <p className="text-sm font-mono">{lucrare.echipamentCod}</p>
                      </div>
                    )}
                    {lucrare.echipamentModel && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Model Echipament</label>
                        <p className="text-sm">{lucrare.echipamentModel}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Informații garanție cu calculul detaliat */}
                    {warrantyInfo && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Status Garanție</label>
                          <Badge className={warrantyInfo.statusBadgeClass}>
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            {warrantyInfo.statusText}
                          </Badge>
                        </div>

                        {/* Calculul automat detaliat al garanției */}
                        <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-md border">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <span className="text-white text-xs font-bold">G</span>
                            </div>
                            <h5 className="text-sm font-medium text-blue-900">Calculul automat al garanției</h5>
                          </div>

                          <div className="p-3 bg-white rounded-md border mb-2">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-600">Status:</span>
                                <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                                  {warrantyInfo.statusText}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-gray-600">Zile rămase:</span>
                                <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                                  {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">Data instalării:</span>
                                <span className="ml-1">{warrantyInfo.installationDate || "Nedefinită"}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Expiră la:</span>
                                <span className="ml-1">{warrantyInfo.warrantyExpires || "Nedefinită"}</span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-2">{warrantyInfo.warrantyMessage}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Confirmarea tehnicianului la fața locului */}
                    {lucrare.tehnicianConfirmaGarantie !== undefined && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-yellow-800">
                            Confirmarea tehnicianului la fața locului:
                          </span>
                          <Badge 
                            className={lucrare.tehnicianConfirmaGarantie 
                              ? "bg-green-100 text-green-800 border-green-200" 
                              : "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {lucrare.tehnicianConfirmaGarantie ? "✓ Confirmă garanția" : "✗ Nu confirmă garanția"}
                          </Badge>
                        </div>
                        <p className="text-xs text-yellow-700 mt-1">
                          Tehnicianul a verificat fizic echipamentul și a {lucrare.tehnicianConfirmaGarantie ? 'confirmat' : 'infirmat'} că este în garanție.
                        </p>
                      </div>
                    )}

                    {/* Verificări garanție de către tehnician (câmpuri vechi pentru compatibilitate) */}
                    {lucrare.garantieVerificata !== undefined && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Garanție Verificată (vechi)</label>
                        <Badge variant={lucrare.garantieVerificata ? "default" : "secondary"}>
                          {lucrare.garantieVerificata ? "DA" : "NU"}
                        </Badge>
                      </div>
                    )}
                    {lucrare.esteInGarantie !== undefined && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Tehnician Confirmă Garanție (vechi)</label>
                        <Badge variant={lucrare.esteInGarantie ? "default" : "destructive"}>
                          {lucrare.esteInGarantie ? "ÎN GARANȚIE" : "GARANȚIE EXPIRATĂ"}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Echipamente client complete */}
                {client?.echipamente && client.echipamente.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Toate Echipamentele Clientului</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {client.echipamente.map((echipament, index) => {
                          const eqWarranty = getWarrantyDisplayInfo(echipament)
                          const isCurrent = echipament.cod === lucrare.echipamentCod
                          
                          return (
                            <div key={index} className={`border rounded-lg p-3 ${isCurrent ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}`}>
                              <p className="font-medium text-sm flex items-center gap-1">
                                <Settings className="h-4 w-4" />
                                {echipament.nume}
                                {isCurrent && <Badge variant="default" className="ml-2 text-xs">ACTUAL</Badge>}
                              </p>
                              <p className="text-sm text-gray-600 font-mono">{echipament.cod}</p>
                              {echipament.model && <p className="text-sm text-gray-600">{echipament.model}</p>}
                              {echipament.serie && <p className="text-sm text-gray-600">Serie: {echipament.serie}</p>}
                              {eqWarranty && (
                                <Badge className={`mt-1 ${eqWarranty.statusBadgeClass}`}>
                                  {eqWarranty.statusText}
                                </Badge>
                              )}
                              {echipament.observatii && (
                                <p className="text-xs text-gray-500 mt-1">{echipament.observatii}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Descrieri și defecte */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Descrieri și Defecte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Descriere Lucrare</label>
                <p className="text-sm mt-1 whitespace-pre-line border rounded p-3 bg-gray-50">
                  {lucrare.descriere || "Nu a fost specificată o descriere."}
                </p>
              </div>
              
              {lucrare.defectReclamat && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Defect Reclamat</label>
                  <p className="text-sm mt-1 whitespace-pre-line border rounded p-3 bg-red-50">
                    {lucrare.defectReclamat}
                  </p>
                </div>
              )}

              {lucrare.descriereInterventie && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Descriere Intervenție</label>
                  <p className="text-sm mt-1 whitespace-pre-line border rounded p-3 bg-blue-50">
                    {lucrare.descriereInterventie}
                  </p>
                </div>
              )}

              {lucrare.constatareLaLocatie && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Constatare la Locație</label>
                  <p className="text-sm mt-1 whitespace-pre-line border rounded p-3 bg-green-50">
                    {lucrare.constatareLaLocatie}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timpi și durate */}
          {(lucrare.timpSosire || lucrare.timpPlecare || lucrare.durataInterventie || lucrare.dataSosire || lucrare.dataPlecare) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Timpi de Sosire și Plecare
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {lucrare.dataSosire && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Data Sosire</label>
                        <p className="text-sm flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(lucrare.dataSosire)}
                        </p>
                      </div>
                    )}
                    {lucrare.oraSosire && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Ora Sosire</label>
                        <p className="text-sm flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {lucrare.oraSosire}
                        </p>
                      </div>
                    )}
                    {/* {lucrare.timpSosire && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Timp Sosire</label>
                        <p className="text-sm">{lucrare.timpSosire}</p>
                      </div>
                    )} */}
                  </div>

                  <div className="space-y-3">
                    {lucrare.dataPlecare && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Data Plecare</label>
                        <p className="text-sm flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(lucrare.dataPlecare)}
                        </p>
                      </div>
                    )}
                    {lucrare.oraPlecare && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Ora Plecare</label>
                        <p className="text-sm flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {lucrare.oraPlecare}
                        </p>
                      </div>
                    )}
                    {/* {lucrare.timpPlecare && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Timp Plecare</label>
                        <p className="text-sm">{lucrare.timpPlecare}</p>
                      </div>
                    )} */}
                    {lucrare.durataInterventie && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Durata Intervenție</label>
                        <p className="text-sm flex items-center gap-1">
                          <Timer className="h-4 w-4" />
                          {lucrare.durataInterventie}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Semnături */}
          {(lucrare.semnaturaTehnician || lucrare.semnaturaBeneficiar || lucrare.numeTehnician || lucrare.numeBeneficiar) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Signature className="h-5 w-5" />
                  Semnături
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {lucrare.numeTehnician && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Nume Tehnician</label>
                        <p className="text-sm">{lucrare.numeTehnician}</p>
                      </div>
                    )}
                    {lucrare.semnaturaTehnician && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Semnătură Tehnician</label>
                        <div className="border rounded p-2 bg-gray-50">
                          <img 
                            src={lucrare.semnaturaTehnician} 
                            alt="Semnătură tehnician" 
                            className="max-h-20 w-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {lucrare.numeBeneficiar && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Nume Beneficiar</label>
                        <p className="text-sm">{lucrare.numeBeneficiar}</p>
                      </div>
                    )}
                    {lucrare.semnaturaBeneficiar && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Semnătură Beneficiar</label>
                        <div className="border rounded p-2 bg-gray-50">
                          <img 
                            src={lucrare.semnaturaBeneficiar} 
                            alt="Semnătură beneficiar" 
                            className="max-h-20 w-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produse */}
          {lucrare.products && lucrare.products.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Produse Utilizate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lucrare.products.map((product, index) => (
                    <div key={index} className="flex items-center justify-between border rounded p-3 bg-gray-50">
                      <div>
                        <p className="font-medium text-sm">{product.name}</p>
                        <p className="text-sm text-gray-600">
                          {product.quantity} {product.um} × {product.price} lei/{product.um}
                        </p>
                      </div>
                      <p className="font-medium text-sm">
                        {(product.quantity * product.price).toFixed(2)} lei
                      </p>
                    </div>
                  ))}
                  <div className="border-t pt-3">
                    <p className="text-right font-medium">
                      Total: {lucrare.products.reduce((sum, p) => sum + (p.quantity * p.price), 0).toFixed(2)} lei
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contracte și oferte */}
          {(lucrare.contract || lucrare.necesitaOferta || lucrare.statusOferta || lucrare.comentariiOferta) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Contracte și Oferte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {lucrare.contract && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Contract</label>
                        <p className="text-sm">{lucrare.contract}</p>
                      </div>
                    )}
                    {lucrare.contractNumber && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Număr Contract</label>
                        <p className="text-sm font-mono">{lucrare.contractNumber}</p>
                      </div>
                    )}
                    {lucrare.contractType && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Tip Contract</label>
                        <p className="text-sm">{lucrare.contractType}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {lucrare.necesitaOferta !== undefined && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Necesită Ofertă</label>
                        <Badge variant={lucrare.necesitaOferta ? "default" : "secondary"}>
                          {lucrare.necesitaOferta ? "DA" : "NU"}
                        </Badge>
                      </div>
                    )}
                    {lucrare.statusOferta && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Status Ofertă</label>
                        <Badge variant={lucrare.statusOferta === "OFERTAT" ? "default" : "secondary"}>
                          {lucrare.statusOferta}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {lucrare.comentariiOferta && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Comentarii Ofertă</label>
                    <p className="text-sm mt-1 whitespace-pre-line border rounded p-3 bg-yellow-50">
                      {lucrare.comentariiOferta}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

    

          {/* Reatribuire și istoric */}
          {(lucrare.lucrareOriginala || lucrare.mesajReatribuire) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Reatribuire și Istoric
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lucrare.lucrareOriginala && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Lucrare Originală</label>
                    <p className="text-sm font-mono">{lucrare.lucrareOriginala}</p>
                  </div>
                )}
                {lucrare.mesajReatribuire && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Mesaj Reatribuire</label>
                    <p className="text-sm border rounded p-3 bg-orange-50">
                      {lucrare.mesajReatribuire}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documente (doar vizualizare) */}
          {(lucrare.facturaDocument || lucrare.ofertaDocument) && (
            <Card>
              <CardHeader>
                <CardTitle>Documente Încărcate</CardTitle>
                <CardDescription>
                  Documentele pot fi doar vizualizate și descărcate pentru lucrările arhivate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUpload 
                  lucrareId={params.id}
                  lucrare={lucrare}
                  onLucrareUpdate={setLucrare}
                />
              </CardContent>
            </Card>
          )}

          {/* Imagini defecte (doar vizualizare) */}
          {lucrare.imaginiDefecte && lucrare.imaginiDefecte.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Imagini Defecte</CardTitle>
                <CardDescription>
                  Imaginile pot fi doar vizualizate pentru lucrările arhivate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ImageDefectViewer 
                 imaginiDefecte={lucrare.imaginiDefecte} 
                 userRole={userData?.role || ""}
               />
              </CardContent>
            </Card>
          )}

   
          {/* Informații raport */}
          {lucrare.raportGenerat && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informații Raport
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status Raport:</span>
                  <Badge variant="default" className="bg-green-500">
                    Generat
                  </Badge>
                </div>
                {lucrare.numarRaport && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Număr Raport:</span>
                    <span className="text-sm font-mono">{lucrare.numarRaport}</span>
                  </div>
                )}
                {lucrare.raportDataLocked && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Date Blocate:</span>
                    <Badge variant="default">DA</Badge>
                  </div>
                )}
                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => router.push(`/raport/${params.id}`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Accesează Raportul
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metadata și audit trail */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Metadata și Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Informații arhivare */}
              {(lucrare.archivedAt || lucrare.archivedBy) && (
                <>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <Archive className="h-4 w-4 text-orange-600" />
                      <span className="font-medium text-sm text-orange-800">Informații Arhivare</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {lucrare.archivedAt && (
                        <div className="text-sm">
                          <span className="text-orange-700">Arhivată la:</span> {formatDateTime(lucrare.archivedAt.toDate?.() || lucrare.archivedAt)}
                        </div>
                      )}
                      {lucrare.archivedBy && (
                        <div className="text-sm">
                          <span className="text-orange-700">Arhivată de:</span> {lucrare.archivedBy}
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Metadata generale */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {lucrare.createdAt && (
                    <div className="text-sm">
                      <span className="text-gray-500">Creată la:</span> {formatDateTime(lucrare.createdAt.toDate().toISOString())}
                    </div>
                  )}
                  {lucrare.createdBy && (
                    <div className="text-sm">
                      <span className="text-gray-500">Creată de:</span> {lucrare.createdBy}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {lucrare.updatedAt && (
                    <div className="text-sm">
                      <span className="text-gray-500">Actualizată la:</span> {formatDateTime(lucrare.updatedAt.toDate().toISOString())}
                    </div>
                  )}
                  {lucrare.updatedBy && (
                    <div className="text-sm">
                      <span className="text-gray-500">Actualizată de:</span> {lucrare.updatedBy}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    </TooltipProvider>
  )
} 