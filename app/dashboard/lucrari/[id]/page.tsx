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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  ArchiveRestore,
  Archive,
  Clock,
  Download,
  Mail,
} from "lucide-react"
import { getLucrareById, deleteLucrare, updateLucrare, getClienti, addLucrare } from "@/lib/firebase/firestore"
import { WORK_STATUS, WORK_STATUS_OPTIONS } from "@/lib/utils/constants"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { DocumentUpload } from "@/components/document-upload"
import { ImageDefectViewer } from "@/components/image-defect-viewer"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatDate, formatTime } from "@/lib/utils/time-format"
import { EquipmentQRCode } from "@/components/equipment-qr-code"
// Adăugăm importurile pentru calculul garanției
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"
import { ReinterventionReasonDialog } from "@/components/reintervention-reason-dialog"
import { PostponeWorkDialog } from "@/components/postpone-work-dialog"
import { ModificationBanner } from "@/components/modification-banner"
import { useModificationDetails } from "@/hooks/use-modification-details"
import { db } from "@/lib/firebase/config"
import { collection, query, where, getDocs } from "firebase/firestore"
import { canArchiveLucrare } from "@/lib/utils/archive-validation"
import { deleteField } from "firebase/firestore"
import { generateRevisionOperationsPDF, generateRevisionEquipmentPDF } from "@/lib/pdf/revision-operations"

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cif || "N/A"
}

// Funcție pentru calcularea corectă a duratei intervenției
const calculateInterventionDuration = (lucrare: any): string => {
  // Încercăm să găsim durata din câmpul salvat
  const savedDuration = lucrare?.durataInterventie;
  
  if (savedDuration) {
    return savedDuration;
  }
  
  // Dacă nu avem durata salvată, încercăm să o calculăm din timpii existenți
  const timpSosire = lucrare?.timpSosire;
  const timpPlecare = lucrare?.timpPlecare;
  
  if (timpSosire && timpPlecare) {
    try {
      // Calculăm durata în timp real
      const startTime = new Date(timpSosire);
      const endTime = new Date(timpPlecare);
      
      // VERIFICARE PENTRU TIMPI CORUPȚI
      const currentYear = new Date().getFullYear();
      const isStartInFuture = startTime.getFullYear() > currentYear;
      const isEndInFuture = endTime.getFullYear() > currentYear;
      
      if (isStartInFuture || isEndInFuture) {
        console.error("🚨 TIMPI CORUPȚI DETECTAȚI:", {
          timpSosire: startTime.toLocaleString('ro-RO'),
          timpPlecare: endTime.toLocaleString('ro-RO'),
          isStartInFuture,
          isEndInFuture
        });
        return "EROARE - Timpi corupți";
      }
      
      const diffMs = endTime.getTime() - startTime.getTime();
      
      if (diffMs > 0) {
        const diffHours = diffMs / (1000 * 60 * 60);
        
        // Logare pentru durate foarte lungi (doar informativ)
        if (diffHours > 72) {
          console.log("ℹ️ DURATĂ LUNGĂ DETECTATĂ:", {
            timpSosire: startTime.toLocaleString('ro-RO'),
            timpPlecare: endTime.toLocaleString('ro-RO'),
            durataOre: Math.round(diffHours),
            durataZile: Math.round(diffHours / 24)
          });
        }
        
        const diffMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        return `${hours}h ${minutes}m`;
      } else if (diffMs < 0) {
        return "EROARE - Timpul de plecare este înainte de sosire";
      }
    } catch (e) {
      console.error("Eroare la calculul duratei:", e);
      return "EROARE - Calcul invalid";
    }
  }
  
  return "N/A";
}

