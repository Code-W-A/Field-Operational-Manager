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
import { ChevronLeft, FileText, Pencil, Trash2, AlertCircle, CheckCircle, Lock, MapPin, Phone } from "lucide-react"
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
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("detalii")
  const [equipmentVerified, setEquipmentVerified] = useState(false)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Extrage id și currentUser din context
  const id = params.id
  const currentUser = userData

  // Încărcăm datele lucrării și adresa locației
  useEffect(() => {
    const fetchLucrareAndLocationAddress = async () => {
      if (!id || !currentUser) return

      try {
        setIsLoading(true)
        const lucrareData = await getLucrareById(id as string)

        // Verifică dacă tehnicianul are acces la lucrarea finalizată
        if (currentUser.role === "tehnician" && lucrareData.raportGenerat && lucrareData.dataFinalizare) {
          // Redirecționează tehnicianul către lista de lucrări
          toast({
            title: "Acces restricționat",
            description: "Nu mai aveți acces la această lucrare deoarece a fost finalizată.",
            variant: "destructive",
          })
          router.push("/dashboard/lucrari")
          return
        }

        setLucrare(lucrareData)

        // Verificăm dacă echipamentul a fost deja verificat
        if (lucrareData?.equipmentVerified) {
          setEquipmentVerified(true)
        }

        // Obținem adresa locației
        if (lucrareData?.client && lucrareData?.locatie) {
          try {
            console.log(
              "Încercăm să obținem adresa pentru locația:",
              lucrareData.locatie,
              "a clientului:",
              lucrareData.client,
            )

            // Obținem toți clienții
            const clienti = await getClienti()
            console.log("Număr total de clienți:", clienti.length)

            // Găsim clientul după nume
            const client = clienti.find((c) => c.nume === lucrareData.client)

            if (client) {
              console.log("Client găsit:", client.nume, "ID:", client.id)
              console.log("Locații disponibile:", client.locatii ? client.locatii.length : 0)

              if (client.locatii && client.locatii.length > 0) {
                // Căutăm locația în lista de locații a clientului
                const locatie = client.locatii.find((loc) => loc.nume === lucrareData.locatie)

                if (locatie) {
                  console.log("Locație găsită:", locatie.nume, "Adresă:", locatie.adresa)
                  setLocationAddress(locatie.adresa)

                  // Actualizăm lucrarea cu ID-ul clientului și adresa locației pentru a le folosi în raport
                  await updateLucrare(params.id, {
                    clientId: client.id,
                    clientInfo: {
                      ...lucrareData.clientInfo,
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
        setIsLoading(false)
      }
    }

    fetchLucrareAndLocationAddress()
  }, [params.id, currentUser, router])

  // Verificăm dacă tehnicianul are acces la această lucrare
  useEffect(() => {
    if (
      !loading &&
      lucrare &&
      userData?.role === "tehnician" &&
      userData?.displayName &&
      !lucrare.tehnicieni.includes(userData.displayName)
    ) {
      // Tehnicianul nu este alocat la această lucrare, redirecționăm la dashboard
      toast({
        title: "Acces restricționat",
        description: "Nu aveți acces la această lucrare.",
        variant: "destructive",
      })
      router.push("/dashboard")
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
    } catch (error) {
      console.error("Eroare la reîncărcarea lucrării:", error)
    }
  })

  // Funcție pentru a actualiza starea de verificare a echipamentului
  const handleVerificationComplete = useStableCallback(async (success: boolean) => {
    if (!lucrare?.id) return

    if (success) {
      setEquipmentVerified(true)

      // Actualizăm lucrarea în baza de date
      try {
        await updateLucrare(lucrare.id, {
          ...lucrare,
          equipmentVerified: true,
          equipmentVerifiedAt: new Date().toISOString(),
          equipmentVerifiedBy: userData?.displayName || "Tehnician necunoscut",
        })

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

  return (
    <DashboardShell>
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/lucrari")}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" /> Generează raport
          </Button>
        </div>
      </DashboardHeader>

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          /*   ↘ container flexibil, se împachetează și își calculează înălțimea
       ↘ păstrăm fundalul gri și padding-ul original  */
          className="inline-flex w-full flex-wrap gap-2 h-auto
             bg-muted p-1 rounded-md text-muted-foreground
             md:flex-nowrap md:w-auto"
        >
          {/* ------------ 1. Detalii (50 %) ------------------------------- */}
          <TabsTrigger value="detalii" className="flex-1 basis-1/2 text-center whitespace-normal">
            Detalii&nbsp;Lucrare
          </TabsTrigger>

          {/* ------------ 3. Verificare Echipament (100 % pe mobil) ------- */}
          {role === "tehnician" && (
            <TabsTrigger value="verificare" className="basis-full md:basis-auto text-center whitespace-normal">
              Confirmare echipament
            </TabsTrigger>
          )}
          {/* ------------ 2. Intervenție (50 %) --------------------------- */}
          {role === "tehnician" && (
            <TabsTrigger
              value="interventie"
              disabled={role === "tehnician" && !equipmentVerified}
              className={`flex-1 basis-1/2 text-center whitespace-normal ${
                role === "tehnician" && !equipmentVerified ? "relative" : ""
              }`}
            >
              {role === "tehnician" && !equipmentVerified && <Lock className="h-3 w-3 absolute right-2" />}
              Intervenție
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="detalii" className="mt-4">
          {lucrare && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Lucrare #{lucrare.numarComanda}</h1>

                {lucrare.raportGenerat && lucrare.dataFinalizare && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-md">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Lucrare finalizată cu raport generat</span>
                  </div>
                )}
              </div>

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
                      <p className="text-sm text-gray-500">
                        {lucrare.echipament
                          ? `${lucrare.echipament} (Cod: ${lucrare.echipamentCod || "N/A"})`
                          : "Nespecificat"}
                      </p>
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
                            : lucrare.statusLucrare.toLowerCase() === "în curs"
                              ? "default"
                              : "success"
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
            </div>
          )}
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
            ) : (
              <TehnicianInterventionForm
                lucrareId={lucrare.id!}
                initialData={{
                  descriereInterventie: lucrare.descriereInterventie,
                  statusLucrare: lucrare.statusLucrare,
                }}
                onUpdate={refreshLucrare}
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
