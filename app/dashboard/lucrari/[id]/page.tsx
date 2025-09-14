"use client"

import { useState, useEffect, useCallback, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { OfferEditorDialog } from "./offer-editor-dialog"
import { DownloadHistory } from "@/components/download-history"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  RefreshCw,
  Archive,
  Clock,
  Download,
  Mail,
} from "lucide-react"
import { getLucrareById, deleteLucrare, updateLucrare, getClienti } from "@/lib/firebase/firestore"
import { WORK_STATUS } from "@/lib/utils/constants"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { DocumentUpload } from "@/components/document-upload"
import { ImageDefectViewer } from "@/components/image-defect-viewer"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatDate, formatTime, calculateDuration } from "@/lib/utils/time-format"
// Adăugăm importurile pentru calculul garanției
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"
import { ReinterventionReasonDialog } from "@/components/reintervention-reason-dialog"
import { PostponeWorkDialog } from "@/components/postpone-work-dialog"
import { ModificationBanner } from "@/components/modification-banner"
import { useModificationDetails } from "@/hooks/use-modification-details"
import { db } from "@/lib/firebase/config"
import { collection, query, where, getDocs } from "firebase/firestore"

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cif || "N/A"
}

export default function LucrarePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  
  // Unwrap params using React.use() for Next.js 15
  const { id: paramsId } = use(params)
  
  // Detectăm parametrul modificationId din URL
  const modificationId = searchParams.get('modificationId')
  const { modification, loading: modificationLoading } = useModificationDetails(modificationId)
  
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("detalii")
  const [isReinterventionReasonDialogOpen, setIsReinterventionReasonDialogOpen] = useState(false)

  const [equipmentVerified, setEquipmentVerified] = useState(false)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isOfferEditorOpen, setIsOfferEditorOpen] = useState(false)
  const [reinterventii, setReinterventii] = useState<Lucrare[]>([])
  const [loadingReinterventii, setLoadingReinterventii] = useState(false)
  const [clientData, setClientData] = useState<any>(null)
  // Blocare scanare dacă tehnicianul are deja altă lucrare "În lucru"
  const [otherActiveWork, setOtherActiveWork] = useState<null | { id: string; numar: string; client?: string; locatie?: string }>(null)
  const [checkingOtherActive, setCheckingOtherActive] = useState(false)

  // Funcție pentru încărcarea reintervențiilor derivate din lucrarea curentă
  const loadReinterventii = useCallback(async (lucrareId: string) => {
    if (!lucrareId) return
    
    setLoadingReinterventii(true)
    try {
      const lucrariCollection = collection(db, "lucrari")
      const q = query(lucrariCollection, where("lucrareOriginala", "==", lucrareId))
      const querySnapshot = await getDocs(q)
      
      const reinterventiiData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lucrare[]
      
      setReinterventii(reinterventiiData)
    } catch (error) {
      console.error("Eroare la încărcarea reintervențiilor:", error)
    } finally {
      setLoadingReinterventii(false)
    }
  }, [])

  // Încărcăm reintervențiile când se încarcă lucrarea
  useEffect(() => {
    if (lucrare?.id) {
      loadReinterventii(lucrare.id)
    }
  }, [lucrare?.id, loadReinterventii])

  // State pentru informațiile de garanție
  const [equipmentData, setEquipmentData] = useState<Echipament | null>(null)
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  
  // State pentru debounce-ul numărului facturii
  const [invoiceNumberTimeout, setInvoiceNumberTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // State pentru afișarea banner-ului de modificare
  const [showModificationBanner, setShowModificationBanner] = useState(true)

  // Încărcăm datele lucrării și adresa locației
  useEffect(() => {
    const fetchLucrareAndLocationAddress = async () => {
      try {
        // Obținem datele lucrării
        const data = await getLucrareById(paramsId)
        setLucrare(data)

        // AUTO-MARK AS READ: Marcăm lucrarea ca citită când utilizatorul o vizualizează
        if (data && userData?.uid) {
          const isNotificationRead = data.notificationRead === true || 
                                     (Array.isArray(data.notificationReadBy) && 
                                      data.notificationReadBy.includes(userData.uid))
          
          // Dacă lucrarea nu a fost citită de utilizatorul curent, o marcăm ca citită
          if (!isNotificationRead) {
            try {
              const currentReadBy = Array.isArray(data.notificationReadBy) ? data.notificationReadBy : []
              const updatedReadBy = [...new Set([...currentReadBy, userData.uid])]
              
              // Marcăm lucrarea ca citită fără a afișa notificări utilizatorului
              // Folosim parametrul silent pentru a nu modifica data ultimei modificări
              await updateLucrare(paramsId, {
                notificationReadBy: updatedReadBy,
                notificationRead: true
              }, undefined, undefined, true) // silent = true
              
              console.log(`✅ Lucrare ${paramsId} marcată ca citită automat pentru ${userData.uid}`)
            } catch (error) {
              // Nu afișăm eroarea utilizatorului - e o operațiune de background
              console.warn("Nu s-a putut marca lucrarea ca citită:", error)
            }
          }
        }

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
              console.log("DEBUG - Client data from lucrare page:", client)
              console.log("DEBUG - client.cui:", client.cui)
              console.log("DEBUG - client.cif:", (client as any).cif)
              
              // Salvăm datele clientului pentru afișare
              setClientData(client)

              if (client.locatii && client.locatii.length > 0) {
                // Căutăm locația în lista de locații a clientului
                const locatie = client.locatii.find((loc) => loc.nume === data.locatie)

                if (locatie) {
                  console.log("Locație găsită:", locatie.nume, "Adresă:", locatie.adresa)
                  setLocationAddress(locatie.adresa)

                  // Verificăm dacă informațiile lipsesc înainte de a actualiza
                  const needsLocationAddress = !data.clientInfo?.locationAddress
                  const needsCif = !data.clientInfo?.cui
                  const needsClientAddress = !data.clientInfo?.adresa

                  // Actualizăm lucrarea DOAR dacă informațiile lipsesc (pentru a evita actualizări inutile)
                  if (needsLocationAddress || needsCif || needsClientAddress) {
                    console.log("Actualizare necesară - informații lipsă:", {
                      needsLocationAddress,
                      needsCif,
                      needsClientAddress
                    })
                    
                  // Folosim parametrul silent pentru completarea automată a informațiilor clientului
                  // (nu este o modificare reală făcută de utilizator)
                  await updateLucrare(paramsId, {
                    clientInfo: {
                      ...data.clientInfo,
                        cui: (client as any).cif,
                      adresa: client.adresa,
                      locationAddress: locatie.adresa,
                    },
                  }, undefined, undefined, true) // silent = true
                  } else {
                    console.log("Nu este necesară actualizarea - toate informațiile sunt deja prezente")
                  }
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

        // Calculăm informațiile de garanție pentru lucrările de tip "Intervenție în garanție"
        if (data && data.tipLucrare === "Intervenție în garanție" && data.client && data.locatie && data.echipament) {
          try {
            const clienti = await getClienti()
            const client = clienti.find((c) => c.nume === data.client)
            
            if (client && client.locatii) {
              const locatie = client.locatii.find((loc) => loc.nume === data.locatie)
              
              if (locatie && locatie.echipamente) {
                // Căutăm echipamentul după numele sau codul echipamentului
                const echipament = locatie.echipamente.find(
                  (eq) => eq.nume === data.echipament || eq.cod === data.echipamentCod
                )
                
                if (echipament) {
                  console.log("Echipament găsit pentru calculul garanției:", echipament)
                  setEquipmentData(echipament)
                  
                  // Calculăm informațiile de garanție
                  const warranty = getWarrantyDisplayInfo(echipament)
                  setWarrantyInfo(warranty)
                  console.log("Informații garanție calculate:", warranty)
                } else {
                  console.log("Echipamentul nu a fost găsit pentru calculul garanției")
                }
              }
            }
          } catch (error) {
            console.error("Eroare la calculul garanției:", error)
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
  }, [paramsId])

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
  const refreshLucrare = useStableCallback(async (preserveActiveTab = false) => {
    try {
      const data = await getLucrareById(paramsId)
      setLucrare(data)

      if (data) {
        // Actualizăm starea de verificare a echipamentului
        if (data.equipmentVerified) {
          setEquipmentVerified(true)
        }

        // Actualizăm tab-ul activ doar dacă nu dorim să-l păstrăm și dacă este cazul
        if (!preserveActiveTab && data.statusLucrare === "Finalizat" && activeTab !== "detalii") {
          setActiveTab("detalii")
        }
      }

      console.log("Refreshed lucrare data:", data)

      // Toast doar dacă nu păstrăm tab-ul (pentru a evita notificări inutile)
      if (!preserveActiveTab) {
        toast({
          title: "Actualizat",
          description: "Datele lucrării au fost actualizate.",
        })
      }
    } catch (error) {
      console.error("Eroare la reîncărcarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut reîncărca datele lucrării.",
        variant: "destructive",
      })
    }
  })

  // Detectăm întoarcerea de la pagina de raport prin focus pe fereastră
  useEffect(() => {
    let hasFocus = true
    
    const handleFocus = () => {
      // Doar dacă fereastra a fost într-adevăr blurred înainte (adică s-a navigat la altă pagină)
      if (!hasFocus) {
        // Delay scurt pentru a permite actualizarea în Firebase
        setTimeout(() => {
          refreshLucrare()
        }, 500)
      }
      hasFocus = true
    }
    
    const handleBlur = () => {
      hasFocus = false
    }
    
    // Adăugăm listener-ii pentru focus/blur pe fereastră
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    
    // Cleanup la unmount
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [refreshLucrare])

  // Modificăm funcția handleVerificationComplete pentru a actualiza și statusul lucrării la "În lucru"
  // când tehnicianul scanează cu succes codul QR al echipamentului

  // Găsește o altă lucrare "În lucru" pentru același tehnician (exclus lucrarea curentă)
  const findOtherActiveWorkForTechnician = useStableCallback(async (): Promise<null | { id: string; numar: string; client?: string; locatie?: string }> => {
    try {
      if (!userData?.displayName) return null
      const lucrariRef = collection(db, "lucrari")
      const q = query(
        lucrariRef,
        where("tehnicieni", "array-contains", userData.displayName),
        where("statusLucrare", "==", WORK_STATUS.IN_PROGRESS)
      )
      const snap = await getDocs(q)
      if (snap.empty) return null
      for (const d of snap.docs) {
        if (d.id !== lucrare?.id) {
          const data: any = d.data()
          const numar = data?.numarRaport || data?.number || d.id
          const client = typeof data?.client === 'string'
            ? data.client
            : (data?.client?.nume || data?.client?.name || data?.clientInfo?.nume || data?.clientInfo?.name)
          const locatie = data?.locatie || data?.location
          return { id: d.id, numar: String(numar), client, locatie }
        }
      }
      return null
    } catch (e) {
      console.warn("Nu s-a putut verifica existența unei alte lucrări active:", e)
      return null
    }
  })

  // La intrarea pe tabul de verificare, dacă tehnicianul are deja o altă lucrare "În lucru",
  // ascundem scannerul și afișăm mesaj cu link către lucrarea deschisă.
  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        // Se aplică doar pentru tehnicieni, pe lucrări neamânate și când echipamentul NU e verificat încă
        if (role !== "tehnician" || !lucrare || equipmentVerified || lucrare.statusLucrare === WORK_STATUS.POSTPONED) {
          setOtherActiveWork(null)
          return
        }
        setCheckingOtherActive(true)
        const other = await findOtherActiveWorkForTechnician()
        if (mounted) setOtherActiveWork(other)
      } finally {
        if (mounted) setCheckingOtherActive(false)
      }
    }
    check()
    return () => { mounted = false }
  }, [role, lucrare?.id, lucrare?.statusLucrare, equipmentVerified, findOtherActiveWorkForTechnician])

  const handleVerificationComplete = useStableCallback(async (success: boolean) => {
    if (!lucrare?.id) return

    if (success) {
      // Guard: dacă tehnicianul are deja altă lucrare "În lucru", blocăm verificarea
      const otherActive = await findOtherActiveWorkForTechnician()
      if (otherActive) {
        const url = `${window.location.origin}/dashboard/lucrari/${otherActive.id}`
        const context = [
          otherActive.numar ? `Număr: ${otherActive.numar}` : null,
          otherActive.client ? `Client: ${otherActive.client}` : null,
          otherActive.locatie ? `Locație: ${otherActive.locatie}` : null,
        ].filter(Boolean).join(" | ")
        toast({
          title: "Ai deja o lucrare deschisă",
          description: `${context ? context + "\n" : ""}Finalizează sau închide lucrarea deschisă înainte de a începe alta. Link: ${url}`,
        })
        return
      }

      setEquipmentVerified(true)

      // Actualizăm lucrarea în baza de date
      try {
        // Record arrival time
        const now = new Date()
        const timpSosire = now.toISOString()
        const dataSosire = formatDate(now)
        const oraSosire = formatTime(now)
        
        // DEBUGGING PENTRU TIMPI CORUPȚI - VERIFICARE LA SETARE timpSosire
        console.log("🕐 SETARE timpSosire la scanarea QR:")
        console.log("📅 Data curentă (now):", now)
        console.log("📅 Data curentă (toLocaleString):", now.toLocaleString('ro-RO'))
        console.log("📅 Anul curent:", now.getFullYear())
        console.log("🔢 timpSosire (ISO):", timpSosire)
        console.log("🔢 dataSosire (formatat):", dataSosire)
        console.log("🔢 oraSosire (formatat):", oraSosire)
        
        // Verificare dacă timpii generați sunt în viitor
        if (now.getFullYear() > new Date().getFullYear()) {
          console.log("🚨 ALERTĂ: Data generată pentru timpSosire este în viitor!")
          console.log("🚨 Aceasta este o problemă critică!")
        }

        // Pregătim datele pentru actualizare
        const updateData = {
          ...lucrare,
          equipmentVerified: true,
          equipmentVerifiedAt: new Date().toISOString(),
          equipmentVerifiedBy: userData?.displayName || "Tehnician necunoscut",
          timpSosire,
          dataSosire,
          oraSosire,
        }

        // Actualizăm statusul lucrării la "În lucru" doar dacă statusul curent este "Listată" sau "Atribuită"
        // ȘI raportul nu a fost încă generat (pentru a nu suprascrie statusul "Finalizat")
        if ((lucrare.statusLucrare === "Listată" || lucrare.statusLucrare === "Atribuită") && !lucrare.raportGenerat) {
          updateData.statusLucrare = "În lucru"
        }

        // DEBUGGING ÎNAINTE DE SALVAREA timpSosire în Firestore
        console.log("🔍 SALVARE timpSosire în Firestore prin updateLucrare:")
        console.log("📦 updateData pentru Firestore:", {
          timpSosire: updateData.timpSosire,
          dataSosire: updateData.dataSosire,
          oraSosire: updateData.oraSosire,
          equipmentVerified: updateData.equipmentVerified,
          statusLucrare: updateData.statusLucrare
        })
        
        // Verificare finală pentru timpSosire înainte de salvare
        const currentYear = new Date().getFullYear()
        const sosireYear = new Date(updateData.timpSosire).getFullYear()
        if (sosireYear > currentYear) {
          console.log("🚨🚨🚨 ALERTĂ FINALĂ: timpSosire în viitor detectat înainte de salvare!")
          console.log("🚨 Anul curent:", currentYear)
          console.log("🚨 Anul timpSosire:", sosireYear)
          console.log("🚨 Această problemă va corupe datele în Firestore!")
        }
        
        await updateLucrare(lucrare.id, updateData)
        console.log("✅ timpSosire salvat cu succes în Firestore")

        // Actualizăm și starea locală dacă am modificat statusul
        if ((lucrare.statusLucrare === "Listată" || lucrare.statusLucrare === "Atribuită") && !lucrare.raportGenerat) {
          setLucrare((prev) =>
            prev
              ? {
                  ...prev,
                  statusLucrare: "În lucru",
                  timpSosire,
                  dataSosire,
                  oraSosire,
                }
              : null,
          )
        } else {
          setLucrare((prev) =>
            prev
              ? {
                  ...prev,
                  timpSosire,
                  dataSosire,
                  oraSosire,
                }
              : null,
          )
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
      await updateLucrare(lucrare.id, { preluatDispecer: true, preluatDe: userData?.displayName || userData?.email || "Dispecer" })

      // Actualizăm lucrarea local
      setLucrare((prev) => (prev ? { ...prev, preluatDispecer: true, preluatDe: userData?.displayName || userData?.email || "Dispecer" } : null))

      toast({
        title: "Lucrare preluată",
        description: "Lucrarea a fost marcată ca preluată de dispecer.",
        variant: "default",
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
  
  // Funcție pentru a verifica dacă lucrarea necesită reintervenție
  const needsReintervention = (lucrare: any) => {
    // Reintervenția este disponibilă doar pentru lucrări cu status finalizare "NEFINALIZAT"
    return lucrare.statusFinalizareInterventie === "NEFINALIZAT"
  }
  
  // Funcție pentru a gestiona reintervenția - deschide dialogul de motive
  const handleReintervention = () => {
    if (!lucrare) return
    
    // Deschidem dialogul pentru selectarea motivelor reintervenției
    setIsReinterventionReasonDialogOpen(true)
  }

  // Funcție pentru a continua cu reintervenția după selectarea motivelor
  const handleReinterventionAfterReasons = () => {
    if (!lucrare) return
    
    // Redirecționăm către pagina principală cu parametru pentru reintervenție
    router.push(`/dashboard/lucrari?reintervention=${lucrare.id}`)
  }

  return (
    <TooltipProvider>
      <DashboardShell>
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/lucrari")}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          <Button 
            onClick={handleGenerateReport}
            disabled={role === "tehnician" && !equipmentVerified}
          >
            <FileText className="mr-2 h-4 w-4" /> Generează raport
          </Button>

          {/* Buton pentru reintervenție - doar pentru admin/dispecer și dacă îndeplinește condițiile */}
          {isAdminOrDispatcher && needsReintervention(lucrare) && (
            <Button
              variant="outline"
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
              onClick={handleReintervention}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reintervenție
            </Button>
          )}

          {/* Buton pentru arhivare - doar pentru admin/dispecer și lucrări finalizate, cu condiții de activare */}
          {isAdminOrDispatcher && lucrare.statusLucrare === "Finalizat" && (() => {
            const hasInvoiceDoc = Boolean((lucrare as any)?.facturaDocument)
            const noInvoicingSelected = (lucrare.statusFacturare === "Nu se facturează")
            const isPickedUp = lucrare.preluatDispecer === true
            const canArchive = isPickedUp && (hasInvoiceDoc || noInvoicingSelected)
            const archiveReason = !isPickedUp
              ? "Necesită preluare de dispecer înainte de arhivare"
              : (!hasInvoiceDoc && !noInvoicingSelected)
                ? "Încărcați factura sau marcați 'Nu se facturează' pentru a arhiva"
                : "Arhivează lucrarea finalizată"

            return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-gray-600 border-gray-200 hover:bg-gray-50"
                      disabled={!canArchive}
                    onClick={async () => {
                        if (!canArchive) return
                      if (window.confirm("Sigur doriți să arhivați această lucrare? Lucrarea va fi mutată în secțiunea Arhivate.")) {
                        try {
                          await updateLucrare(paramsId, { statusLucrare: WORK_STATUS.ARCHIVED })
                            toast({ title: "Succes", description: "Lucrarea a fost arhivată cu succes." })
                          router.push("/dashboard/lucrari")
                        } catch (error) {
                          console.error("Eroare la arhivare:", error)
                            toast({ title: "Eroare", description: "Nu s-a putut arhiva lucrarea.", variant: "destructive" })
                        }
                      }
                    }}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Arhivează
                  </Button>
                </TooltipTrigger>
                  <TooltipContent>{archiveReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            )
          })()}

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

      {/* Banner pentru modificarea recentă din notificări */}
      {modification && showModificationBanner && (
        <ModificationBanner
          modification={modification}
          onDismiss={() => setShowModificationBanner(false)}
        />
      )}

      {role === "tehnician" && lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && (
        <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200">
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
      {role === "tehnician" && !equipmentVerified && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
        <Alert variant="default" className="mb-4 bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertTitle>Verificare echipament necesară</AlertTitle>
          <AlertDescription>
            Trebuie să verificați echipamentul înainte de a putea începe intervenția. Accesați tab-ul "Verificare
            Echipament".
          </AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner de confirmare dacă echipamentul a fost verificat */}
      {role === "tehnician" && equipmentVerified && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
        <Alert variant="default" className="mb-4 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Echipament verificat</AlertTitle>
          <AlertDescription>Echipamentul a fost verificat cu succes. Puteți continua intervenția.</AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner pentru admin/dispecer care arată starea de preluare */}
      {isAdminOrDispatcher && (isCompletedWithReport || lucrare.statusLucrare === WORK_STATUS.POSTPONED) && (
        <Alert
          variant="default"
          className={`mb-4 ${lucrare.preluatDispecer ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}
        >
          {lucrare.preluatDispecer ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          )}
          <AlertTitle>{lucrare.preluatDispecer ? "Lucrare preluată" : (lucrare.statusLucrare === WORK_STATUS.POSTPONED ? "Lucrare amânată" : "Lucrare în așteptare")}</AlertTitle>
          <AlertDescription>
            {lucrare.preluatDispecer
              ? `Această lucrare a fost preluată de dispecer${lucrare.preluatDe ? ` (${lucrare.preluatDe})` : ""} și nu mai este vizibilă pentru tehnician.`
              : (lucrare.statusLucrare === WORK_STATUS.POSTPONED
                  ? "Această lucrare este amânată și în așteptare de preluare de către dispecer."
                  : "Această lucrare nu a fost încă preluată de dispecer și este încă vizibilă pentru tehnician.")}
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
          {role === "tehnician" && !lucrare.raportGenerat && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
            <TabsTrigger value="verificare" className="basis-full md:basis-auto text-center whitespace-normal">
              Verificare echipament
            </TabsTrigger>
          )}
          {/* ------------ 2. Intervenție (50 %) --------------------------- */}
          {role === "tehnician" && !lucrare.raportGenerat && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
            <TabsTrigger
              value="interventie"
              disabled={
                role === "tehnician" &&
                 (!equipmentVerified || (lucrare.statusLucrare === "Finalizat" && Boolean(lucrare.raportGenerat)))
              }
              className={`flex-1 basis-1/2 text-center whitespace-normal ${
                role === "tehnician" &&
                (!equipmentVerified || (lucrare.statusLucrare === "Finalizat" && Boolean(lucrare.raportGenerat)))
                  ? "relative"
                  : ""
              }`}
            >
              {role === "tehnician" && !equipmentVerified && <Lock className="h-3 w-3 absolute right-2" />}
              {role === "tehnician" &&
                equipmentVerified &&
                lucrare.statusLucrare === "Finalizat" &&
                lucrare.raportGenerat && <CheckCircle className="h-3 w-3 absolute right-2" />}
              Intervenție
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="detalii" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                <CardTitle>Detalii lucrare</CardTitle>
                <CardDescription>Informații despre lucrare</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {(role === "admin" || role === "dispecer") && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={handleEdit}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editează</TooltipContent>
                      </Tooltip>
                    )}
                    {role === "admin" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => {
                              if (window.confirm("Sigur doriți să ștergeți această lucrare?")) {
                                handleDeleteLucrare()
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Șterge</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-3 mt-4">
                  <div className="mb-2">
                    <div className="font-medium mb-1">Data emiterii:</div>
                    <div className="text-gray-500">{lucrare.dataEmiterii}</div>
                  </div>
                  <div className="mb-2">
                    <div className="font-medium mb-1">Data intervenție:</div>
                    <div className="text-gray-500">{lucrare.dataInterventie}</div>
                </div>
                {lucrare.timpSosire && (
                    <div className="mb-2">
                      <div className="font-medium mb-1">Sosire la locație:</div>
                      <div className="text-gray-500">{lucrare.dataSosire} {lucrare.oraSosire}</div>
                  </div>
                )}
                {lucrare.timpPlecare && (
                    <div className="mb-2">
                      <div className="font-medium mb-1">Plecare de la locație:</div>
                      <div className="text-gray-500">{lucrare.dataPlecare} {lucrare.oraPlecare}</div>
                  </div>
                )}
                {lucrare.timpSosire && lucrare.timpPlecare && (
                    <div className="mb-2">
                      <div className="font-medium mb-1">Durata intervenție:</div>
                      <div className="text-gray-500">
                      {lucrare.durataInterventie || calculateDuration(lucrare.timpSosire, lucrare.timpPlecare)}
                      </div>
                  </div>
                )}
                  <div className="mb-2">
                    <div className="font-medium mb-1">Tip lucrare:</div>
                    <div className="text-gray-500">{lucrare.tipLucrare}</div>
                </div>
                {lucrare.tipLucrare === "Intervenție în contract" && (
                    <div className="mb-2">
                      <div className="font-medium mb-1">Contract:</div>
                      <div className="text-gray-500">
                    <ContractDisplay contractId={lucrare.contract} />
                      </div>
                  </div>
                )}
                  <div className={`mb-2 ${lucrare.tipLucrare === "Intervenție în contract" ? '' : 'col-span-2'}`}>
                    <div className="font-medium mb-1">Defect reclamat:</div>
                    <div className="text-gray-500">{lucrare.defectReclamat || "Nu a fost specificat"}</div>
                  </div>
                </div>

                {/* Tehnicieni asignați – mutat aici din cardul "Informații client" pentru a păstra layout-ul dorit */}
                <div className="mt-4 text-base flex flex-wrap gap-y-3 items-center mb-4">
                  <span className="font-semibold mr-3">Tehnicieni asignați:</span>
                  <div className="flex flex-wrap gap-3">
                    {lucrare.tehnicieni.map((tehnician, index) => (
                      <Badge key={index} variant="secondary" className="text-base px-4 py-2 font-semibold">
                        {tehnician}
                      </Badge>
                    ))}
                  </div>
                  </div>

                {/* Afișăm mesajul de reatribuire dacă există */}
                {lucrare.mesajReatribuire && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center space-x-2 mb-1">
                      <RefreshCw className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-medium text-blue-800">Lucrare reatribuită:</p>
                    </div>
                    <p className="text-sm text-blue-700">{lucrare.mesajReatribuire}</p>
                    {lucrare.lucrareOriginala && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-100"
                        onClick={() => router.push(`/dashboard/lucrari/${lucrare.lucrareOriginala}`)}
                      >
                        Vizualizează lucrarea originală
                      </Button>
                    )}
                  </div>
                )}

                {/* Afișăm informațiile de amânare dacă există */}
                {lucrare.statusLucrare === WORK_STATUS.POSTPONED && lucrare.motivAmanare && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                    <div className="flex items-center space-x-2 mb-2">
                      <Clock className="h-4 w-4 text-purple-600" />
                      <p className="text-sm font-medium text-purple-800">Lucrare amânată</p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium text-purple-700 mb-1">Motiv amânare:</p>
                        <p className="text-sm text-purple-700 bg-white/50 p-2 rounded border">
                          {lucrare.motivAmanare}
                        </p>
                      </div>
                      {lucrare.dataAmanare && (
                        <div className="flex flex-col sm:flex-row sm:justify-between text-xs text-purple-600">
                          <span>Amânată pe: {lucrare.dataAmanare}</span>
                          {lucrare.amanataDe && <span>de către: {lucrare.amanataDe}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Afișăm motivele reintervenției dacă există */}
                {lucrare.reinterventieMotiv && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                      <RefreshCw className="h-4 w-4 text-orange-600" />
                      <p className="text-sm font-medium text-orange-800">Motive reintervenție</p>
                      </div>
                      {/* Buton pentru navigare la lucrarea originală */}
                      {lucrare.lucrareOriginala && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/lucrari/${lucrare.lucrareOriginala}`)}
                          className="text-xs px-2 py-1 h-7 text-orange-700 border-orange-300 hover:bg-orange-100"
                        >
                          <ChevronLeft className="h-3 w-3 mr-1" />
                          Vezi lucrarea inițială
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        {lucrare.reinterventieMotiv.remediereNeconforma && (
                          <div className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 bg-red-600 rounded-full flex-shrink-0"></div>
                            <span className="text-red-700 font-medium">Remediere neconformă</span>
                          </div>
                        )}
                        {lucrare.reinterventieMotiv.necesitaTimpSuplimentar && (
                          <div className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 bg-orange-600 rounded-full flex-shrink-0"></div>
                            <span className="text-orange-700 font-medium">Necesită timp suplimentar</span>
                          </div>
                        )}
                        {lucrare.reinterventieMotiv.necesitaPieseSuplimentare && (
                          <div className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                            <span className="text-blue-700 font-medium">Necesită piese suplimentare</span>
                          </div>
                        )}
                      </div>
                      {lucrare.reinterventieMotiv.dataReinterventie && (
                        <div className="flex flex-col sm:flex-row sm:justify-between text-xs text-orange-600 mt-3 pt-2 border-t border-orange-200">
                          <span>Reintervenție decisă pe: {lucrare.reinterventieMotiv.dataReinterventie}</span>
                          {lucrare.reinterventieMotiv.decisaDe && <span>de către: {lucrare.reinterventieMotiv.decisaDe}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Afișăm reintervențiile derivate dacă există */}
                {reinterventii.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-800">
                          Reintervenții create ({reinterventii.length})
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {loadingReinterventii ? (
                        <p className="text-xs text-blue-600">Se încarcă reintervențiile...</p>
                      ) : (
                        <div className="grid gap-2">
                          {reinterventii.map((reinterventie) => (
                            <div
                              key={reinterventie.id}
                              className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs bg-blue-100 text-blue-800 border-blue-300"
                                  >
                                    {reinterventie.statusLucrare}
                                  </Badge>
                                  <span className="text-blue-700 font-medium">
                                    {reinterventie.dataInterventie}
                                  </span>
                                  {reinterventie.tehnicieni && reinterventie.tehnicieni.length > 0 && (
                                    <span className="text-xs text-blue-600">
                                      → {reinterventie.tehnicieni.join(", ")}
                                    </span>
                                  )}
                                </div>
                                {reinterventie.reinterventieMotiv && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    {reinterventie.reinterventieMotiv.remediereNeconforma && "Remediere neconformă "}
                                    {reinterventie.reinterventieMotiv.necesitaTimpSuplimentar && "Timp suplimentar "}
                                    {reinterventie.reinterventieMotiv.necesitaPieseSuplimentare && "Piese suplimentare"}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/dashboard/lucrari/${reinterventie.id}`)}
                                className="text-xs px-2 py-1 h-7 text-blue-700 border-blue-300 hover:bg-blue-100"
                              >
                                <ChevronLeft className="h-3 w-3 mr-1 rotate-180" />
                                Vezi reintervenția
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Separator />
                <div className="space-y-4">
                {/* Rând cu: Locație | Persoană contact (locație) | Telefon contact (locație) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
                  <div className="mb-2">
                    <div className="text-sm font-medium mb-1">Persoană contact (locație):</div>
                    <div className="text-sm text-gray-500">{lucrare.persoanaContact}</div>
                    {/* Email persoană de contact dacă există în clientData pentru locația curentă */}
                    {clientData?.locatii && (
                      () => {
                        const loc = clientData.locatii.find((l: any) => l.nume === lucrare.locatie)
                        const contact = loc?.persoaneContact?.find((c: any) => c.nume === lucrare.persoanaContact)
                        return contact?.email ? (
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <span>{contact.email}</span>
                            <a
                              href={`mailto:${contact.email}`}
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                              aria-label={`Scrie email către ${contact.email}`}
                              title={`Scrie email către ${contact.email}`}
                            >
                              <Mail className="h-3 w-3" />
                            </a>
                          </div>
                        ) : null
                      }
                    )()}
                  </div>
                  <div className="mb-2">
                    <div className="text-sm font-medium mb-1">Telefon contact (locație):</div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      {lucrare.telefon}
                      <a
                        href={`tel:${formatPhoneForCall(lucrare.telefon)}`}
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                        aria-label={`Apelează ${lucrare.persoanaContact}`}
                        title={`Apelează ${lucrare.persoanaContact}`}
                      >
                        <Phone className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                
                </div>

                {/* Echipament sub rândul cu locația */}
                <div>
                  <p className="text-sm font-medium">Echipament:</p>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">
                      {lucrare.echipament ? `${lucrare.echipament}` : "Nespecificat"}
                    </p>
                    {role !== "tehnician" && lucrare.echipamentCod && (
                      <p className="text-sm text-gray-500 flex items-center">
                        <span className="font-medium text-xs mr-2 bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Cod:</span>
                        {lucrare.echipamentCod}
                      </p>
                    )}
                    {lucrare.echipamentModel && (
                      <p className="text-sm text-gray-500 flex items-center">
                        <span className="font-medium text-xs mr-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Model:</span>
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
                </div>
                  
                <div className="mt-2">
                  {lucrare.descriere ? (
                    <>
                      <p className="text-sm font-medium">Notă internă:</p>
                      <p className="text-sm text-gray-500">{lucrare.descriere || "Fără descriere"}</p>
                    </>
                  ) : (
                    <p className="text-sm font-medium">Fără notă</p>
                  )}
                </div>

                {lucrare.constatareLaLocatie && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Constatare la locație:</p>
                    <p className="text-sm text-gray-500">{lucrare.constatareLaLocatie}</p>
                  </div>
                )}
                  
                {lucrare.descriereInterventie && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Descriere intervenție:</p>
                    <p className="text-sm text-gray-500">{lucrare.descriereInterventie}</p>
                  </div>
                )}
                  
            
                  
                {((lucrare.statusOferta === "DA" || lucrare.statusOferta === "OFERTAT") || 
                  (lucrare.statusOferta === undefined && lucrare.necesitaOferta)) && 
                  lucrare.comentariiOferta && (
                  <div>
                    <p className="text-sm font-medium">Comentarii ofertă:</p>
                    <p className="text-sm text-gray-500">{lucrare.comentariiOferta}</p>
                  </div>
                )}
                  
            
                
                {/* Afișăm numărul raportului dacă a fost generat */}
                {lucrare.raportGenerat && lucrare.numarRaport && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Număr raport:</p>
                    <p className="text-sm font-medium text-purple-800 bg-purple-50 px-2 py-1 rounded border border-purple-200 inline-block">
                      {lucrare.numarRaport}
                    </p>
                  </div>
                )}
                {/* Informații despre garanție pentru lucrările de tip "Intervenție în garanție" */}
                {lucrare.tipLucrare === "Intervenție în garanție" && warrantyInfo && (
                  <div className="mt-4 p-4 border rounded-md bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">G</span>
                      </div>
                      <h4 className="text-sm font-medium text-blue-900">Informații Garanție Echipament</h4>
                      <Badge className={warrantyInfo.statusBadgeClass}>
                        {warrantyInfo.statusText}
                      </Badge>
                    </div>

                    {/* Calculul automat al garanției */}
                    <div className="p-3 bg-white rounded-md border mb-3">
                      <h5 className="font-medium text-sm mb-2">Calculul automat al garanției:</h5>
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
                      </div>
                )}

                {/* Secțiunea de management a statusurilor a fost mutată în cardul "Informații client" pentru un layout mai clar */}

                {/* Eliminat: Documente PDF integrate în acest card. Mutat într-un card separat, mai jos. */}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informații client</CardTitle>
                <CardDescription>Detalii despre client și persoana de contact</CardDescription>
              </CardHeader>
              <CardContent>
             
                <div className="text-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-3">
                  <div className="mb-2">
                    <div className="font-medium mb-1">Client:</div>
                    <div className="text-gray-500">{lucrare.client}</div>
                  </div>
                  {clientData && (
                    <>
                      <div className="mb-2">
                        <div className="font-medium mb-1">Telefon Principal:</div>
                        <div className="text-gray-500 flex items-center gap-2">
                          {clientData.telefon || "N/A"}
                          {clientData.telefon && (
                            <a
                              href={`tel:${formatPhoneForCall(clientData.telefon)}`}
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                              aria-label={`Apelează ${clientData.telefon}`}
                              title={`Apelează ${clientData.telefon}`}
                            >
                              <Phone className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="mb-2">
                        <div className="font-medium mb-1">Email (client):</div>
                        <div className="text-gray-500 flex items-center gap-2">
                          {clientData.email || "N/A"}
                          {clientData.email && (
                            <a
                              href={`mailto:${clientData.email}`}
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                              aria-label={`Scrie email către ${clientData.email}`}
                              title={`Scrie email către ${clientData.email}`}
                            >
                              <Mail className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="mb-2">
                      <div className="font-medium mb-1">Reprezentant Firmă:</div>
                      <div className="text-gray-500">{clientData.reprezentantFirma || "N/A"}{clientData.functieReprezentant ? `, ${clientData.functieReprezentant}` : ""}</div>
                      </div>
                      <div className="mb-2">
                        <div className="font-medium mb-1">CUI/CIF:</div>
                        <div className="text-gray-500">{(clientData as any)?.cif || "N/A"}</div>
                      </div>
                    </>
                  )}
              
                </div>
                <Separator className="my-4" />
   {/* Rezumat statusuri – un singur rând, 4 coloane: titlu sus, valoare sub titlu */}
   <div className="mb-4 grid grid-cols-4 gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">Status lucrare</div>
                    <div className="mt-1"><Badge>{lucrare.statusLucrare}</Badge></div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">Status ofertă</div>
                    <div className="mt-1">
                      <Badge variant="outline">
                        {lucrare.statusOferta || (lucrare.necesitaOferta ? "DA" : "NU")}
                      </Badge>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">Status facturare</div>
                    <div className="mt-1"><Badge variant="outline">{lucrare.statusFacturare}</Badge></div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">Status preluare</div>
                    <div className="mt-1">
                      <Badge variant="outline">
                        {isCompletedWithReport
                          ? (lucrare.preluatDispecer ? `Preluat${lucrare.preluatDe ? ` de ${lucrare.preluatDe}` : ''}` : "Ne-preluat")
                          : "N/A"}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Managementul statusurilor critice – mutat din cardul stâng în cardul drept */}
                {/* Setări ofertă – disponibile pentru admin/dispecer indiferent de preluare sau status */}
                {(role === "admin" || role === "dispecer") && (
                  <div className="p-4 border rounded-md bg-blue-50 border-blue-200 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">O</span>
                      </div>
                      <h4 className="text-base font-semibold text-blue-900">Setări ofertă</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="necesitaOfertaSwitch" className="text-xs font-medium text-blue-800">Necesită ofertă</Label>
                        <div className="flex items-center gap-3">
                          <Switch
                            id="necesitaOfertaSwitch"
                            checked={Boolean(lucrare.necesitaOferta)}
                            onCheckedChange={async (checked) => {
                              try {
                                setIsUpdating(true)
                                const updateData: any = { necesitaOferta: checked }
                                if (!checked) {
                                  updateData.comentariiOferta = ""
                                  updateData.statusOferta = undefined
                                }
                                await updateLucrare(lucrare.id!, updateData)
                                setLucrare(prev => prev ? { ...prev, ...updateData } : null)
                                toast({ title: "Actualizat", description: "Setarea 'Necesită ofertă' a fost actualizată." })
                              } catch (error) {
                                console.error("Eroare la actualizarea necesitaOferta:", error)
                                toast({ title: "Eroare", description: "Nu s-a putut actualiza setarea.", variant: "destructive" })
                              } finally {
                                setIsUpdating(false)
                              }
                            }}
                            disabled={isUpdating}
                          />
                        </div>
                      </div>
                      {lucrare.necesitaOferta && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-blue-800">Status ofertă</Label>
                          <select
                            value={lucrare.statusOferta || "DA"}
                            onChange={async (e) => {
                              try {
                                setIsUpdating(true)
                                const newStatus = e.target.value as "DA" | "OFERTAT"
                                await updateLucrare(lucrare.id!, { statusOferta: newStatus })
                                setLucrare(prev => prev ? { ...prev, statusOferta: newStatus } : null)
                                toast({ title: "Status actualizat", description: "Statusul ofertei a fost actualizat." })
                              } catch (error) {
                                console.error("Eroare la actualizarea statusului ofertei:", error)
                                toast({ title: "Eroare", description: "Nu s-a putut actualiza statusul.", variant: "destructive" })
                              } finally {
                                setIsUpdating(false)
                              }
                            }}
                            className="w-full text-xs p-2 border border-blue-300 rounded bg-white"
                            disabled={isUpdating}
                          >
                            <option value="DA">DA - Necesită ofertă</option>
                            <option value="OFERTAT">OFERTAT</option>
                          </select>
                        </div>
                      )}
                      {lucrare.necesitaOferta && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-blue-800">Editor ofertă</Label>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsOfferEditorOpen(true)}
                              disabled={isUpdating}
                            >
                              Deschide editor
                            </Button>
                            {lucrare.products && lucrare.products.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    setIsUpdating(true)
                                    await updateLucrare(lucrare.id!, { statusOferta: "OFERTAT" })
                                    setLucrare(prev => prev ? { ...prev, statusOferta: "OFERTAT" } : null)
                                    toast({ title: "Ofertă pregătită", description: "Oferta este pregătită pentru trimitere către client." })
                                  } finally {
                                    setIsUpdating(false)
                                  }
                                }}
                              >
                                Marchează OFERTAT
                              </Button>
                            )}
                            {lucrare.products && lucrare.products.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    setIsUpdating(true)
                                    const origin = typeof window !== 'undefined' ? window.location.origin : ''
                                    const portalUrl = `${origin}/portal/${lucrare.id}`
                                    const subject = `Ofertă pentru lucrarea ${lucrare.numarRaport || lucrare.id}`
                                    const html = `
                                      <div style="font-family:Arial,sans-serif;line-height:1.5">
                                        <h2 style="margin:0 0 12px;color:#0f56b3">Ofertă lucrări</h2>
                                        <p>Vă transmitem oferta pentru lucrarea dvs. Puteți vizualiza și răspunde (Accept/Nu accept) în portal:</p>
                                        <p><a href="${portalUrl}" target="_blank">${portalUrl}</a></p>
                                        <p style="margin-top:12px"><strong>Total:</strong> ${(lucrare.offerTotal || (lucrare.products || []).reduce((s:number,p:any)=>s+(p.total||0),0)).toFixed(2)} lei</p>
                                      </div>`
                                    await fetch('/api/users/invite', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ to: [ (lucrare as any)?.clientInfo?.email ].filter(Boolean), subject, html })
                                    })
                                    toast({ title: 'Ofertă trimisă', description: 'Clientul a primit email cu link spre portal.' })
                                  } catch (e) {
                                    console.warn('Trimitere ofertă eșuată', e)
                                    toast({ title: 'Eroare trimitere', description: 'Nu s-a putut trimite emailul.', variant: 'destructive' })
                                  } finally {
                                    setIsUpdating(false)
                                  }
                                }}
                              >
                                Trimite ofertă
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      {lucrare.necesitaOferta && (
                        <div className="space-y-2 md:col-span-3">
                          <Label htmlFor="comentariiOferta" className="text-xs font-medium text-blue-800">Comentarii ofertă</Label>
                          <Textarea
                            id="comentariiOferta"
                            value={lucrare.comentariiOferta || ""}
                            onChange={(e) => setLucrare(prev => prev ? { ...prev, comentariiOferta: e.target.value } : prev)}
                            onBlur={async () => {
                              try {
                                setIsUpdating(true)
                                await updateLucrare(lucrare.id!, { comentariiOferta: lucrare.comentariiOferta || "" })
                                toast({ title: "Actualizat", description: "Comentariile ofertei au fost salvate." })
                              } catch (error) {
                                console.error("Eroare la salvarea comentariilor ofertei:", error)
                                toast({ title: "Eroare", description: "Nu s-au putut salva comentariile.", variant: "destructive" })
                              } finally {
                                setIsUpdating(false)
                              }
                            }}
                            placeholder="Detalii relevante pentru ofertă..."
                            className="min-h-[80px] text-sm"
                            disabled={isUpdating}
                          />
                        </div>
                      )}
                      {/* Răspuns ofertă din portal (read-only) */}
                      {lucrare.offerResponse?.status && (
                        <div className="md:col-span-3 p-3 rounded border bg-white">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-800">Răspuns ofertă (client)</span>
                            <Badge variant={lucrare.offerResponse.status === "accept" ? "default" : "destructive"}>
                              {lucrare.offerResponse.status === "accept" ? "Acceptată" : "Respinsă"}
                            </Badge>
                          </div>
                          {lucrare.offerResponse.reason && (
                            <div className="text-sm text-gray-700">Motiv: {lucrare.offerResponse.reason}</div>
                          )}
                          {lucrare.offerResponse.at && (
                            <div className="text-xs text-gray-500 mt-1">{new Date(lucrare.offerResponse.at).toLocaleString('ro-RO')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Offer editor dialog */}
                {lucrare && (
                  <OfferEditorDialog
                    lucrareId={lucrare.id!}
                    open={isOfferEditorOpen}
                    onOpenChange={setIsOfferEditorOpen}
                    initialProducts={(lucrare as any).products || []}
                  />
                )}

                {/* Managementul statusurilor critice – mutat din cardul stâng în cardul drept */}
                {isAdminOrDispatcher && lucrare.statusLucrare === "Finalizat" && lucrare.preluatDispecer && (
                  <div className="p-4 border rounded-md bg-amber-50 border-amber-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">⚠</span>
                      </div>
                      <h4 className="text-base font-semibold text-amber-900">Managementul statusurilor critice</h4>
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-sm px-3 py-1 font-medium">
                        Doar Admin/Dispecer
                      </Badge>
                    </div>
                    <p className="text-sm text-amber-700 mb-3">
                      Acestea controlează afișarea cu fundal roșu în lista de lucrări. Modificați doar când situația s-a rezolvat.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Istoric descărcări documente */}
                      <div className="md:col-span-3 space-y-2">
                        <label className="text-sm font-semibold text-amber-800">Descărcări documente</label>
                        <DownloadHistory lucrareId={lucrare.id!} />
                      </div>
                      {/* Status Finalizare Intervenție */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-amber-800">Status finalizare intervenție:</label>
                        <select
                          value={lucrare.statusFinalizareInterventie || "FINALIZAT"}
                          onChange={async (e) => {
                            try {
                              setIsUpdating(true)
                              const newStatus = e.target.value as "FINALIZAT" | "NEFINALIZAT"
                              console.log("Actualizare status finalizare:", { lucrareId: lucrare.id, newStatus })
                              await updateLucrare(lucrare.id!, { statusFinalizareInterventie: newStatus })
                              setLucrare(prev => {
                                const updated = prev ? { ...prev, statusFinalizareInterventie: newStatus } : null
                                console.log("State finalizare actualizat:", { prev: prev?.statusFinalizareInterventie, new: updated?.statusFinalizareInterventie })
                                return updated
                              })
                              const updatedLucrare = await getLucrareById(lucrare.id!)
                              if (updatedLucrare) {
                                setLucrare(updatedLucrare)
                                console.log("Lucrare reîncărcată din Firebase:", { statusFinalizareInterventie: updatedLucrare.statusFinalizareInterventie })
                              }
                              toast({
                                title: "Status actualizat",
                                description: "Statusul finalizării intervenției a fost actualizat."
                              })
                            } catch (error) {
                              console.error("Eroare la actualizarea statusului finalizare:", error)
                              toast({
                                title: "Eroare",
                                description: "Nu s-a putut actualiza statusul.",
                                variant: "destructive"
                              })
                            } finally {
                              setIsUpdating(false)
                            }
                          }}
                          className="w-full text-sm p-3 border border-amber-300 rounded bg-white"
                          disabled={isUpdating}
                        >
                          <option value="FINALIZAT">FINALIZAT</option>
                          <option value="NEFINALIZAT">NEFINALIZAT</option>
                        </select>
                      </div>

                      {/* Status Facturare */}
{(role === "admin" || role === "dispecer") && (
  <div className="space-y-2">
                          <label className="text-sm font-semibold text-amber-800">Status facturare:</label>
    <div className="space-y-2">
      <select
        value={lucrare.statusFacturare || "Nefacturat"}
        onChange={async (e) => {
          try {
            setIsUpdating(true)
            const newStatus = e.target.value
            console.log("Actualizare status facturare:", { lucrareId: lucrare.id, newStatus })
            const updateData: any = { statusFacturare: newStatus }
            await updateLucrare(lucrare.id!, updateData)
            setLucrare(prev => prev ? { ...prev, ...updateData } : null)
            const updatedLucrare = await getLucrareById(lucrare.id!)
            if (updatedLucrare) {
              setLucrare(updatedLucrare)
              console.log("Lucrare reîncărcată din Firebase:", { statusFacturare: updatedLucrare.statusFacturare, numarFactura: updatedLucrare.numarFactura })
            }
            toast({
              title: "Status actualizat",
              description: "Statusul facturării a fost actualizat."
            })
          } catch (error) {
            console.error("Eroare la actualizarea statusului facturare:", error)
            toast({
              title: "Eroare",
              description: "Nu s-a putut actualiza statusul.",
              variant: "destructive"
            })
          } finally {
            setIsUpdating(false)
          }
        }}
        className="w-full text-xs p-2 border border-amber-300 rounded bg-white"
        disabled={isUpdating}
      >
        <option value="Nefacturat">Nefacturat</option>
        <option value="Facturat">Facturat</option>
        <option value="Nu se facturează">Nu se facturează</option>
      </select>
    </div>
  </div>
)}

                      {/* Status Echipament */}
{role === "admin" && (
  <div className="space-y-2">
    <label className="text-xs font-medium text-amber-800">Status echipament:</label>
    <select
      value={lucrare.statusEchipament || "Funcțional"}
      onChange={async (e) => {
        try {
          setIsUpdating(true)
          const newStatus = e.target.value
          console.log("Actualizare status echipament:", { lucrareId: lucrare.id, newStatus })
          await updateLucrare(lucrare.id!, { statusEchipament: newStatus })
          setLucrare(prev => prev ? { ...prev, statusEchipament: newStatus } : null)
          const updatedLucrare = await getLucrareById(lucrare.id!)
          if (updatedLucrare) {
            setLucrare(updatedLucrare)
            console.log("Lucrare reîncărcată din Firebase:", { statusEchipament: updatedLucrare.statusEchipament })
          }
          toast({
            title: "Status actualizat",
            description: "Statusul echipamentului a fost actualizat."
          })
        } catch (error) {
          console.error("Eroare la actualizarea statusului echipament:", error)
          toast({
            title: "Eroare",
            description: "Nu s-a putut actualiza statusul.",
            variant: "destructive"
          })
        } finally {
          setIsUpdating(false)
        }
      }}
      className="w-full text-xs p-2 border border-amber-300 rounded bg-white"
      disabled={isUpdating}
    >
      <option value="Funcțional">Funcțional</option>
      <option value="Parțial funcțional">Parțial funcțional</option>
      <option value="Nefuncțional">Nefuncțional</option>
    </select>
  </div>
)}



                      {((lucrare.statusOferta === "DA" || lucrare.statusOferta === "OFERTAT") || 
                  (lucrare.statusOferta === undefined && lucrare.necesitaOferta)) && 
                  lucrare.comentariiOferta && (
                          <div>
                    <p className="text-sm font-medium">Comentarii ofertă:</p>
                    <p className="text-sm text-gray-500">{lucrare.comentariiOferta}</p>
                          </div>
                        )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-amber-100 rounded text-sm text-amber-700">
                      <strong>Notă:</strong> Modificarea acestor statusuri va schimba culoarea rândului în lista de lucrări. 
                      Lucrările cu status "NEFINALIZAT", echipament "Nefuncțional" sau status ofertă "DA" apar cu fundal roșu. 
                      Statusul "OFERTAT" NU mai apare cu fundal roșu.
                    </div>
                  </div>
                )}

                {/* Mesaj informativ când lucrarea nu este încă preluată */}
                {isAdminOrDispatcher && lucrare.statusLucrare === "Finalizat" && !lucrare.preluatDispecer && (
                  <div className="p-4 border rounded-md bg-gray-50 border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-5 w-5 rounded-full bg-gray-400 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">!</span>
                      </div>
                      <h4 className="text-sm font-medium text-gray-700">Managementul statusurilor critice</h4>
                      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 text-xs">
                        Dezactivat
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">
                      Această secțiune va fi disponibilă doar după preluarea lucrării de către dispecer.
                    </p>
                  </div>
                )}

                {/* Documente PDF – mutat aici, sub Managementul statusurilor critice, în același container */}
                <div className="mt-4">
                  <div className="mt-2 p-3">
                    <DocumentUpload
                      lucrareId={lucrare.id!}
                      lucrare={lucrare}
                      onLucrareUpdate={setLucrare}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
             
              </CardFooter>
            </Card>

          </div>
        </TabsContent>

        {role === "tehnician" && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
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
                  <Alert variant="default" className="bg-blue-50 border-blue-200">
                    <CheckCircle className="h-4 w-4 text-blue-500" />
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
                  necesitaOferta: lucrare.necesitaOferta,
                  comentariiOferta: lucrare.comentariiOferta,
                  statusEchipament: lucrare.statusEchipament,
                  // Adăugăm câmpurile pentru garanție
                  tipLucrare: lucrare.tipLucrare,
                  echipamentCod: lucrare.echipamentCod,
                  // Pentru echipamentData, trebuie să găsim echipamentul în datele clientului
                  echipamentData: clientData?.locatii
                    ?.find((loc: any) => loc.nume === lucrare.locatie)
                    ?.echipamente
                    ?.find((eq: any) => eq.cod === lucrare.echipamentCod),
                  // Adăugăm statusul finalizării intervenției
                  statusFinalizareInterventie: lucrare.statusFinalizareInterventie,
                  // Adăugăm confirmarea garanției de către tehnician
                  tehnicianConfirmaGarantie: lucrare.tehnicianConfirmaGarantie,
                  // Adăugăm imaginile defectelor
                  imaginiDefecte: lucrare.imaginiDefecte
                }}
                onUpdate={(preserveActiveTab) => refreshLucrare(preserveActiveTab)}
                isCompleted={lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true}
              />
            )}
          </TabsContent>
        )}

        {role === "tehnician" && (
          <TabsContent value="verificare" className="mt-4">
            <Card>
              <CardHeader>
                {/* Layout responsive: pe mobil butonul apare sub text, pe desktop alături */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>Verificare Echipament</CardTitle>
                    <CardDescription>
                      {otherActiveWork
                        ? "Ai deja o lucrare în lucru. Finalizează sau închide lucrarea deschisă înainte de a începe alta."
                        : "Scanați QR code-ul echipamentului pentru a verifica dacă corespunde cu lucrarea."}
                    </CardDescription>
                  </div>
                  {/* Buton de amânare - disponibil doar pentru lucrări neamânate și nefinalizate */}
                  {lucrare.statusLucrare !== "Amânată" && lucrare.statusLucrare !== "Finalizat" && (
                    <div className="flex justify-start sm:justify-end">
                      <PostponeWorkDialog
                        lucrareId={lucrare.id!}
                        onSuccess={() => {
                          toast({
                            title: "Lucrare amânată",
                            description: "Vei fi redirecționat către lista de lucrări.",
                          })
                          setTimeout(() => {
                            router.push("/dashboard/lucrari")
                          }, 2000)
                        }}
                        className="w-full sm:w-auto"
                      />
                    </div>
                  )}
                </div>
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
                ) : otherActiveWork ? (
                  <>
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <AlertTitle>Ai deja o lucrare în lucru</AlertTitle>
                      <AlertDescription>
                        {(() => {
                          const parts = [
                            otherActiveWork.client ? `Client: ${otherActiveWork.client}` : null,
                            otherActiveWork.locatie ? `Locație: ${otherActiveWork.locatie}` : null,
                          ].filter(Boolean)
                          return parts.length > 0 ? parts.join(" | ") : "Finalizează sau închide lucrarea deschisă înainte de a începe alta."
                        })()}
                      </AlertDescription>
                    </Alert>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={() => router.push(`/dashboard/lucrari/${otherActiveWork.id}`)}>
                        Deschide lucrarea în lucru
                      </Button>
                      {checkingOtherActive && (
                        <span className="text-xs text-gray-500">Se verifică starea lucrărilor...</span>
                      )}
                    </div>
                  </>
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
                    <Alert variant="destructive">
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

      {/* Secțiunea pentru vizualizarea imaginilor defectelor - doar pentru admin și dispecer */}
      <div className="mt-6 space-y-6">
        <ImageDefectViewer
          imaginiDefecte={lucrare.imaginiDefecte}
          userRole={role}
        />

        {/* Istoric descărcări documente – vizibil pentru admin/dispecer */}
        {isAdminOrDispatcher && lucrare?.id && (
          <Card>
            <CardHeader>
              <CardTitle>Istoric descărcări documente</CardTitle>
              <CardDescription>Înregistrări cine/când a descărcat documente din portal</CardDescription>
            </CardHeader>
            <CardContent>
              <DownloadHistory lucrareId={lucrare.id} />
            </CardContent>
          </Card>
        )}
      </div>


    </DashboardShell>

    {/* Dialog pentru selectarea motivelor reintervenției */}
    <ReinterventionReasonDialog
      isOpen={isReinterventionReasonDialogOpen}
      onClose={() => setIsReinterventionReasonDialogOpen(false)}
      lucrareId={paramsId}
      onSuccess={handleReinterventionAfterReasons}
    />
    </TooltipProvider>
  )
}