export default function LucrarePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const fromArhivate = searchParams.get('from') === 'arhivate'
  
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

  // Asigurăm feedback atunci când se încearcă deschiderea editorului fără preluare
  useEffect(() => {
    if (isOfferEditorOpen && lucrare && role !== "tehnician" && !lucrare.preluatDispecer) {
      toast({
        title: "Editor indisponibil",
        description: "Lucrarea trebuie preluată de dispecer/admin înainte de editarea ofertei.",
        variant: "destructive",
      })
      setIsOfferEditorOpen(false)
    }
  }, [isOfferEditorOpen, lucrare, role])

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

  // Această funcție nu mai este folosită - reviziile se finalizează prin "Generează raport"
  // Păstrăm funcția pentru compatibilitate dar va fi ștearsă în viitor

  // State pentru informațiile de garanție
  const [equipmentData, setEquipmentData] = useState<Echipament | null>(null)
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  
  // State pentru debounce-ul numărului facturii
  const [invoiceNumberTimeout, setInvoiceNumberTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // State pentru afișarea banner-ului de modificare
  const [showModificationBanner, setShowModificationBanner] = useState(true)
  const [isFinalizingPartial, setIsFinalizingPartial] = useState(false)

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

  // Modificăm funcția handleGenerateReport pentru a descărca direct raportul dacă este generat
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

    // Pentru revizii, verificăm dacă toate echipamentele au fost revizuite
    if (lucrare.tipLucrare === "Revizie" && Array.isArray(lucrare.equipmentIds)) {
      const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
      const all = lucrare.equipmentIds
      const completed = all.filter((id) => status[id] === "done")
      
      if (completed.length < all.length) {
        toast({
          title: "Revizie incompletă",
          description: `Toate echipamentele trebuie revizuite înainte de a genera raportul. (${completed.length}/${all.length} completate)`,
          variant: "destructive",
        })
        return
      }
    }

    // Dacă raportul nu este generat, mergem la pagina de raport pentru completare
    if (!lucrare.raportGenerat) {
      router.push(`/raport/${lucrare.id}`)
      return
    }

    // Dacă raportul este deja generat, deschidem direct într-un tab nou (mai fiabil pentru download)
    const downloadUrl = `/raport/${lucrare.id}?autoDownload=true`
    try {
      window.open(downloadUrl, "_blank", "noopener")
    } catch {
      // fallback ancoră
      const link = document.createElement('a')
      link.href = downloadUrl
      link.target = '_blank'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    
    toast({
      title: "Descărcare raport",
      description: "Raportul se va descărca automat...",
      variant: "default",
    })
  }, [router, lucrare, toast])

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

  // Finalizare parțială pentru revizii: închide lucrarea curentă și creează o lucrare nouă cu echipamentele rămase
  const handleFinalizePartial = useStableCallback(async () => {
    if (!lucrare || lucrare.tipLucrare !== "Revizie" || !Array.isArray(lucrare.equipmentIds)) return
    const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
    const all = lucrare.equipmentIds
    const done = all.filter((id) => status[id] === "done")
    const remaining = all.filter((id) => status[id] !== "done")
    if (done.length === 0 || remaining.length === 0) {
      toast({
        title: "Condiții neîndeplinite",
        description: "Finalizarea parțială este disponibilă doar după ce finalizezi cel puțin un echipament și rămân altele nefinalizate.",
        variant: "destructive",
      })
      return
    }
    if (!window.confirm(`Finalizezi parțial revizia? Echipamente finalizate: ${done.length}. Se creează o lucrare nouă pentru ${remaining.length} echipament(e) rămas(e).`)) {
      return
    }
    setIsFinalizingPartial(true)
    try {
      // 1) Închidem lucrarea curentă ca Finalizat și păstrăm DOAR echipamentele finalizate
      const filteredStatus: Record<string, string> = Object.fromEntries(done.map((id) => [id, "done"]))
      await updateLucrare(
        lucrare.id!,
        {
          statusLucrare: WORK_STATUS.COMPLETED,
          equipmentIds: done,
          ["revision.equipmentStatus"]: filteredStatus as any,
          mesajReatribuire: "Revizie finalizată parțial – echipamentele rămase vor fi replanificate",
        } as any,
        userData?.uid,
        userData?.displayName || "Utilizator"
      )
      // 2) Creăm lucrare nouă doar cu echipamentele rămase
      const newWork: any = {
        client: lucrare.client,
        persoanaContact: lucrare.persoanaContact,
        telefon: lucrare.telefon,
        dataEmiterii: lucrare.dataEmiterii,
        dataInterventie: lucrare.dataInterventie,
        tipLucrare: "Revizie",
        locatie: lucrare.locatie,
        descriere: lucrare.descriere || `Echipamente rămase din revizie parțială (${done.length}/${all.length} finalizate)`,
        statusLucrare: WORK_STATUS.POSTPONED,
        statusFacturare: "Nefacturat",
        tehnicieni: [],
        contract: (lucrare as any).contract,
        contractNumber: (lucrare as any).contractNumber,
        clientInfo: (lucrare as any).clientInfo,
        equipmentIds: remaining,
        revision: { equipmentStatus: {} as Record<string, string> } as any,
        lucrareOriginala: lucrare.id,
        mesajReatribuire: `Replanificare echipamente rămase (${remaining.length}) din revizie parțială`,
        createdBy: userData?.uid || "system",
        createdByName: userData?.displayName || userData?.email || "Utilizator",
      }
      const created = await addLucrare(newWork as any)
      toast({
        title: "Finalizare parțială reușită",
        description: `Am creat o lucrare nouă pentru echipamentele rămase (ID: ${created.id}).`,
      })
      // Navigăm direct la generarea raportului pentru lucrarea curentă (doar echipamentele finalizate)
      router.push(`/raport/${lucrare.id}`)
    } catch (e: any) {
      console.error("Eroare finalizare parțială:", e)
      toast({
        title: "Eroare",
        description: "Nu s-a putut finaliza parțial revizia.",
        variant: "destructive",
      })
    } finally {
      setIsFinalizingPartial(false)
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
      const noTechs = !Array.isArray(lucrare.tehnicieni) || lucrare.tehnicieni.length === 0
      const shouldList = lucrare.statusLucrare === WORK_STATUS.POSTPONED && noTechs
      await updateLucrare(lucrare.id, { 
        preluatDispecer: true, 
        preluatDe: userData?.displayName || userData?.email || "Dispecer",
        ...(shouldList ? { statusLucrare: WORK_STATUS.LISTED } : {}),
      })

      // Actualizăm lucrarea local
      setLucrare((prev) => (prev ? { 
        ...prev, 
        preluatDispecer: true, 
        preluatDe: userData?.displayName || userData?.email || "Dispecer",
        ...(shouldList ? { statusLucrare: WORK_STATUS.LISTED } : {}),
      } : null))

      toast({
        title: "Lucrare preluată",
        description: shouldList 
          ? "Lucrarea a fost marcată ca preluată și trecută în status 'Listată'."
          : "Lucrarea a fost marcată ca preluată de dispecer.",
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
        <Button onClick={() => router.back()}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>
      </DashboardShell>
    )
  }

  const isCompletedWithReport = lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true
  
  // Condiții pentru reintervenție: raport generat + lucrare preluată + fără reintervenții existente + nelockată
  const needsReintervention = (lucrare: any) => {
    return Boolean(
      lucrare?.raportGenerat === true &&
      lucrare?.preluatDispecer === true &&
      !lucrare?.lockedAfterReintervention &&
      (Array.isArray(reinterventii) ? reinterventii.length === 0 : true)
    )
  }
  
  // Funcție pentru a gestiona reintervenția - deschide dialogul de motive
  const handleReintervention = () => {
    if (!lucrare) return
    
    // Deschidem dialogul pentru selectarea motivelor reintervenției
    setIsReinterventionReasonDialogOpen(true)
  }

  // Funcție pentru a continua cu reintervenția după selectarea motivelor
  const handleReinterventionAfterReasons = (textReinterventie?: string) => {
    if (!lucrare) return
    
    // Redirecționăm către pagina principală cu parametru pentru reintervenție
    const extra = textReinterventie ? `&textReinterventie=${encodeURIComponent(textReinterventie)}` : ""
    router.push(`/dashboard/lucrari?reintervention=${lucrare.id}${extra}`)
  }

  return (
    <TooltipProvider>
      <DashboardShell>
      <DashboardHeader 
        heading={
          <span className="flex items-center gap-2">
            Lucrare: 
            {lucrare.nrLucrare && (
              <Badge className="bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-100 text-base font-semibold px-3 py-1 rounded-md">
                {lucrare.nrLucrare}
              </Badge>
            )}
            {" - "}
            {lucrare.tipLucrare}
          </span>
        } 
        // text={`Client: ${lucrare.client}`}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          {role !== "client" && (
            lucrare.raportGenerat ? (
              <Button
                onClick={() => {
                  const url = `/raport/${lucrare.id}?autoDownload=true`
                  try {
                    window.open(url, "_blank", "noopener")
                  } catch {
                    const a = document.createElement("a")
                    a.href = url
                    a.target = "_blank"
                    a.rel = "noopener"
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                  }
                  toast({ title: "Descărcare raport", description: "Raportul se va descărca automat..." })
                }}
              >
                <FileText className="mr-2 h-4 w-4" /> Descarcă raport
              </Button>
            ) : (
              <Button 
                onClick={handleGenerateReport}
                disabled={
                  role === "tehnician" && 
                  (lucrare.tipLucrare === "Revizie" 
                    ? (() => {
                        // Pentru revizii: verificăm dacă toate echipamentele sunt completate
                        if (!Array.isArray(lucrare.equipmentIds)) return true
                        const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                        const completed = lucrare.equipmentIds.filter((id) => status[id] === "done")
                        return completed.length < lucrare.equipmentIds.length
                      })()
                    : !equipmentVerified // Pentru lucrări normale: verificare QR echipament
                  )
                }
              >
                <FileText className="mr-2 h-4 w-4" /> Generează raport
              </Button>
            )
          )}

          {lucrare.statusLucrare === WORK_STATUS.ARCHIVED && role === "admin" && (
            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                if (!window.confirm("Sigur doriți să dezarhivați această lucrare? Va reveni la statusul 'Finalizat'.")) return
                try {
                  setIsUpdating(true)
                  await updateLucrare(paramsId, {
                    statusLucrare: WORK_STATUS.COMPLETED,
                    archivedAt: null as any,
                    archivedBy: null as any,
                  })
                  toast({ title: "Succes", description: "Lucrarea a fost dezarhivată." })
                  router.refresh()
                } catch (error) {
                  console.error("Eroare la dezarhivare:", error)
                  toast({ title: "Eroare", description: "Nu s-a putut dezarhiva lucrarea.", variant: "destructive" })
                } finally {
                  setIsUpdating(false)
                }
              }}
              disabled={isUpdating}
            >
              <ArchiveRestore className="mr-2 h-4 w-4" />
              {isUpdating ? "Se dezarhivează..." : "Dezarhivează"}
            </Button>
          )}

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

          {/* Buton pentru arhivare - vizibil întotdeauna pentru admin/dispecer, disabled când nu sunt îndeplinite condițiile */}
          {isAdminOrDispatcher && (() => {
            const isFinalized = lucrare.statusLucrare === "Finalizat"
            const archiveValidation = canArchiveLucrare(lucrare)
            
            // Butonul este enabled doar dacă statusul este "Finalizat" ȘI toate condițiile sunt îndeplinite
            const canArchive = isFinalized && archiveValidation.canArchive
            
            // Determină motivul pentru care nu se poate arhiva
            let disableReason = ""
            if (!isFinalized) {
              disableReason = "Lucrarea trebuie să fie în status 'Finalizat' pentru a putea fi arhivată"
            } else if (!archiveValidation.canArchive) {
              disableReason = archiveValidation.reason || "Nu se poate arhiva încă"
            }
            
            // Tooltip diferit în funcție de starea butonului
            const tooltipContent = !canArchive 
              ? (
                  <div className="max-w-xs">
                    <p className="font-semibold mb-2">Nu se poate arhiva încă</p>
                    <ul className="text-sm list-disc pl-4 space-y-1">
                      <li>{disableReason}</li>
                    </ul>
                  </div>
                )
              : (
                  <div className="max-w-xs">
                    <p className="font-semibold mb-2">Gata de arhivare</p>
                    <p className="text-sm">Toate condițiile sunt îndeplinite. Click pentru a arhiva lucrarea.</p>
                  </div>
                )

            return (
            <div className="relative inline-block">
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
                  <TooltipContent className="max-w-sm">
                    {tooltipContent}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Info icon pentru motivele de ne-arhivare */}
              {!canArchive && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md transition-colors z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-gray-900">
                        De ce nu se poate arhiva încă?
                      </h4>
                      <Separator />
                      <div className="text-sm text-gray-700">
                        <p className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 text-orange-500 flex-shrink-0" />
                          <span>{disableReason}</span>
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            )
          })()}

          {/* Buton de preluare pentru admin/dispecer: vizibil pentru Finalizat (cu raport) sau Amânată, dacă nu e preluată */}
          {isAdminOrDispatcher && !lucrare.preluatDispecer && (isCompletedWithReport || lucrare.statusLucrare === WORK_STATUS.POSTPONED) && (
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

          {(role === "admin" || role === "dispecer") && !lucrare?.lockedAfterReintervention && lucrare.statusLucrare !== "Finalizat" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editează</TooltipContent>
            </Tooltip>
          )}
          {(role === "admin" || role === "dispecer") && (lucrare?.lockedAfterReintervention || lucrare.statusLucrare === "Finalizat") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="icon" disabled>
                    <Lock className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {lucrare.statusLucrare === "Finalizat" 
                  ? "Lucrarea finalizată nu poate fi editată"
                  : "Lucrarea este blocată după reintervenție"}
              </TooltipContent>
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
      {role === "tehnician" && !equipmentVerified && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && lucrare.tipLucrare !== "Revizie" && (
        <Alert variant="default" className="mb-4 bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertTitle>Verificare echipament necesară</AlertTitle>
          <AlertDescription>
            Trebuie să verificați echipamentul înainte de a putea începe intervenția. Accesați tab-ul "Verificare
            Echipament".
          </AlertDescription>
        </Alert>
      )}

      {/* Alert special pentru revizii */}
      {role === "tehnician" && lucrare.tipLucrare === "Revizie" && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
        <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertTitle>Lucrare de revizie</AlertTitle>
          <AlertDescription>
            Aceasta este o revizie cu mai multe echipamente. Pentru fiecare echipament din lista de mai jos, deschide fișa de operațiuni, scanează codul QR și completează verificările necesare.
          </AlertDescription>
        </Alert>
      )}

      {/* Adăugăm un banner de confirmare dacă echipamentul a fost verificat - doar pentru lucrări normale */}
      {role === "tehnician" && equipmentVerified && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && lucrare.tipLucrare !== "Revizie" && (
        <Alert variant="default" className="mb-4 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Echipament verificat</AlertTitle>
          <AlertDescription>Echipamentul a fost verificat cu succes. Puteți continua intervenția.</AlertDescription>
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
          {/* ASCUNS pentru revizii - verificarea se face per echipament în fișa de operațiuni */}
          {role === "tehnician" && !lucrare.raportGenerat && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && lucrare.tipLucrare !== "Revizie" && (
            <TabsTrigger value="verificare" className="basis-full md:basis-auto text-center whitespace-normal">
              Verificare echipament
            </TabsTrigger>
          )}
          {/* ------------ 2. Intervenție (50 %) --------------------------- */}
          {/* ASCUNS pentru revizii - intervenția se face per echipament în fișa de operațiuni */}
          {role === "tehnician" && !lucrare.raportGenerat && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && lucrare.tipLucrare !== "Revizie" && (
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
            
                  </div>
                </div>

                {/* Documentație echipament (vizibilă pentru tehnicieni) */}
                {role === "tehnician" && lucrare?.echipamentCod && clientData?.locatii && (
                  <div className="mt-4">
                    <p className="text-base font-semibold mb-2">Documentație echipament:</p>
                    {(() => {
                      try {
                        const loc = (clientData.locatii || []).find((l: any) => l?.nume === lucrare?.locatie || l?.adresa === lucrare?.clientInfo?.locationAddress)
                        const eq = loc?.echipamente?.find((e: any) => e?.cod === lucrare?.echipamentCod)
                        const docs = eq?.documentatie || []
                        if (!docs.length) {
                          return <div className="text-sm text-muted-foreground">Nu există documentație disponibilă.</div>
                        }
                        return (
                          <ul className="text-sm space-y-1">
                            {docs.map((d: any, i: number) => (
                              <li key={i} className="flex items-center justify-between gap-2">
                                <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                  {d.fileName}
                                </a>
                                <span className="text-xs text-muted-foreground">{new Date(d.uploadedAt).toLocaleDateString("ro-RO")}</span>
                              </li>
                            ))}
                          </ul>
                        )
                      } catch {
                        return <div className="text-sm text-muted-foreground">Nu există documentație disponibilă.</div>
                      }
                    })()}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="text-sm flex flex-wrap items-start gap-x-3 gap-y-2 mt-2">
                  <div className="flex flex-col min-w-[140px]">
                    <div className="text-xs font-medium text-muted-foreground">Data emiterii:</div>
                    <div className="text-gray-900 whitespace-nowrap">{String(lucrare.dataEmiterii || "").split(" ")[0]}</div>
                  </div>
                  <div className="flex flex-col min-w-[140px]">
                    <div className="text-xs font-medium text-muted-foreground">Data intervenție:</div>
                    <div className="text-gray-900 whitespace-nowrap">{String(lucrare.dataInterventie || "").split(" ")[0]}</div>
                  </div>
                  {lucrare.timpSosire && (
                    <div className="flex flex-col min-w-[160px]">
                      <div className="text-xs font-medium text-muted-foreground">Sosire la locație:</div>
                      <div className="text-gray-900 whitespace-nowrap">{lucrare.dataSosire} {lucrare.oraSosire}</div>
                    </div>
                  )}
                  {lucrare.timpPlecare && (
                    <div className="flex flex-col min-w-[160px]">
                      <div className="text-xs font-medium text-muted-foreground">Plecare de la locație:</div>
                      <div className="text-gray-900 whitespace-nowrap">{lucrare.dataPlecare} {lucrare.oraPlecare}</div>
                    </div>
                  )}
                  {lucrare.timpSosire && lucrare.timpPlecare && (
                    <div className="flex flex-col min-w-[120px]">
                      <div className="text-xs font-medium text-muted-foreground">Durata intervenție:</div>
                      <div className="text-gray-900 whitespace-nowrap">{calculateInterventionDuration(lucrare)}</div>
                    </div>
                  )}
                </div>

                {/* Linie de separare */}
                <Separator className="my-4" />

                {/* Tehnicieni asignați – etichetă și valori pe același rând */}
                <div className="mt-4 text-base mb-4 w-full flex items-center flex-wrap gap-2">
                  <span className="font-semibold">Tehnicieni asignați:</span>
                  <div className="flex flex-wrap gap-2">
                    {lucrare.tehnicieni.map((tehnician, index) => (
                      <Badge key={index} variant="secondary" className="text-base font-normal px-4 py-2 rounded-md">
                        {tehnician}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Revizie – lista echipamentelor din lucrare (optimizat mobile) */}
                {lucrare.tipLucrare === "Revizie" && (
                  <div className="mt-4 sm:mt-6">
                    {/* Header cu progres - responsive */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4 bg-slate-50 p-3 rounded-lg">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Echipamente în revizie</h3>
                      {Array.isArray(lucrare.equipmentIds) && lucrare.equipmentIds.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                            {lucrare.equipmentIds.filter((eid: string) => (lucrare.revision?.equipmentStatus || {})[eid] === "done").length} / {lucrare.equipmentIds.length} completate
                          </Badge>
                        </div>
                      )}
                    </div>

                    {Array.isArray(lucrare.equipmentIds) && lucrare.equipmentIds.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {lucrare.equipmentIds.map((eid: string, index: number) => {
                          const status = (lucrare.revision?.equipmentStatus || {})[eid] || "pending"
                          const loc = clientData?.locatii?.find((l: any) => l.nume === lucrare.locatie)
                          const eq = loc?.echipamente?.find((e: any) => e.id === eid)
                          
                          // Debug logging
                          if (index === 0) {
                            console.log("🔍 Debug Revizie QR:", { 
                              eid, 
                              hasEq: !!eq,
                              eq: eq,
                              role, 
                              isDispatcherOrAdmin: role === "dispecer" || role === "admin",
                              shouldShowQR: (role === "dispecer" || role === "admin") && !!eq,
                              client: lucrare.client,
                              locatie: lucrare.locatie
                            })
                          }
                          
                          const statusConfigs = {
                            done: {
                              label: "✓ Revizuit",
                              bgClass: "bg-green-50 border-green-300",
                              badgeClass: "bg-green-500 text-white",
                              buttonClass: "bg-green-600 hover:bg-green-700 text-white border-green-600",
                              buttonVariant: "outline" as const,
                              buttonText: "Vezi fișa",
                            },
                            in_progress: {
                              label: "⋯ În lucru",
                              bgClass: "bg-amber-50 border-amber-300",
                              badgeClass: "bg-amber-500 text-white",
                              buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
                              buttonVariant: "default" as const,
                              buttonText: "Continuă",
                            },
                            pending: {
                              label: "○ În așteptare",
                              bgClass: "bg-white border-gray-300",
                              badgeClass: "bg-gray-500 text-white",
                              buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
                              buttonVariant: "default" as const,
                              buttonText: "Începe revizia",
                            },
                          }
                          
                          const statusConfig = statusConfigs[status as keyof typeof statusConfigs] || statusConfigs.pending

                          return (
                            <div 
                              key={eid} 
                              className={`relative rounded-xl border-2 overflow-hidden transition-all active:scale-[0.98] ${statusConfig.bgClass}`}
                            >
                              {/* Header card cu număr și status */}
                              <div className="flex items-center justify-between p-3 border-b border-current/10 bg-white/50">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                  </div>
                                  <Badge className={`${statusConfig.badgeClass} text-xs font-semibold px-2 py-1`}>
                                    {statusConfig.label}
                                  </Badge>
                                </div>
                                
                                {/* QR Code Icon - doar pentru dispecer și admin */}
                                {(role === "dispecer" || role === "admin") && eq && (
                                  <div className="flex items-center">
                                    <EquipmentQRCode
                                      equipment={eq}
                                      clientName={lucrare.client}
                                      locationName={lucrare.locatie}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Informații echipament - stack vertical pentru mobile */}
                              <div className="p-4">
                                <h4 className="text-lg font-bold mb-2 text-gray-900 leading-tight">
                                  {eq?.nume || "Echipament necunoscut"}
                                </h4>
                                
                                <div className="space-y-1.5 mb-4">
                                  {eq?.cod && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 font-medium min-w-[60px]">Cod:</span>
                                      <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">
                                        {eq.cod}
                                      </span>
                                    </div>
                                  )}
                                  {eq?.model && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 font-medium min-w-[60px]">Model:</span>
                                      <span className="text-sm text-gray-700">{eq.model}</span>
                                    </div>
                                  )}
                                  {eq?.producator && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 font-medium min-w-[60px]">Brand:</span>
                                      <span className="text-sm text-gray-700">{eq.producator}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Buton mare pentru touch - full width pe mobile */}
                                <Button
                                  onClick={() => router.push(`/dashboard/lucrari/${lucrare.id}/revizie/${eid}`)}
                                  className={`w-full h-12 text-base font-semibold rounded-lg ${statusConfig.buttonClass}`}
                                  size="lg"
                                >
                                  {statusConfig.buttonText}
                                </Button>
                                
                                {/* Descărcare fișa de operațiuni pentru acest echipament */}
                                <div className="mt-2">
                                  <Button
                                    variant="outline"
                                    className="w-full h-10 text-sm font-medium rounded-lg"
                                    onClick={async () => {
                                      try {
                                        if (!lucrare?.id) return
                                        const blob = await generateRevisionEquipmentPDF(String(lucrare.id), String(eid))
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        // Construim numele fișierului pe baza numelui echipamentului
                                        const equipLabel = String(eq?.nume || eq?.name || eq?.model || eid || "Echipament")
                                        const safeLabel = equipLabel.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
                                        a.download = `Fisa_Operatiuni_${safeLabel}.pdf`
                                        document.body.appendChild(a)
                                        a.click()
                                        a.remove()
                                        URL.revokeObjectURL(url)
                                      } catch (e) {
                                        console.error("Eroare la generarea fișei de operațiuni:", e)
                                        toast({
                                          title: "Eroare",
                                          description: "Nu s-a putut genera fișa de operațiuni pentru acest echipament.",
                                          variant: "destructive",
                                        })
                                      }
                                    }}
                                  >
                                    <Download className="mr-2 h-4 w-4" />
                                    Descarcă fișa (PDF)
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground bg-gray-50 rounded-xl border-2 border-dashed">
                        <p className="text-sm">Nu există echipamente atașate acestei revizii.</p>
                      </div>
                    )}

                    {/* Info și buton finalizare revizie - doar pentru tehnicieni */}
                    {role === "tehnician" && (
                      <>
                        <div className="mt-4 sm:mt-6">
                          <Alert className="bg-blue-50 border-blue-200">
                            <AlertCircle className="h-4 w-4 text-blue-500" />
                            <AlertTitle>Finalizare revizie</AlertTitle>
                            <AlertDescription>
                              După ce toate echipamentele au fost revizuite, folosește butonul de mai jos pentru a finaliza lucrarea cu semnătură și raport.
                            </AlertDescription>
                          </Alert>
                        </div>

                        {/* Buton Generează raport - sticky la bottom pentru tehnicieni (ascuns dacă raportul este deja generat) */}
                        {!lucrare.raportGenerat && (
                          <div className="mt-4 sm:mt-6 sticky bottom-4 z-10">
                            <Button
                              onClick={handleGenerateReport}
                              disabled={
                                (() => {
                                  if (!Array.isArray(lucrare.equipmentIds)) return true
                                  const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                                  const completed = lucrare.equipmentIds.filter((id) => status[id] === "done")
                                  // Generare raport disponibilă DOAR când toate echipamentele sunt finalizate
                                  return completed.length !== lucrare.equipmentIds.length
                                })()
                              }
                              className="w-full h-14 text-base font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                              size="lg"
                            >
                              <FileText className="mr-2 h-5 w-5" />
                              Generează raport
                            </Button>
                            {/* Finalizare parțială – disponibilă dacă cel puțin un echipament este finalizat dar nu toate */}
                            {Array.isArray(lucrare.equipmentIds) && (() => {
                              const st = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                              const all = lucrare.equipmentIds || []
                              const done = all.filter((id) => st[id] === "done")
                              return done.length > 0 && done.length < all.length
                            })() && (
                              <div className="mt-2">
                                <Button
                                  variant="outline"
                                  className="w-full h-12 text-base font-semibold rounded-xl"
                                  onClick={handleFinalizePartial}
                                  disabled={isFinalizingPartial}
                                >
                                  {isFinalizingPartial ? "Se finalizează..." : "Finalizează parțial"}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Afișăm mesajul de reatribuire dacă există */}
                {lucrare.mesajReatribuire && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md my`-4">
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
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-md mb-4">
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
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-md mb-4">
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
                      {/* Motive dinamice din Setări */}
                      {Array.isArray(lucrare.reinterventieMotiv.motive) && lucrare.reinterventieMotiv.motive.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {lucrare.reinterventieMotiv.motive.map((m: string, idx: number) => (
                            <span key={`${m}-${idx}`} className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      {lucrare.reinterventieMotiv.dataReinterventie && (
                        <div className="flex flex-col sm:flex-row sm:justify-between text-xs text-orange-600 mt-3 pt-2 border-t border-orange-200">
                          <span>Reintervenție decisă pe: {lucrare.reinterventieMotiv.dataReinterventie}</span>
                          {lucrare.reinterventieMotiv.decisaDe && <span>de către: {lucrare.reinterventieMotiv.decisaDe}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Feedback client (vizibil pentru admin/dispecer) */}
                {(isAdminOrDispatcher) && (() => {
                  const rating = (lucrare as any)?.raportSnapshot?.clientRating ?? (lucrare as any)?.clientRating
                  const review = (lucrare as any)?.raportSnapshot?.clientReview ?? (lucrare as any)?.clientReview
                  if (!rating && !review) return null
                  const stars = typeof rating === 'number' ? Math.max(1, Math.min(5, Math.round(rating))) : null
                  return (
                    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-semibold text-gray-900">Feedback Client</h3>
                            {stars ? (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center">
                                  {[...Array(5)].map((_, idx) => (
                                    <svg 
                                      key={idx}
                                      className={`w-4 h-4 ${idx < stars ? 'text-yellow-400' : 'text-gray-300'}`}
                                      fill="currentColor" 
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  ))}
                                </div>
                                <span className="text-xs font-medium text-gray-600 bg-white px-2 py-0.5 rounded-full">
                                  {stars}/5
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {review ? (
                        <div className="px-4 py-3">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line italic">
                            "{String(review)}"
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })()}

                {/* Afișăm reintervențiile derivate dacă există */}
                {reinterventii.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mb-4">
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
                          {reinterventii.map((reinterventie, index) => (
                            <div
                              key={reinterventie.id}
                              className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                                    Reintervenție #{index + 1}
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs bg-blue-100 text-blue-800 border-blue-300 rounded-md"
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
                          {reinterventie.defectReclamat && (
                            <div className="text-xs text-gray-700 mt-1">
                              Defect reclamat: <span className="font-medium">{reinterventie.defectReclamat}</span>
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
                {/* Email status card */}
                {(lucrare?.lastReportEmail || lucrare?.lastOfferEmail) && (
                  <div className="p-3 border rounded-md bg-white">
                    <p className="text-sm font-semibold mb-2">Email status</p>
                    {lucrare?.lastReportEmail && (
                      <div className="text-sm flex flex-wrap gap-2 items-center mb-1">
                        <Badge variant="outline">Raport</Badge>
                        <span>Status: {lucrare.lastReportEmail.status || '-'}</span>
                        {lucrare.lastReportEmail.sentAt && <span>• {String(lucrare.lastReportEmail.sentAt)}</span>}
                        {Array.isArray(lucrare.lastReportEmail.to) && lucrare.lastReportEmail.to.length > 0 && (
                          <span>• către {lucrare.lastReportEmail.to.join(', ')}</span>
                        )}
                      </div>
                    )}
                    {lucrare?.lastOfferEmail && (
                      <div className="text-sm flex flex-wrap gap-2 items-center">
                        <Badge variant="outline">Ofertă</Badge>
                        <span>Status: {lucrare.lastOfferEmail.status || '-'}</span>
                        {lucrare.lastOfferEmail.sentAt && <span>• {String(lucrare.lastOfferEmail.sentAt)}</span>}
                        {Array.isArray(lucrare.lastOfferEmail.to) && lucrare.lastOfferEmail.to.length > 0 && (
                          <span>• către {lucrare.lastOfferEmail.to.join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Rând cu: Locație | Persoană contact (locație) | Echipament */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                  {/* Locație */}
                  <div>
                    <p className="text-base font-semibold mb-2">Locație:</p>
                    <p className="text-base mb-1">{lucrare.locatie}</p>
                    {locationAddress && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                          <MapPin className="h-4 w-4" />
                          {locationAddress}
                        </p>
                        <div className="flex gap-2">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationAddress)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Google Maps
                          </a>
                          <a
                            href={`https://waze.com/ul?q=${encodeURIComponent(locationAddress)}&navigate=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Waze
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Persoană contact */}
                  <div>
                    <p className="text-base font-semibold mb-2">Persoană contact (locație):</p>
                    <p className="text-sm mb-2">{lucrare.persoanaContact}</p>
                    {/* Email persoană de contact dacă există în clientData pentru locația curentă */}
                    {clientData?.locatii && (
                      () => {
                        const loc = clientData.locatii.find((l: any) => l.nume === lucrare.locatie)
                        const contact = loc?.persoaneContact?.find((c: any) => c.nume === lucrare.persoanaContact)
                        return contact?.email ? (
                          <div className="text-sm mb-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-all">{contact.email}</span>
                              <a
                                href={`mailto:${contact.email}`}
                                className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                                aria-label={`Scrie email către ${contact.email}`}
                                title={`Scrie email către ${contact.email}`}
                              >
                                <Mail className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        ) : null
                      }
                    )()}
                    <div className="text-sm flex items-center gap-2">
                      <span>{lucrare.telefon}</span>
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

                  {/* Echipament */}
                  <div>
                    <p className="text-base font-semibold mb-2">Echipament:</p>
                    <p className="text-sm mb-2">
                      {lucrare.echipament ? `${lucrare.echipament}` : "Nespecificat"}
                    </p>
                    <div className="space-y-1">
                      {role !== "tehnician" && lucrare.echipamentCod && (
                        <div className="text-sm flex items-center gap-2">
                          <span className="font-medium text-blue-600">Cod:</span>
                          <span className="text-blue-600">{lucrare.echipamentCod}</span>
                          <EquipmentQRCode
                            equipment={{
                              id: lucrare.id || "",
                              cod: lucrare.echipamentCod,
                              nume: lucrare.echipament || "Echipament necunoscut",
                              model: lucrare.echipamentModel || "",
                            }}
                            clientName={lucrare.client}
                            locationName={lucrare.locatie}
                            showLabel={false}
                            useSimpleFormat={true}
                            className="h-7 w-7 p-0"
                          />
                        </div>
                      )}
                      {lucrare.echipamentModel && (
                        <p className="text-sm">
                          <span className="font-medium text-blue-600">Model:</span>{" "}
                          <span className="text-blue-600">{lucrare.echipamentModel}</span>
                        </p>
                      )}
                      {lucrare.textReinterventie && (
                        <p className="text-sm">
                          <span className="font-medium text-blue-600">Text reintervenție:</span>{" "}
                          <span className="text-blue-600">{lucrare.textReinterventie}</span>
                        </p>
                      )}
                      {lucrare.statusEchipament && (
                        <p className="text-sm flex items-center mt-2">
                          <span className="font-medium mr-2">Status:</span>
                          <span
                            className={`text-sm font-medium px-2 py-1 rounded ${
                              lucrare.statusEchipament === "Funcțional"
                                ? "bg-green-100 text-green-700"
                                : lucrare.statusEchipament === "Parțial funcțional"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : lucrare.statusEchipament === "Nefuncțional"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {lucrare.statusEchipament}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* Separator înainte de secțiunile de detalii */}
                <Separator className="my-4" />
                
                <div className="space-y-4">
                  {/* Defecte reclamate (istoric + curent) */}
                  <div>
                    <p className="text-base font-semibold mb-2">Defecte reclamate:</p>
                    {/* Istoric dacă există */}
                    {Array.isArray((lucrare as any).defectReclamatHistory) && (lucrare as any).defectReclamatHistory.length > 0 ? (
                      <div className="space-y-1 mb-2">
                        {(lucrare as any).defectReclamatHistory.map((val: string, idx: number) => (
                          <div key={idx} className="text-sm text-gray-700">
                            <span className="font-medium">
                              {idx === 0 ? "Defect reclamat original" : `Defect reclamat RE${idx}`}:
                            </span>{" "}
                            <span>{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Curent (evidențiat) */}
                    <div className="text-base">
                      <span className="font-semibold mr-1">{(Array.isArray((lucrare as any).defectReclamatHistory) && (lucrare as any).defectReclamatHistory.length > 0) ? `Defect reclamat RE${(lucrare as any).defectReclamatHistory.length}` : "Defect reclamat"}:</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800">
                        {lucrare.defectReclamat || "Nu a fost specificat"}
                      </span>
                    </div>
                  </div>

                  {/* Text reintervenție – doar dacă lucrarea este reintervenție și are text */}
                  {lucrare.tipLucrare === "Reintervenție" && lucrare.textReinterventie && (
                    <div>
                      <p className="text-base font-semibold mb-2">Text reintervenție:</p>
                      <p className="text-base text-gray-600">{lucrare.textReinterventie}</p>
                    </div>
                  )}

                  {/* Constatare la locație */}
                  {lucrare.constatareLaLocatie && (
                    <div>
                      <p className="text-base font-semibold mb-2">Constatare la locație:</p>
                      <p className="text-base text-gray-600">{lucrare.constatareLaLocatie}</p>
                    </div>
                  )}

                  {/* Descriere intervenție */}
                  {lucrare.descriereInterventie && (
                    <div>
                      <p className="text-base font-semibold mb-2">Descriere intervenție:</p>
                      <p className="text-base text-gray-600">{lucrare.descriereInterventie}</p>
                    </div>
                  )}

                  {/* Notă internă – fallback dacă nu există raport (vizibilă pentru non-clienți) */}
                  {role !== "client" && !(lucrare.raportGenerat && lucrare.numarRaport) && (lucrare.descriere || lucrare.notaInternaTehnician) && (
                    <div className="mt-4">
                      <p className="text-base font-semibold mb-2">Notă internă:</p>
                      <div className="space-y-1">
                        {lucrare.descriere && (
                          <div>
                            <span className="font-semibold text-base mr-2">Dispecer:</span>
                            <span className="text-base text-gray-600">{lucrare.descriere}</span>
                          </div>
                        )}
                        {lucrare.notaInternaTehnician && (
                          <div>
                            <span className="font-semibold text-base mr-2">Tehnician:</span>
                            <span className="text-base text-gray-600">{lucrare.notaInternaTehnician}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>

                {/* Separator după secțiunile de detalii */}
                <Separator className="my-4" />
                
                {/* Afișăm numărul raportului dacă a fost generat */}
                {lucrare.raportGenerat && lucrare.numarRaport && (
                  <div className="mt-2">
              
                    {/* Afișare Notă internă: Dispecer/Tehnician */}
                    {role !== "client" && (lucrare.descriere || lucrare.notaInternaTehnician) && (
                      <div className="mt-4">
                        <p className="text-base font-semibold mb-2">Notă internă:</p>
                        <div className="space-y-1">
                          {lucrare.descriere && (
                            <div>
                              <span className="font-semibold text-base mr-2">Dispecer:</span>
                              <span className="text-base text-gray-600">{lucrare.descriere}</span>
                            </div>
                          )}
                          {lucrare.notaInternaTehnician && (
                            <div>
                              <span className="font-semibold text-base mr-2">Tehnician:</span>
                              <span className="text-base text-gray-600">{lucrare.notaInternaTehnician}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                      <Badge className={warrantyInfo.statusBadgeClass + " rounded-md"}>
                        {warrantyInfo.statusText}
                      </Badge>
                    </div>

                    {/* Calculul automat al garanției */}
                    <div className="p-3 bg-white rounded-md border mb-3">
                      <h5 className="font-medium text-sm mb-2">Calculul automat al garanției:</h5>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                          <span className="text-gray-600">Status:</span>
                          <Badge className={warrantyInfo.statusBadgeClass + " ml-1 rounded-md"}>
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
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md mb-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-yellow-800">
                            Confirmarea tehnicianului la fața locului:
                          </span>
                          <Badge 
                            className={lucrare.tehnicianConfirmaGarantie 
                              ? "bg-green-100 text-green-800 border-green-200 rounded-md" 
                              : "bg-red-100 text-red-800 border-red-200 rounded-md"
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
                <CardDescription className="text-base font-semibold text-gray-600">{lucrare.client}</CardDescription>
              </CardHeader>
              <CardContent>
             
                <div className="text-sm grid grid-cols-1 sm:grid-cols-4 gap-x-6 gap-y-2 w-full items-start">
                  {clientData && (
                    <>
                      <div className="flex flex-col min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">Telefon Principal:</div>
                        <div className="text-gray-900 whitespace-normal break-words flex items-center gap-2">
                          {clientData.telefon || "N/A"}
                          {clientData.telefon && (
                            <a
                              href={`tel:${formatPhoneForCall(clientData.telefon)}`}
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                              aria-label={`Apelează ${clientData.telefon}`}
                              title={`Apelează ${clientData.telefon}`}
                            >
                              <Phone className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">Email (client):</div>
                        <div className="text-gray-900 whitespace-normal break-words flex flex-col gap-1">
                          <span className="break-words" title={clientData.email || "N/A"}>{clientData.email || "N/A"}</span>
                          {clientData.email && (
                            <a
                              href={`mailto:${clientData.email}`}
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                              aria-label={`Scrie email către ${clientData.email}`}
                              title={`Scrie email către ${clientData.email}`}
                            >
                              <Mail className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">Reprezentant Firmă:</div>
                        <div className="text-gray-900 whitespace-normal break-words">{clientData.reprezentantFirma || "N/A"}{clientData.functieReprezentant ? `, ${clientData.functieReprezentant}` : ""}</div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">CUI/CIF:</div>
                        <div className="text-gray-900 whitespace-normal break-words">{(clientData as any)?.cif || "N/A"}</div>
                      </div>
                  {isAdminOrDispatcher && (
                    <div className="flex flex-col min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">Nr. ordine ONRC:</div>
                      <div className="text-gray-900 whitespace-normal break-words">{(clientData as any)?.regCom || "N/A"}</div>
                    </div>
                  )}
                    </>
                  )}
                </div>
                <Separator className="my-4" />
  {/* Rezumat statusuri – lucrare, preluare, ofertare, facturare (etichetă deasupra valorii) */}
  {role !== "tehnician" && (
    <div className="mb-4">
      <div className="text-base font-semibold mb-2">Statusuri</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Lucrare:</span>
          {role === "admin" ? (
            <Select
              value={lucrare.statusLucrare}
              onValueChange={async (newStatus) => {
                try {
                  setIsUpdating(true)
                  await updateLucrare(paramsId, { statusLucrare: newStatus })
                  
                  // Actualizăm imediat starea locală pentru feedback vizual instant
                  setLucrare(prev => prev ? { ...prev, statusLucrare: newStatus } : null)
                  
                  toast({ 
                    title: "Succes", 
                    description: `Statusul lucrării a fost schimbat în "${newStatus}"` 
                  })
                  
                  // Reîncarcăm datele complete din baza de date pentru sincronizare
                  const updatedData = await getLucrareById(paramsId)
                  if (updatedData) {
                    setLucrare(updatedData)
                  }
                } catch (error) {
                  console.error("Eroare la actualizarea statusului:", error)
                  toast({ 
                    title: "Eroare", 
                    description: "Nu s-a putut actualiza statusul lucrării", 
                    variant: "destructive" 
                  })
                } finally {
                  setIsUpdating(false)
                }
              }}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-[180px] mt-0.5">
                <SelectValue placeholder="Selectează status" />
              </SelectTrigger>
              <SelectContent>
                {WORK_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "Finalizat" ? "Raport generat" : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="mt-0.5">
              <Badge className="rounded-md">
                {lucrare.statusLucrare === "Finalizat" ? "Raport generat" : lucrare.statusLucrare}
              </Badge>
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Preluare:</span>
          <span className="mt-0.5">
            <Badge 
              variant="outline" 
              className={lucrare.preluatDispecer 
                ? "bg-green-50 text-green-700 border-green-300 px-3 py-1 rounded-md" 
                : "bg-yellow-50 text-yellow-700 border-yellow-300 px-3 py-1 rounded-md"}
            >
              {lucrare.preluatDispecer 
                ? `Preluat de ${lucrare.preluatDe || 'Dispecer'}` 
                : "Ne-preluat"}
            </Badge>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Ofertare:</span>
          <span className="mt-0.5">
            <Badge variant="outline" className="rounded-md">
              {(() => {
                const resp = lucrare.offerResponse?.status
                if (resp === "accept") return "Da (acceptată)"
                if (resp === "reject") return "Da (refuzată)"
                if (lucrare.statusOferta) return String(lucrare.statusOferta)
                return "N/A"
              })()}
            </Badge>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Facturare:</span>
          <span className="mt-0.5"><Badge variant="outline" className="rounded-md">{lucrare.statusFacturare}</Badge></span>
        </div>
      </div>
    </div>
  )}
                {/* Setări ofertă – ascunse integral dacă lucrarea este arhivată */}
                {(role === "admin" || role === "dispecer") && lucrare.statusLucrare !== "Arhivată" && (
                  <div className="p-4 border rounded-md bg-blue-50 border-blue-200 mb-4">
                    {/* Header cu titlu */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white text-sm font-bold">O</span>
                        </div>
                        <h4 className="text-base font-semibold text-blue-900">Ofertare</h4>
                      </div>
                    </div>

                    {(!lucrare.preluatDispecer || lucrare.statusLucrare === "Arhivată") && (
                      <div className="flex items-start gap-3 text-sm bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 shadow-sm mb-4">
                        <div className="flex-shrink-0">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-amber-900">Editor indisponibil</p>
                          <p className="text-amber-700 mt-1">
                            {lucrare.statusLucrare === "Arhivată"
                              ? "Lucrarea este arhivată. Editorul de ofertă nu este disponibil."
                              : "Lucrarea trebuie preluată de dispecer/admin pentru a edita oferta."}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Flex cu 2 coloane: Necesită ofertă și Editor ofertă - aliniate la stânga */}
                      <div className="flex flex-wrap gap-8">
                        {/* Necesită ofertă - switch dedesubt */}
                        <div className="space-y-2">
                          <Label htmlFor="necesitaOfertaSwitch" className={`text-sm font-medium ${(!lucrare.preluatDispecer && !isAdminOrDispatcher) ? 'text-gray-500' : 'text-blue-800'}`}>Necesită ofertă</Label>
                          <div>
                            <Switch
                              id="necesitaOfertaSwitch"
                              checked={Boolean(lucrare.necesitaOferta)}
                              onCheckedChange={async (checked) => {
                                try {
                                  console.log("[OfertaSwitch] toggle attempt", {
                                    checked,
                                    lucrareId: lucrare?.id,
                                    preluatDispecer: lucrare?.preluatDispecer,
                                    role,
                                    isAdminOrDispatcher,
                                    lockedAfterReintervention: (lucrare as any)?.lockedAfterReintervention,
                                    statusLucrare: lucrare?.statusLucrare,
                                    currentNecesitaOferta: Boolean(lucrare?.necesitaOferta),
                                  })
                                } catch (e) {
                                  // ignore
                                }
                                // Doar non-admin/dispecer sunt blocați dacă lucrarea nu e preluată
                                if (!isAdminOrDispatcher && !lucrare.preluatDispecer) {
                                  console.warn("[OfertaSwitch] blocked: non-admin/dispecer and not picked up")
                                  toast({ title: 'Acțiune indisponibilă', description: 'Lucrarea trebuie preluată de dispecer/admin pentru a modifica setările ofertei.', variant: 'destructive' })
                                  return
                                }
                                try {
                                  setIsUpdating(true)
                                  const updateData: any = { necesitaOferta: checked }
                                  if (!checked) {
                                    updateData.comentariiOferta = ""
                                    updateData.statusOferta = deleteField() as any
                                  }
                                  console.log("[OfertaSwitch] calling updateLucrare with", updateData)
                                  await updateLucrare(lucrare.id!, updateData)
                                  setLucrare(prev => prev ? { ...prev, ...updateData } : null)
                                  console.log("[OfertaSwitch] update success")
                                  toast({ title: "Actualizat", description: "Setarea 'Necesită ofertă' a fost actualizată." })
                                } catch (error) {
                                  console.error("[OfertaSwitch] error updating necesitaOferta:", error)
                                  toast({ title: "Eroare", description: "Nu s-a putut actualiza setarea.", variant: 'destructive' })
                                } finally {
                                  setIsUpdating(false)
                                }
                              }}
                              disabled={isUpdating ? true : false}
                              className={!isAdminOrDispatcher && !lucrare.preluatDispecer ? 'opacity-50' : ''}
                            />
                          </div>
                        </div>

                        {/* Editor ofertă - buton dedesubt */}
                        <div className="space-y-2">
                          <Label className={`text-sm font-medium ${!lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată' ? 'text-gray-500' : 'text-blue-800'}`}>Editor ofertă</Label>
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (lucrare.statusLucrare === "Arhivată") {
                                  toast({ title: 'Editor indisponibil', description: 'Editorul de ofertă nu este disponibil pentru lucrări arhivate.', variant: 'destructive' })
                                  return
                                }
                                if (!lucrare.preluatDispecer) {
                                  toast({ title: 'Editor indisponibil', description: 'Lucrarea trebuie preluată de dispecer/admin înainte de editarea ofertei.', variant: 'destructive' })
                                  return
                                }
                                setIsOfferEditorOpen(true)
                              }}
                              disabled={isUpdating || !lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată'}
                              className={!lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată' ? 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-100 hover:text-gray-500 cursor-not-allowed' : ''}
                            >
                              Deschide editor
                            </Button>
                          </div>
                          {(lucrare as any)?.ofertaDocument?.url && (
                            <div>
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-blue-600 text-white hover:bg-blue-700"
                                onClick={() => {
                                  const url = (lucrare as any)?.ofertaDocument?.url
                                  if (url) {
                                    window.open(`/api/download?lucrareId=${encodeURIComponent(lucrare.id!)}&type=oferta&url=${encodeURIComponent(url)}`, '_blank')
                                  }
                                }}
                              >
                                Vizualizează ofertă (PDF)
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Comentarii ofertă */}
                      {lucrare.necesitaOferta && (
                        <div className="space-y-2">
                          <Label htmlFor="comentariiOferta" className={`text-sm font-medium ${!lucrare.preluatDispecer ? 'text-gray-500' : 'text-blue-800'}`}>Comentarii ofertă</Label>
                          <Textarea
                            id="comentariiOferta"
                            value={lucrare.comentariiOferta || ""}
                            onChange={(e) => {
                              if (!lucrare.preluatDispecer) {
                                toast({ title: 'Acțiune indisponibilă', description: 'Lucrarea trebuie preluată de dispecer/admin pentru a modifica comentariile ofertei.', variant: 'destructive' })
                                return
                              }
                              setLucrare(prev => prev ? { ...prev, comentariiOferta: e.target.value } : prev)
                            }}
                            onBlur={async () => {
                              if (!lucrare.preluatDispecer) return
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
                            placeholder={!lucrare.preluatDispecer ? "Indisponibil până la preluarea lucrării..." : "Detalii relevante pentru ofertă..."}
                            className={`min-h-[80px] text-sm ${!lucrare.preluatDispecer ? 'bg-gray-50 text-gray-500 border-gray-300 cursor-not-allowed' : ''}`}
                            disabled={isUpdating || !lucrare.preluatDispecer}
                          />
                        </div>
                      )}
                      {/* Răspuns ofertă din portal (read-only) */}
                      {lucrare.offerResponse?.status && (
                        <div className="p-3 rounded border bg-white">
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
                            <div className="text-xs text-gray-500 mt-1">
                              {(() => {
                                try {
                                  const at: any = (lucrare as any).offerResponse?.at
                                  const d = at?.toDate ? at.toDate() : new Date(at)
                                  return isNaN(d?.getTime?.() ?? Number.NaN) ? '-' : d.toLocaleString('ro-RO')
                                } catch {
                                  return '-'
                                }
                              })()}
                            </div>
                          )}
                          {(lucrare as any)?.acceptedOfferSnapshot && lucrare.statusLucrare !== 'Arhivată' && (
                            <div className="mt-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsOfferEditorOpen(true)}
                                className="bg-green-600 text-white hover:bg-green-700"
                              >
                                Deschide versiunea acceptată în editor
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Snapshot produse la generarea raportului – vizibil doar pentru admin/dispecer */}
                {isAdminOrDispatcher && (lucrare as any)?.raportSnapshot?.products?.length > 0 && (
                  <div className="mt-4 p-4 border rounded-md bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-slate-600 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">P</span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900">Produse la momentul generării raportului</h4>
                      <Badge variant="outline" className="ml-1">{(lucrare as any).raportSnapshot.products.length} poziții</Badge>
                    </div>
                    <div className="overflow-x-auto rounded border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Denumire</th>
                            <th className="px-3 py-2 text-center w-20">UM</th>
                            <th className="px-3 py-2 text-right w-20">Buc</th>
                            <th className="px-3 py-2 text-right w-28">PU (lei)</th>
                            <th className="px-3 py-2 text-right w-32">Total (lei)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lucrare as any).raportSnapshot.products.map((p: any, idx: number) => {
                            const name = p?.name ?? p?.denumire ?? p?.title ?? "—"
                            const qty = Number(p?.quantity) || 0
                            const price = Number(p?.price) || 0
                            const total = qty * price
                            return (
                              <tr key={idx} className="border-t">
                                <td className="px-3 py-2 align-top">{name}</td>
                                <td className="px-3 py-2 align-top text-center">{p?.um || '-'}</td>
                                <td className="px-3 py-2 align-top text-right">{qty}</td>
                                <td className="px-3 py-2 align-top text-right">{price.toFixed(2)}</td>
                                <td className="px-3 py-2 align-top text-right font-medium">{total.toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50">
                            <td colSpan={4} className="px-3 py-2 text-right font-medium">Total lei fără TVA</td>
                            <td className="px-3 py-2 text-right font-bold">
                              {((lucrare as any).raportSnapshot.products || []).reduce((s: number, p: any) => s + ((Number(p?.quantity)||0) * (Number(p?.price)||0)), 0).toFixed(2)}
                            </td>
                          </tr>
                          {/* TVA și total cu TVA eliminate din afișare */}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Offer editor dialog - disponibil doar după preluare de către dispecer/admin */}
                {lucrare && role !== "tehnician" && lucrare.preluatDispecer && lucrare.statusLucrare !== 'Arhivată' && (
                  <OfferEditorDialog
                    lucrareId={lucrare.id!}
                    open={isOfferEditorOpen}
                    onOpenChange={setIsOfferEditorOpen}
                    initialProducts={(lucrare as any).products || []}
                    presetRecipientEmail={(clientData?.locatii || []).find((l: any) => l?.nume === lucrare.locatie)?.persoaneContact?.find((c: any) => c?.nume === lucrare.persoanaContact)?.email || undefined}
                    presetLocationLabel={`${lucrare.locatie || (lucrare as any)?.clientInfo?.locationName || ''}${(lucrare as any)?.clientInfo?.locationAddress ? ` — ${(lucrare as any).clientInfo.locationAddress}` : ''}`}
                  />
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

                {/* Documente PDF – doar pentru admin/dispecer */}
                {isAdminOrDispatcher && (
                  <div className="mt-4">
                    <div className="mt-2 p-3">
                      <div className="text-sm text-muted-foreground mb-2">
                        Facturare: Încărcați factura sau marcați „Nu se facturează” și adăugați motivul.
                      </div>
                      <DocumentUpload
                        lucrareId={lucrare.id!}
                        lucrare={lucrare}
                        onLucrareUpdate={setLucrare}
                        hideOfertaUpload
                      />
                    </div>
                  </div>
                )}
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
                  imaginiDefecte: lucrare.imaginiDefecte,
                  // Notă internă tehnician
                  notaInternaTehnician: lucrare.notaInternaTehnician
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
                        workId={lucrare.id}
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
              <DownloadHistory 
                lucrareId={lucrare.id}
                locationEmail={(() => {
                  try {
                    const loc = (clientData?.locatii || []).find((l: any) => l?.nume === lucrare.locatie)
                    const contact = loc?.persoaneContact?.find((c: any) => c?.nume === lucrare.persoanaContact)
                    return contact?.email || loc?.email || undefined
                  } catch { return undefined }
                })()}
              />
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
