"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import {
  ChevronLeft,
  FileText,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle,
  Lock,
  MapPin,
  Phone,
  Info,
  Check,
} from "lucide-react"
import { getLucrareById, deleteLucrare, updateLucrare, getClienti } from "@/lib/firebase/firestore"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function LucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("detalii")
  const [equipmentVerified, setEquipmentVerified] = useState(false)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Încărcăm datele lucrării și adresa locației
  useEffect(() => {
    const fetchLucrareAndLocationAddress = async () => {
      try {
        // Obținem datele lucrării
        const data = await getLucrareById(params.id)
        setLucrare(data)

        // Verificăm dacă echipamentul a fost deja verificat
        if (data?.equipmentVerified) {
          setEquipmentVerified(true)
        }

        // Obținem adresa locației
        if (data?.client && data?.locatie) {
          try {
            console.log("Încercăm să obținem adresa pentru locația:", data.locatie, "a clientului:", data.client)

            // Obținem toți clienții
            const clienti = await getClienti()
            console.log("Număr total de clienți:", clienti.length)

            // Găsim clientul după nume
            const client = clienti.find((c) => c.nume === data.client)

            if (client) {
              console.log("Client găsit:", client.nume, "ID:", client.id)
              console.log("Locații disponibile:", client.locatii ? client.locatii.length : 0)

              if (client.locatii && client.locatii.length > 0) {
                // Căutăm locația în lista de locații a clientului
                const locatie = client.locatii.find((loc) => loc.nume === data.locatie)

                if (locatie) {
                  console.log("Locație găsită:", locatie.nume, "Adresă:", locatie.adresa)
                  setLocationAddress(locatie.adresa)

                  // Actualizăm lucrarea cu ID-ul clientului și adresa locației pentru a le folosi în raport
                  await updateLucrare(params.id, {
                    clientId: client.id,
                    clientInfo: {
                      ...data.clientInfo,
                      cui: client.cif,
                      adresa: client.adresa,
                      locationAddress: locatie.adresa,
                    },
                  })
                } else {
                  console.log("Locația nu a fost găsită în lista de locații a clientului")
                }
              } else {
                console.log("Clientul nu are locații definite")
              }
            } else {
              console.log("Clientul nu a fost găsit după nume")
            }
          } catch (error) {
            console.error("Eroare la obținerea adresei locației:", error)
          }
        }
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "Nu s-a putut încărca lucrarea.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchLucrareAndLocationAddress()
  }, [params.id])

  // Verificăm dacă tehnicianul are acces la această lucrare
  useEffect(() => {
    if (
      !loading &&
      lucrare &&
      userData?.role === "tehnician" &&
      ((userData?.displayName && !lucrare.tehnicieni.includes(userData.displayName)) ||
        (lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true))
    ) {
      // Tehnicianul nu este alocat la această lucrare sau lucrarea este finalizată cu raport generat
      // redirecționăm la dashboard
      toast({
        title: "Acces restricționat",
        description: lucrare.tehnicieni.includes(userData.displayName || "")
          ? "Lucrarea este finalizată și raportul a fost generat. Nu mai puteți face modificări."
          : "Nu aveți acces la această lucrare.",
        variant: "destructive",
      })
      router.push("/dashboard/lucrari")
    }
  }, [loading, lucrare, userData, router])

  // Funcție pentru a șterge o lucrare
  const handleDeleteLucrare = useStableCallback(async () => {
    if (!lucrare?.id) return

    try {
      await deleteLucrare(lucrare.id)
      toast({
        title: "Lucrare ștearsă",
        description: "Lucrarea a fost ștearsă cu succes.",
      })
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la ștergerea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la ștergerea lucrării.",
        variant: "destructive",
      })
    }
  })

  // Funcție pentru a edita lucrarea - redirecționează către pagina de lucrări cu parametrul de editare
  const handleEdit = useCallback(() => {
    if (!lucrare?.id) return

    // Redirecționăm către pagina de lucrări cu parametrul de editare
    router.push(`/dashboard/lucrari?edit=${lucrare.id}`)
  }, [router, lucrare])

  // Modificăm funcția handleGenerateReport pentru a naviga către pagina de raport
  const handleGenerateReport = useCallback(() => {
    if (!lucrare?.id) {
      console.error("ID-ul lucrării lipsește:", lucrare)
      toast({
        title: "Eroare",
        description: "ID-ul lucrării nu este valid",
        variant: "destructive",
      })
      return
    }

    router.push(`/raport/${lucrare.id}`)
  }, [router, lucrare])

  // Funcție pentru a reîncărca datele lucrării
  const refreshLucrare = useStableCallback(async () => {
    try {
      const data = await getLucrareById(params.id)
      setLucrare(data)

      // Actualizăm starea de verificare a echipamentului
      if (data.equipmentVerified) {
        setEquipmentVerified(true)
      }

      // Actualizăm și tab-ul activ dacă este cazul
      if (data.statusLucrare === "Finalizat" && activeTab !== "detalii") {
        setActiveTab("detalii")
      }

      toast({
        title: "Actualizat",
        description: "Datele lucrării au fost actualizate.",
      })
    } catch (error) {
      console.error("Eroare la reîncărcarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut reîncărca datele lucrării.",
        variant: "destructive",
      })
    }
  })

  // Modificăm funcția handleVerificationComplete pentru a actualiza și statusul lucrării la "În lucru"
  // când tehnicianul scanează cu succes codul QR al echipamentului

  const handleVerificationComplete = useStableCallback(async (success: boolean) => {
    if (!lucrare?.id) return

    if (success) {
      setEquipmentVerified(true)

      // Actualizăm lucrarea în baza de date
      try {
        // Pregătim datele pentru actualizare
        const updateData = {
          ...lucrare,
          equipmentVerified: true,
          equipmentVerifiedAt: new Date().toISOString(),
          equipmentVerifiedBy: userData?.displayName || "Tehnician necunoscut",
        }

        // Actualizăm statusul lucrării la "În lucru" doar dacă statusul curent este "Listată" sau "Atribuită"
        // Astfel nu vom modifica statusul dacă lucrarea este deja "Finalizat" sau are alt status special
        if (lucrare.statusLucrare === "Listată" || lucrare.statusLucrare === "Atribuită") {
          updateData.statusLucrare = "În lucru"
        }

        await updateLucrare(lucrare.id, updateData)

        // Actualizăm și starea locală dacă am modificat statusul
        if (lucrare.statusLucrare === "Listată" || lucrare.statusLucrare === "Atribuită") {
          setLucrare((prev) => (prev ? { ...prev, statusLucrare: "În lucru" } : null))
        }

        toast({
          title: "Verificare completă",
          description: "Echipamentul a fost verificat cu succes. Puteți continua intervenția.",
        })

        // Schimbăm automat la tab-ul de intervenție
        setTimeout(() => {
          setActiveTab("interventie")
        }, 1000)
      } catch (error) {
        console.error("Eroare la actualizarea stării de verificare:", error)
        toast({
          title: "Eroare",
          description: "Nu s-a putut actualiza starea de verificare a echipamentului.",
          variant: "destructive",
        })
      }
    } else {
      setEquipmentVerified(false)
      toast({
        title: "Verificare eșuată",
        description: "Echipamentul scanat nu corespunde cu cel din lucrare. Nu puteți continua intervenția.",
        variant: "destructive",
      })
    }
  })

  // Funcție pentru a actualiza starea de preluare a lucrării
  const handleToggleDispatcherPickup = async () => {
    if (!lucrare?.id) return

    // Dacă lucrarea este deja preluată, nu facem nimic
    if (lucrare.preluatDispecer) return

    try {
      setIsUpdating(true)
      await updateLucrare(lucrare.id, { preluatDispecer: true })

      // Actualizăm lucrarea local
      setLucrare((prev) => (prev ? { ...prev, preluatDispecer: true } : null))

      toast({
        title: "Lucrare preluată",
        description: "Lucrarea a fost marcată ca preluată de dispecer.",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })
    } catch (error) {
      console.error("Eroare la actualizarea stării de preluare:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea stării de preluare.",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  // Funcție pentru formatarea numărului de telefon pentru apelare
  const formatPhoneForCall = (phone: string) => {
    // Eliminăm toate caracterele non-numerice
    return phone.replace(/\D/g, "")
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Se încarcă..." text="Vă rugăm așteptați" />
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </DashboardShell>
    )
  }

  if (!lucrare) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Lucrare negăsită" text="Lucrarea nu a fost găsită în sistem" />
        <Button onClick={() => router.push("/dashboard/lucrari")}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi la lucrări
        </Button>
      </DashboardShell>
    )
  }

  const isCompletedWithReport = lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true

  return (
    <DashboardShell>
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/lucrari")}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" /> Generează raport
          </Button>

          {/* Adăugăm butonul de preluare/anulare preluare pentru admin și dispecer */}
          {isAdminOrDispatcher && isCompletedWithReport && !lucrare.preluatDispecer && (
            <Button
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleToggleDispatcherPickup}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Se procesează...
                </span>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Preia lucrare
                </>
              )}
            </Button>
          )}
        </div>
      </DashboardHeader>

      {role === "tehnician" && lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && (
        <Alert variant="info" className="mb-4 bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertTitle>Lucrare finalizată</AlertTitle>
          <AlertDescription>
            Această lucrare este finalizată și raportul a fost generat. Nu mai puteți face modificări.
            {lucrare.preluatDispecer
              ? " Lucrarea a fost preluată de dispecer."
              : " Lucrarea nu a fost încă preluată de dispecer."}
          </AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner de notificare pentru tehnicieni dacă echipamentul nu a fost verificat */}
      {role === "tehnician" && !equipmentVerified && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Verificare echipament necesară</AlertTitle>
          <AlertDescription>
            Trebuie să verificați echipamentul înainte de a putea începe intervenția. Accesați tab-ul "Verificare
            Echipament".
          </AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner de confirmare dacă echipamentul a fost verificat */}
      {role === "tehnician" && equipmentVerified && (
        <Alert variant="default" className="mb-4 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Echipament verificat</AlertTitle>
          <AlertDescription>Echipamentul a fost verificat cu succes. Puteți continua intervenția.</AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner pentru admin/dispecer care arată starea de preluare */}
      {isAdminOrDispatcher && isCompletedWithReport && (
        <Alert
          variant={lucrare.preluatDispecer ? "default" : "warning"}
          className={`mb-4 ${lucrare.preluatDispecer ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}
        >
          {lucrare.preluatDispecer ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          )}
          <AlertTitle>{lucrare.preluatDispecer ? "Lucrare preluată" : "Lucrare în așteptare"}</AlertTitle>
          <AlertDescription>
            {lucrare.preluatDispecer
              ? "Această lucrare a fost preluată de dispecer și nu mai este vizibilă pentru tehnician."
              : "Această lucrare nu a fost încă preluată de dispecer și este încă vizibilă pentru tehnician."}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className="inline-flex w-full flex-wrap gap-2 h-auto
             bg-muted p-1 rounded-md text-muted-foreground
             md:flex-nowrap md:w-auto"
        >
          {/* ------------ 1. Detalii (50 %) ------------------------------- */}
          <TabsTrigger value="detalii" className="flex-1 basis-1/2 text-center whitespace-normal">
            Detalii&nbsp;Lucrare
          </TabsTrigger>

          {/* ------------ 3. Verificare Echipament (100 % pe mobil) ------- */}
          {role === "tehnician" && !lucrare.raportGenerat && (
            <TabsTrigger value="verificare" className="basis-full md:basis-auto text-center whitespace-normal">
              Verificare echipament
            </TabsTrigger>
          )}
          {/* ------------ 2. Intervenție (50 %) --------------------------- */}
          {role === "tehnician" && !lucrare.raportGenerat && (
            <TabsTrigger
              value="interventie"
              disabled={
                role === "tehnician" &&
                (!equipmentVerified || (lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true))
              }
              className={`flex-1 basis-1/2 text-center whitespace-normal ${
                role === "tehnician" &&
                (!equipmentVerified || (lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true))
                  ? "relative"
                  : ""
              }`}
            >
              {role === "tehnician" && !equipmentVerified && <Lock className="h-3 w-3 absolute right-2" />}
              {role === "tehnician" &&
                equipmentVerified &&
                lucrare.statusLucrare === "Finalizat" &&
                lucrare.raportGenerat === true && <CheckCircle className="h-3 w-3 absolute right-2" />}
              Intervenție
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="detalii" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Detalii lucrare</CardTitle>
                <CardDescription>Informații despre lucrare</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Data emiterii:</p>
                    <p className="text-sm text-gray-500">{lucrare.dataEmiterii}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Data intervenție:</p>
                    <p className="text-sm text-gray-500">{lucrare.dataInterventie}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Tip lucrare:</p>
                  <p className="text-sm text-gray-500">{lucrare.tipLucrare}</p>
                </div>
                {lucrare.tipLucrare === "Intervenție în contract" && (
                  <div>
                    <p className="text-sm font-medium">Contract:</p>
                    <ContractDisplay contractId={lucrare.contract} />
                  </div>
                )}
                {lucrare.defectReclamat && (
                  <div>
                    <p className="text-sm font-medium">Defect reclamat:</p>
                    <p className="text-sm text-gray-500">{lucrare.defectReclamat}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Locație:</p>
                  <div className="flex items-start">
                    <div className="flex-grow">
                      <p className="text-sm text-gray-500">{lucrare.locatie}</p>
                      {locationAddress && (
                        <div className="mt-1">
                          <p className="text-xs italic text-gray-500 flex items-center mb-2">
                            <MapPin className="h-3 w-3 mr-1 inline-block" />
                            {locationAddress}
                          </p>
                          <div className="flex space-x-2 mt-2">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lucrare.locatie}, ${locationAddress}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                            >
                              <MapPin className="h-3 w-3 mr-1 inline-block" />
                              Google Maps
                            </a>
                            <a
                              href={`https://waze.com/ul?q=${encodeURIComponent(`${lucrare.locatie}, ${locationAddress}`)}&navigate=yes`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                            >
                              <MapPin className="h-3 w-3 mr-1 inline-block" />
                              Waze
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Echipament:</p>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">
                      {lucrare.echipament
                        ? `${lucrare.echipament} (Cod: ${lucrare.echipamentCod || "N/A"})`
                        : "Nespecificat"}
                    </p>
                    {lucrare.echipamentModel && (
                      <p className="text-sm text-gray-500 flex items-center">
                        <span className="font-medium text-xs mr-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          Model:
                        </span>
                        {lucrare.echipamentModel}
                      </p>
                    )}
                    {lucrare.statusEchipament && (
                      <p className="text-sm text-gray-500 flex items-center mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            lucrare.statusEchipament === "Funcțional"
                              ? "bg-green-100 text-green-800"
                              : lucrare.statusEchipament === "Parțial funcțional"
                                ? "bg-yellow-100 text-yellow-800"
                                : lucrare.statusEchipament === "Nefuncțional"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          Status: {lucrare.statusEchipament}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Descriere:</p>
                  <p className="text-sm text-gray-500">{lucrare.descriere || "Fără descriere"}</p>
                </div>
                {lucrare.constatareLaLocatie && (
                  <div>
                    <p className="text-sm font-medium">Constatare la locație:</p>
                    <p className="text-sm text-gray-500">{lucrare.constatareLaLocatie}</p>
                  </div>
                )}
                {lucrare.descriereInterventie && (
                  <div>
                    <p className="text-sm font-medium">Descriere intervenție:</p>
                    <p className="text-sm text-gray-500">{lucrare.descriereInterventie}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Status lucrare:</p>
                  <Badge
                    variant={
                      lucrare.statusLucrare.toLowerCase() === "în așteptare"
                        ? "warning"
                        : lucrare.statusLucrare.toLowerCase() === "în lucru"
                          ? "default"
                          : lucrare.statusLucrare.toLowerCase() === "finalizat"
                            ? "success"
                            : "secondary"
                    }
                  >
                    {lucrare.statusLucrare}
                  </Badge>
                </div>
                {role !== "tehnician" && (
                  <div>
                    <p className="text-sm font-medium">Status facturare:</p>
                    <Badge
                      variant={
                        lucrare.statusFacturare.toLowerCase() === "nefacturat"
                          ? "outline"
                          : lucrare.statusFacturare.toLowerCase() === "facturat"
                            ? "default"
                            : "success"
                      }
                    >
                      {lucrare.statusFacturare}
                    </Badge>
                  </div>
                )}
                {isCompletedWithReport && (
                  <div>
                    <p className="text-sm font-medium">Status preluare:</p>
                    {lucrare.preluatDispecer ? (
                      <Badge className="bg-green-100 text-green-800">Preluat de dispecer</Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800">În așteptare preluare</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informații client</CardTitle>
                <CardDescription>Detalii despre client și persoana de contact</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Client:</p>
                  <p className="text-sm text-gray-500">{lucrare.client}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Persoană contact:</p>
                  <p className="text-sm text-gray-500">{lucrare.persoanaContact}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Telefon:</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">{lucrare.telefon}</p>
                    <a
                      href={`tel:${formatPhoneForCall(lucrare.telefon)}`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                      aria-label={`Apelează ${lucrare.persoanaContact}`}
                      title={`Apelează ${lucrare.persoanaContact}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Tehnicieni asignați:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {lucrare.tehnicieni.map((tehnician, index) => (
                      <Badge key={index} variant="secondary">
                        {tehnician}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                {(role === "admin" || role === "dispecer") && (
                  <Button variant="outline" onClick={handleEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Editează
                  </Button>
                )}
                {role === "admin" && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Sigur doriți să ștergeți această lucrare?")) {
                        handleDeleteLucrare()
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Șterge
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {role === "tehnician" && (
          <TabsContent value="interventie" className="mt-4">
            {!equipmentVerified ? (
              <Card>
                <CardHeader>
                  <CardTitle>Intervenție blocată</CardTitle>
                  <CardDescription>Nu puteți începe intervenția până nu verificați echipamentul.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert variant="destructive">
                    <Lock className="h-4 w-4" />
                    <AlertTitle>Acces restricționat</AlertTitle>
                    <AlertDescription>
                      Trebuie să verificați echipamentul înainte de a putea începe intervenția. Accesați tab-ul
                      "Verificare Echipament" și scanați QR code-ul echipamentului.
                    </AlertDescription>
                  </Alert>
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => setActiveTab("verificare")}>Mergi la verificare echipament</Button>
                  </div>
                </CardContent>
              </Card>
            ) : lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true ? (
              <Card>
                <CardHeader>
                  <CardTitle>Intervenție finalizată</CardTitle>
                  <CardDescription>
                    Această lucrare este finalizată și raportul a fost generat. Nu mai puteți face modificări.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert variant="info">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Lucrare încheiată</AlertTitle>
                    <AlertDescription>
                      Ați finalizat această lucrare și ați generat raportul. Lucrarea așteaptă să fie preluată de
                      dispecer.
                      {lucrare.preluatDispecer
                        ? " Lucrarea a fost preluată de dispecer."
                        : " Lucrarea nu a fost încă preluată de dispecer."}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            ) : (
              <TehnicianInterventionForm
                lucrareId={lucrare.id!}
                initialData={{
                  descriereInterventie: lucrare.descriereInterventie,
                  constatareLaLocatie: lucrare.constatareLaLocatie,
                  statusLucrare: lucrare.statusLucrare,
                  raportGenerat: lucrare.raportGenerat,
                }}
                onUpdate={refreshLucrare}
                isCompleted={lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true}
              />
            )}
          </TabsContent>
        )}

        {role === "tehnician" && (
          <TabsContent value="verificare" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Verificare Echipament</CardTitle>
                <CardDescription>
                  Scanați QR code-ul echipamentului pentru a verifica dacă corespunde cu lucrarea.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {equipmentVerified ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle>Echipament verificat</AlertTitle>
                    <AlertDescription>
                      Echipamentul a fost verificat cu succes. Puteți continua intervenția.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                      <p className="mb-4 text-center">
                        Scanați QR code-ul echipamentului pentru a verifica dacă este cel corect pentru această lucrare.
                      </p>
                      <QRCodeScanner
                        expectedEquipmentCode={lucrare.echipamentCod}
                        expectedLocationName={lucrare.locatie}
                        expectedClientName={lucrare.client}
                        onScanSuccess={(data) => {
                          toast({
                            title: "Verificare reușită",
                            description: "Echipamentul scanat corespunde cu lucrarea.",
                          })
                        }}
                        onScanError={(error) => {
                          toast({
                            title: "Verificare eșuată",
                            description: error,
                            variant: "destructive",
                          })
                        }}
                        onVerificationComplete={handleVerificationComplete}
                      />
                    </div>
                    <Alert variant="warning">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Verificarea echipamentului este obligatorie înainte de începerea intervenției. Nu veți putea
                        continua dacă echipamentul scanat nu corespunde cu cel din lucrare.
                      </AlertDescription>
                    </Alert>
                  </>
                )}

                {equipmentVerified && (
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => setActiveTab("interventie")}>Mergi la intervenție</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </DashboardShell>
  )
}
