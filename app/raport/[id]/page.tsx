"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Send, ArrowLeft, Download, Lock, FileDown, Loader2, Save, Calendar, Clock, AlertTriangle, Edit } from "lucide-react"
import SignatureCanvas from "react-signature-canvas"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { useStableCallback } from "@/lib/utils/hooks"
import { ProductTableForm, type Product } from "@/components/product-table-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { ReportGenerator } from "@/components/report-generator"
import { MultiEmailInput } from "@/components/ui/multi-email-input"
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { calculateDuration, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateRevisionOperationsPDF } from "@/lib/pdf/revision-operations"

export default function RaportPage({ params }: { params: Promise<{ id: string }> }) {
  const SIG_HEIGHT = 160 // px – lasă-l fix
  const SIG_MIN_WIDTH = 360 // px - lățimea minimă pentru semnături

  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData } = useAuth()
  const { id: paramsId } = React.use(params)
  
  // Detectăm dacă trebuie să descărcăm automat raportul
  const autoDownload = searchParams.get('autoDownload') === 'true'

  // Check if user is dispatcher/admin accessing a finalized report
  const isDispatcherOrAdmin = userData?.role === "dispecer" || userData?.role === "admin"
  const [showDownloadInterface, setShowDownloadInterface] = useState(false)

  // Signature references and states
  const techSignatureRef = useRef<SignatureCanvas | null>(null)
  const clientSignatureRef = useRef<SignatureCanvas | null>(null)
  const [isTechSigned, setIsTechSigned] = useState(false)
  const [isClientSigned, setIsClientSigned] = useState(false)
  const [techSignatureData, setTechSignatureData] = useState<string | null>(null)
  const [clientSignatureData, setClientSignatureData] = useState<string | null>(null)
  const [isTechDrawing, setIsTechDrawing] = useState(false)
  const [isClientDrawing, setIsClientDrawing] = useState(false)

  const [lucrare, setLucrare] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusLucrare, setStatusLucrare] = useState<string>("")
  const [products, setProducts] = useState<Product[]>([])

  // Add email state - schimbat la array pentru emailuri multiple
  const [manualEmails, setManualEmails] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEmailSending, setIsEmailSending] = useState(false)
  const [updatedLucrare, setUpdatedLucrare] = useState<any>(null)
  // Toggle for manual multiple recipients
  const [useManualRecipients, setUseManualRecipients] = useState(false)
  
  // Add name states for signers
  const [numeTehnician, setNumeTehnician] = useState("")
  const [numeBeneficiar, setNumeBeneficiar] = useState("")
  const [clientRating, setClientRating] = useState<number | null>(null)
  const [clientReview, setClientReview] = useState<string>("")

  // State-uri pentru editarea manuală a timpului de plecare
  const [isEditingDepartureTime, setIsEditingDepartureTime] = useState(false)
  const [editingDepartureDate, setEditingDepartureDate] = useState("")
  const [editingDepartureTime, setEditingDepartureTime] = useState("")
  const [isSavingDepartureTime, setIsSavingDepartureTime] = useState(false)

  // State-uri pentru editarea manuală a timpului de sosire
  const [isEditingArrivalTime, setIsEditingArrivalTime] = useState(false)
  const [editingArrivalDate, setEditingArrivalDate] = useState("")
  const [editingArrivalTime, setEditingArrivalTime] = useState("")
  const [isSavingArrivalTime, setIsSavingArrivalTime] = useState(false)

  // State-uri pentru editarea datelor lipsă din raport
  const [isEditingMissingData, setIsEditingMissingData] = useState(false)
  const [editingTechnicianName, setEditingTechnicianName] = useState("")
  const [editingBeneficiaryName, setEditingBeneficiaryName] = useState("")
  const [editingFindingsOnSite, setEditingFindingsOnSite] = useState("")
  const [editingInterventionDescription, setEditingInterventionDescription] = useState("")
  const [isSavingMissingData, setIsSavingMissingData] = useState(false)

  const reportGeneratorRef = useRef<React.ElementRef<typeof ReportGenerator>>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)

  // Function to download PDF for dispatcher/admin
  const downloadPDF = useCallback(async () => {
    if (!lucrare || !reportGeneratorRef.current) return
    
    setIsSubmitting(true)
    try {
      // Trigger PDF generation with locked data
      reportGeneratorRef.current.click()
      
      toast({
        title: "Descărcare în curs",
        description: "PDF-ul se generează și va fi descărcat automat...",
      })
    } catch (error) {
      console.error("Eroare la descărcarea PDF-ului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut descărca PDF-ul.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [lucrare])

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const data = await getLucrareById(paramsId)
        if (data) {
          // Ensure all required fields exist with default values if missing
          const processedData = {
            ...data,
            // Add default values for potentially missing fields
            constatareLaLocatie: data.constatareLaLocatie || "",
            descriereInterventie: data.descriereInterventie || "",
            defectReclamat: data.defectReclamat || "",
            textReinterventie: (data as any).textReinterventie || "",
            descriere: data.descriere || "",
            persoanaContact: data.persoanaContact || "",
            products: data.products || [],
            emailDestinatar: (data as any).emailDestinatar || "",
            statusLucrare: data.statusLucrare || "În lucru",
            tehnicieni: data.tehnicieni || [],
            client: data.client || "",
            locatie: data.locatie || "",
            dataInterventie: data.dataInterventie || "",
          }

          setLucrare(processedData)
          setStatusLucrare(processedData.statusLucrare)

          // Download-only mode:
          // - admin/dispecer: always
          // - client: always (nu trebuie să editeze raportul)
          // - autoDownload=true: allow for any role to trigger PDF download reliably
          const isClient = userData?.role === "client"
          if ((isDispatcherOrAdmin || isClient || autoDownload) && processedData.raportGenerat) {
            setShowDownloadInterface(true)
          }

          console.log("📖 LUCRARE ÎNCĂRCATĂ DIN FIRESTORE:", {
            id: processedData.id,
            raportGenerat: processedData.raportGenerat,
            raportDataLocked: processedData.raportDataLocked,
            hasRaportSnapshot: !!processedData.raportSnapshot,
            snapshotKeys: processedData.raportSnapshot ? Object.keys(processedData.raportSnapshot) : [],
            snapshotData: processedData.raportSnapshot,
            userRole: userData?.role,
            isDispatcherOrAdmin: isDispatcherOrAdmin,
            willShowDownloadInterface: (isDispatcherOrAdmin || userData?.role === "client" || autoDownload) && processedData.raportGenerat,
            // DEBUG: Verificăm datele principale
            products: processedData.products,
            semnaturaTehnician: !!processedData.semnaturaTehnician,
            semnaturaBeneficiar: !!processedData.semnaturaBeneficiar,
            durataInterventie: processedData.durataInterventie,
            timpPlecare: processedData.timpPlecare,
            dataGenerare: processedData.raportSnapshot?.dataGenerare
          })

          // DEBUGGING SUPLIMENTAR pentru această problemă specifică
          if (isDispatcherOrAdmin && processedData.raportGenerat) {
            console.log("🔍 DEBUGGING PENTRU ADMIN/DISPECER:")
            console.log("📊 Produse în tichet principală:", processedData.products?.length || 0)
            console.log("📊 Produse în snapshot:", processedData.raportSnapshot?.products?.length || 0)
            console.log("🖊️ Semnătura tehnician în tichet:", !!processedData.semnaturaTehnician)
            console.log("🖊️ Semnătura tehnician în snapshot:", !!processedData.raportSnapshot?.semnaturaTehnician)
            console.log("🖊️ Semnătura beneficiar în tichet:", !!processedData.semnaturaBeneficiar)
            console.log("🖊️ Semnătura beneficiar în snapshot:", !!processedData.raportSnapshot?.semnaturaBeneficiar)
            console.log("⏱️ Durata în tichet:", processedData.durataInterventie || "N/A")
            console.log("⏱️ Durata în snapshot:", processedData.raportSnapshot?.durataInterventie || "N/A")
            console.log("📅 Data generare snapshot:", processedData.raportSnapshot?.dataGenerare || "LIPSEȘTE")
            
            // DEBUGGING SPECIFIC PENTRU TIMPUL DE SOSIRE ȘI PLECARE
            console.log("🕐 DEBUGGING TIMPI INTERVENȚIE:")
            console.log("⏰ timpSosire în tichet:", processedData.timpSosire || "LIPSEȘTE")
            console.log("⏰ timpPlecare în tichet:", processedData.timpPlecare || "LIPSEȘTE")
            console.log("⏰ timpPlecare în snapshot:", processedData.raportSnapshot?.timpPlecare || "LIPSEȘTE")
            console.log("📅 dataSosire în tichet:", processedData.dataSosire || "LIPSEȘTE")
            console.log("📅 dataPlecare în tichet:", processedData.dataPlecare || "LIPSEȘTE") 
            console.log("🕒 oraSosire în tichet:", processedData.oraSosire || "LIPSEȘTE")
            console.log("🕒 oraPlecare în tichet:", processedData.oraPlecare || "LIPSEȘTE")
            
            // Încercăm să calculăm durata în timp real dacă timpii există
            if (processedData.timpSosire && processedData.timpPlecare) {
              try {
                const { calculateDuration } = await import("@/lib/utils/time-format")
                const calculatedDuration = calculateDuration(processedData.timpSosire, processedData.timpPlecare)
                console.log("🧮 Durata CALCULATĂ în timp real:", calculatedDuration)
                
                // VERIFICARE PENTRU TIMPI CORUPTI
                const sosireDate = new Date(processedData.timpSosire)
                const plecareDate = new Date(processedData.timpPlecare)
                const currentYear = new Date().getFullYear()
                
                console.log("📅 VERIFICARE TIMPI:")
                console.log("⏰ Data sosire interpretată:", sosireDate.toLocaleString('ro-RO'))
                console.log("⏰ Data plecare interpretată:", plecareDate.toLocaleString('ro-RO'))
                console.log("📊 Anul curent:", currentYear)
                console.log("📊 Anul sosire:", sosireDate.getFullYear())
                console.log("📊 Anul plecare:", plecareDate.getFullYear())
                
                if (sosireDate.getFullYear() > currentYear || plecareDate.getFullYear() > currentYear) {
                  console.log("🚨 ALERTĂ: TIMPI ÎN VIITOR DETECTAȚI!")
                  console.log("🚨 Aceasta este o problemă gravă de date corupte!")
                }
                
                const diffMs = plecareDate.getTime() - sosireDate.getTime()
                const diffHours = diffMs / (1000 * 60 * 60)
                console.log("⏱️ Diferența în ore:", diffHours)
                
                if (diffHours > 72) {
                  console.log("ℹ️ INFO: Durata lungă detectată!")
                  console.log("ℹ️ Durata de", Math.round(diffHours), "ore (", Math.round(diffHours / 24), "zile)")
                }
                
              } catch (e) {
                console.log("❌ Eroare la calculul duratei:", e)
              }
            } else {
              console.log("⚠️ Nu se poate calcula durata - lipsesc timpSosire sau timpPlecare")
              console.log("📊 timpSosire disponibil:", !!processedData.timpSosire)
              console.log("📊 timpPlecare disponibil:", !!processedData.timpPlecare)
            }
          }

          // If the work has products, load them from snapshot first, then from main data
          const productsSource = processedData.raportSnapshot?.products || processedData.products || []
          if (productsSource && productsSource.length > 0) {
            // Convert products to the expected format for the form
            const convertedProducts = productsSource.map((product: any, index: number) => ({
              id: product.id || index.toString(),
              name: product.name || product.denumire || "",
              um: product.um || "buc",
              quantity: product.quantity || product.cantitate || 0,
              price: product.price || product.pretUnitar || 0,
              total: (product.quantity || product.cantitate || 0) * (product.price || product.pretUnitar || 0),
            }))
            setProducts(convertedProducts)
            console.log("📦 Produse încărcate din", processedData.raportSnapshot?.products ? "snapshot" : "date principale", ":", convertedProducts.length, "elemente")
          }

          // If the work has an email address, load it
          if (processedData.emailDestinatar) {
            // Dacă emailul din BD este un string, îl convertim la array
            const emailsFromDB = typeof processedData.emailDestinatar === 'string' 
              ? [processedData.emailDestinatar] 
              : Array.isArray(processedData.emailDestinatar) 
                ? processedData.emailDestinatar 
                : []
            setManualEmails(emailsFromDB)
          }
          
          // Initialize signer names with default values, cu fallback la snapshot
          // Pentru tehnician, folosim numele din snapshot, apoi cel salvat, apoi utilizatorul autentificat
          let defaultNumeTehnician = processedData.raportSnapshot?.numeTehnician || 
                                    processedData.numeTehnician || ""
          
          if (!defaultNumeTehnician) {
            // Verificăm dacă utilizatorul autentificat este tehnician și este alocat la această lucrare
            if (userData?.displayName && 
                userData?.role === "tehnician" && 
                processedData.tehnicieni && 
                processedData.tehnicieni.includes(userData.displayName)) {
              defaultNumeTehnician = userData.displayName
            } else if (processedData.tehnicieni && processedData.tehnicieni.length > 0) {
              // Folosim primul tehnician din listă ca valoare default pentru dropdown
              defaultNumeTehnician = processedData.tehnicieni[0]
            }
          }
          
          const defaultNumeBeneficiar = processedData.raportSnapshot?.numeBeneficiar || 
                                       processedData.numeBeneficiar || 
                                       processedData.persoanaContact || ""
          
          setNumeTehnician(defaultNumeTehnician)
          setNumeBeneficiar(defaultNumeBeneficiar)
          
          console.log("👤 Nume inițializate:", {
            tehnician: defaultNumeTehnician,
            beneficiar: defaultNumeBeneficiar,
            sourceTehnician: processedData.raportSnapshot?.numeTehnician ? "snapshot" : "date principale",
            sourceBeneficiar: processedData.raportSnapshot?.numeBeneficiar ? "snapshot" : "date principale"
          })

          // Preload feedback client (din snapshot sau document)
          try {
            const snapRating = (processedData as any)?.raportSnapshot?.clientRating
            const snapReview = (processedData as any)?.raportSnapshot?.clientReview
            const docRating = (processedData as any)?.clientRating
            const docReview = (processedData as any)?.clientReview
            const r = typeof snapRating === 'number' ? snapRating : (typeof docRating === 'number' ? docRating : null)
            setClientRating(r ?? null)
            const rv = typeof snapReview === 'string' && snapReview.trim().length ? snapReview : (typeof docReview === 'string' ? docReview : '')
            setClientReview(rv || "")
          } catch {}
        } else {
          setError("Lucrarea nu a fost găsită")
        }
      } catch (err) {
        console.error("Eroare la încărcarea tichetului:", err)
        setError("A apărut o eroare la încărcarea tichetului")
      } finally {
        setLoading(false)
      }
    }

    fetchLucrare()
  }, [paramsId, userData])

  // Verificăm dacă tehnicianul are acces la această lucrare
  useEffect(() => {
    const checkAccess = async () => {
      if (
        !loading &&
        lucrare &&
        userData?.role === "tehnician" &&
        userData?.displayName &&
        lucrare.tehnicieni &&
        !lucrare.tehnicieni.includes(userData.displayName)
      ) {
        // Tehnicianul nu este alocat la această lucrare, redirecționăm la dashboard
        alert("Nu aveți acces la raportul acestei tichete.")
        router.push("/dashboard")
      }
    }

    checkAccess()
  }, [loading, lucrare, userData, router])

  // Effect to trigger PDF generation when updatedLucrare changes
  useEffect(() => {
    if (updatedLucrare && reportGeneratorRef.current) {
      reportGeneratorRef.current.click()
    }
  }, [updatedLucrare])

  // Effect pentru descărcare automată când se deschide pagina cu autoDownload=true
  useEffect(() => {
    if (autoDownload && !loading && lucrare && lucrare.raportGenerat && reportGeneratorRef.current) {
      // Trigger descărcare automată după un delay mic pentru a permite încărcarea completă
      const timer = setTimeout(() => {
        console.log("🔽 Trigger descărcare automată raport...")
        reportGeneratorRef.current?.click()
        
        // Închidem tab-ul după un delay (opțional)
        setTimeout(() => {
          window.close()
        }, 1000)
      }, 500)
      
      return () => clearTimeout(timer)
    }
  }, [autoDownload, loading, lucrare, lucrare?.raportGenerat])

  const clearTechSignature = useCallback(() => {
    if (techSignatureRef.current) {
      techSignatureRef.current.clear()
      setIsTechSigned(false)
      setTechSignatureData(null)
    }
  }, [])

  const clearClientSignature = useCallback(() => {
    if (clientSignatureRef.current) {
      clientSignatureRef.current.clear()
      setIsClientSigned(false)
      setClientSignatureData(null)
    }
  }, [])

  // Function to send email
  const sendEmail = useCallback(
    async (pdfBlob: Blob) => {
      try {
        if (!updatedLucrare) {
          throw new Error("Datele tichetului nu sunt disponibile")
        }

        // Prevent double email sending
        if (isEmailSending) {
          console.log("Email sending already in progress, skipping...")
          return false
        }

        setIsEmailSending(true)

        // Obținem emailurile de locație (persoaneContact) + fallback la email client – matching robust (ID, nume normalizat, includes)
        let clientEmail = ""
        const locationEmails: string[] = []
        if (updatedLucrare.client && typeof updatedLucrare.client === "string") {
          try {
            console.log("Căutăm clientul:", updatedLucrare.client)
            const clientsRef = collection(db, "clienti")
            const q = query(clientsRef, where("nume", "==", updatedLucrare.client))
            const querySnapshot = await getDocs(q)

            if (!querySnapshot.empty) {
              const clientData: any = querySnapshot.docs[0].data()
              if (clientData.email) {
                clientEmail = clientData.email
                console.log("Am găsit emailul clientului:", clientEmail)
              }

              // Căutăm emailuri pentru locația selectată folosind potrivire robustă
              const selectedLocationNameRaw = (updatedLucrare.locatie || updatedLucrare.location || "").toString()
              const selectedLocationId = (updatedLucrare as any)?.clientInfo?.locationId || (updatedLucrare as any)?.clientInfo?.locatieId
              const selectedContactNameRaw = (updatedLucrare.persoanaContact || "").toString()

              const norm = (s?: string) =>
                (s || "")
                  .toString()
                  .normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "")
                  .trim()
                  .toLowerCase()

              const locatii = Array.isArray(clientData.locatii) ? clientData.locatii : []
              const targetName = norm(selectedLocationNameRaw)
              let matchedLocations: any[] = []

              // 1) Match by ID dacă există
              if (selectedLocationId) {
                matchedLocations = locatii.filter((l: any) => String(l?.id || "") === String(selectedLocationId))
              }

              // 2) Fallback la nume: egalitate sau includes (ambele sensuri) cu normalizare
              if (matchedLocations.length === 0 && targetName) {
                matchedLocations = locatii.filter((l: any) => {
                  const ln = norm(l?.nume || l?.name)
                  return (ln && ln === targetName) || (ln && targetName && (ln.includes(targetName) || targetName.includes(ln)))
                })
              }

              // 3) Dacă tot nu avem match, încercăm adresa (uneori în lucrare se folosește adresa ca locație)
              if (matchedLocations.length === 0 && targetName) {
                matchedLocations = locatii.filter((l: any) => {
                  const la = norm(l?.adresa)
                  return la && (la === targetName || la.includes(targetName) || targetName.includes(la))
                })
              }

              // Preferăm emailul persoanei de contact potrivite (după nume) din locația identificată
              const selectedContactName = norm(selectedContactNameRaw)
              if (matchedLocations.length > 0) {
                const contactsFromSelected = matchedLocations.flatMap((l: any) => Array.isArray(l?.persoaneContact) ? l.persoaneContact : [])

                // 3a) Încercăm să găsim contactul după nume, dacă este specificat în lucrare
                if (selectedContactName) {
                  const exact = contactsFromSelected.find((p: any) => norm(p?.nume) === selectedContactName || norm(p?.nume).includes(selectedContactName) || selectedContactName.includes(norm(p?.nume)))
                  const e = (exact?.email || "").toString().trim()
                  if (e && /.+@.+\..+/.test(e)) {
                    locationEmails.push(e)
                  }
                }

                // 3b) Adăugăm restul contactelor valide din locație (fără duplicate)
                for (const p of contactsFromSelected) {
                  const e = (p?.email || "").toString().trim()
                  if (e && /.+@.+\..+/.test(e) && !locationEmails.map(x => x.toLowerCase()).includes(e.toLowerCase())) {
                    locationEmails.push(e)
                  }
                }
              }

              // 4) Ultimul fallback – dacă nu am reușit să identificăm locația, luăm toate persoanele de contact valide ale clientului
              if (locationEmails.length === 0) {
                const allContacts = locatii.flatMap((l: any) => Array.isArray(l?.persoaneContact) ? l.persoaneContact : [])
                for (const p of allContacts) {
                  const e = (p?.email || "").toString().trim()
                  if (e && /.+@.+\..+/.test(e)) {
                    locationEmails.push(e)
                  }
                }
              }
              console.log("Emailuri locație găsite (robust):", locationEmails)
            } else {
              console.log("Clientul nu a fost găsit în Firestore:", updatedLucrare.client)
            }
          } catch (firestoreError) {
            console.error("Eroare la căutarea clientului în Firestore:", firestoreError)
          }
        }

        // Construim lista de emailuri pentru trimitere (evităm duplicatele)
        const emailsToSend: { email: string; label: string }[] = []
        const sentToEmails: string[] = []

        // Implicit: adăugăm emailuri de locație
        const pushUnique = (e: string, label: string) => {
          const email = e.trim().toLowerCase()
          if (!email) return
          const exists = emailsToSend.some((x) => x.email.toLowerCase() === email)
          if (!exists) emailsToSend.push({ email: e.trim(), label })
        }
        locationEmails.forEach(e => pushUnique(e, "Email locație"))

        // Fallback: email client
        if (clientEmail && clientEmail.trim()) {
          pushUnique(clientEmail, "Email client (din Firestore)")
        }

        // Dacă este bifat, adăugăm și emailurile manuale
        if (useManualRecipients) {
          manualEmails.forEach(email => {
            if (email && email.trim()) {
              pushUnique(email, "E-mail manual")
            }
          })
        }

        if (emailsToSend.length === 0) {
          throw new Error("Nu există adrese de email pentru trimitere (nu s-a găsit niciun email de locație sau client)")
        }

        console.log("📧 LISTA FINALĂ DE EMAILURI PENTRU TRIMITERE:", emailsToSend)
        console.log(`📊 Total emailuri de trimis: ${emailsToSend.length}`)

        // Trimitem emailul către fiecare adresă
        for (const emailInfo of emailsToSend) {
          console.log(`📮 Încep trimiterea către: ${emailInfo.email} (${emailInfo.label})`)
          try {
            // Create FormData for email sending
            const formData = new FormData()
            formData.append("to", emailInfo.email)
            formData.append(
              "subject",
              `Raport Interventie - ${updatedLucrare.client || "Client"} - ${String(updatedLucrare.dataInterventie || "Data").split(' ')[0]}`,
            )
            formData.append(
              "message",
              `Stimata/Stimate ${updatedLucrare.persoanaContact || "Client"},

Va transmitem atasat raportul de interventie pentru lucrarea efectuata in data de ${String(updatedLucrare.dataInterventie || "N/A").split(' ')[0]}.

Cu stima,
FOM by NRG`,
            )
            formData.append("senderName", `FOM by NRG - ${updatedLucrare.tehnicieni?.join(", ") || "Tehnician"}`)

            // Add IDs for logging in emailEvents
            formData.append("lucrareId", updatedLucrare.id || paramsId)
            if (updatedLucrare.clientInfo?.id) {
              formData.append("clientId", updatedLucrare.clientInfo.id)
            }

            // Add PDF as file
            const workNumRaw = String(updatedLucrare.nrLucrare || updatedLucrare.numarRaport || updatedLucrare.id || paramsId)
            const workNum = workNumRaw.replace(/^#\s*/, "").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
            const pdfFile = new File([pdfBlob], `Raport_Interventie_${workNum}.pdf`, {
              type: "application/pdf",
            })
            formData.append("pdfFile", pdfFile)

            // Add Operations Sheets PDF for Revizie (if applicable)
            try {
              if ((updatedLucrare?.tipLucrare || "").toLowerCase() === "revizie") {
                const opsBlob = await generateRevisionOperationsPDF(updatedLucrare.id || paramsId)
                const opsFile = new File([opsBlob], `Fise_Operatiuni_${workNum}.pdf`, {
                  type: "application/pdf",
                })
                formData.append("opsPdfFile", opsFile)
              }
            } catch (e) {
              console.warn("Nu s-a putut genera fișele de operațiuni pentru atașare email:", e)
            }

            // Add company logo
            formData.append("companyLogo", "/logo-placeholder.png")

            // Send request to API
            const response = await fetch("/api/send-email", {
              method: "POST",
              body: formData,
            })

            if (!response.ok) {
              const data = await response.json()
              throw new Error(data.error || "A aparut o eroare la trimiterea emailului")
            }

            sentToEmails.push(emailInfo.label + ": " + emailInfo.email)
            console.log(`✅ EMAIL TRIMIS CU SUCCES către ${emailInfo.email} (${emailInfo.label})`)
          } catch (emailError: any) {
            console.error(`❌ EROARE LA TRIMITEREA EMAILULUI către ${emailInfo.email}:`, emailError)
            console.error(`📝 Detalii eroare:`, emailError.message || emailError)
            // Nu aruncăm eroarea aici, continuăm cu următorul email
          }
        }

        console.log(`📊 REZULTAT FINAL TRIMITERE EMAILURI:`)
        console.log(`✅ Trimise cu succes: ${sentToEmails.length}`)
        console.log(`📧 Emailuri trimise: ${sentToEmails.join(", ")}`)

        setIsEmailSending(false)

        // Afișăm un toast cu rezultatele trimiterii
        if (sentToEmails.length > 0) {
          toast({
            title: "Email-uri trimise cu succes",
            description: `Raportul a fost trimis către:\n${sentToEmails.join('\n')}`,
            variant: "default",
            className: "whitespace-pre-line",
          })
          return true
        } else {
          throw new Error("Nu s-a putut trimite emailul către nicio adresă")
        }

      } catch (error) {
        console.error("Eroare la trimiterea emailului:", error)
        toast({
          title: "Eroare",
          description: error instanceof Error ? error.message : "A aparut o eroare la trimiterea emailului",
          variant: "destructive",
        })
        setIsEmailSending(false)
        return false
      }
    },
    [manualEmails, updatedLucrare, paramsId, isEmailSending, useManualRecipients],
  )

  // Use useStableCallback to ensure we have access to the latest state values
  // without causing unnecessary re-renders
  const handleSubmit = useStableCallback(async () => {
    // Check for tech signature - transformăm în avertisment, nu blocaj
    if (!techSignatureData && (!techSignatureRef.current || techSignatureRef.current.isEmpty())) {
      toast({
        title: "Atenție",
        description: "Raportul va fi generat fără semnătura tehnicianului.",
      })
    }

    // Check for client signature - transformăm în avertisment, nu blocaj
    if (!clientSignatureData && (!clientSignatureRef.current || clientSignatureRef.current.isEmpty())) {
      toast({
        title: "Atenție",
        description: "Raportul va fi generat fără semnătura beneficiarului.",
      })
    }

    // Nu mai cerem obligatoriu email manual; se va trimite implicit la emailurile locației

    setIsSubmitting(true)

    try {
      // Get signatures from refs or from stored state
      let semnaturaTehnician = techSignatureData
      let semnaturaBeneficiar = clientSignatureData

      if (techSignatureRef.current && !techSignatureRef.current.isEmpty()) {
        semnaturaTehnician = techSignatureRef.current.toDataURL("image/png")
        setTechSignatureData(semnaturaTehnician)
      }

      if (clientSignatureRef.current && !clientSignatureRef.current.isEmpty()) {
        semnaturaBeneficiar = clientSignatureRef.current.toDataURL("image/png")
        setClientSignatureData(semnaturaBeneficiar)
      }

      // Create updated tichet object with all necessary data
      console.log("🔍 ÎNAINTE de actualizare - statusul curent:", tichet.statusLucrare)
      console.log("🔍 ÎNAINTE de actualizare - raportGenerat curent:", tichet.raportGenerat)
      console.log("🔍 ÎNAINTE de actualizare - numarRaport curent:", tichet.numarRaport)
      
      const updatedLucrareData = {
        ...tichet,
        semnaturaTehnician,
        semnaturaBeneficiar,
        numeTehnician,
        numeBeneficiar,
        products,
        emailDestinatar: manualEmails,
        ...(typeof clientRating === 'number' ? { clientRating: Math.max(1, Math.min(5, clientRating)) } : {}),
        ...(clientReview?.trim() ? { clientReview: clientReview.trim() } : {}),
        // NU setăm raportGenerat: true aici - va fi setat de ReportGenerator
        statusLucrare: "Finalizat",
        statusFinalizareInterventie: "FINALIZAT",
        updatedAt: serverTimestamp(),
        preluatDispecer: false,
      }

      console.log("🔍 DUPĂ creare updatedLucrareData - statusul nou:", updatedLucrareData.statusLucrare)
      console.log("🔍 DUPĂ creare updatedLucrareData - raportGenerat:", updatedLucrareData.raportGenerat)
      console.log("🔍 DUPĂ creare updatedLucrareData - numarRaport:", updatedLucrareData.numarRaport)

      // Save to Firestore
      await updateLucrare(paramsId, updatedLucrareData)
      console.log("✅ SALVAT în Firestore (handleSubmit) - raportGenerat:", updatedLucrareData.raportGenerat || "UNDEFINED")
      console.log("✅ SALVAT în Firestore (handleSubmit) - numarRaport:", updatedLucrareData.numarRaport || "UNDEFINED")

      // Update local state with the updated data
      setUpdatedLucrare(updatedLucrareData)

      // Afișăm un toast de procesare
      toast({
        title: "Procesare în curs",
        description: "Se generează raportul și se trimite pe email...",
      })

      // PDF generation will be triggered by the useEffect when updatedLucrare changes
    } catch (err) {
      console.error("Eroare la salvarea semnăturilor:", err)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea semnăturilor.",
      })
      setIsSubmitting(false)
    }
  })

  // Tech signature handlers
  const handleTechBegin = useCallback(() => {
    setIsTechDrawing(true)
  }, [])

  const handleTechEnd = useCallback(() => {
    setIsTechDrawing(false)
    if (techSignatureRef.current) {
      const isEmpty = techSignatureRef.current.isEmpty()
      setIsTechSigned(!isEmpty)

      if (!isEmpty) {
        // Store the signature data to prevent loss on mobile
        const data = techSignatureRef.current.toDataURL()
        setTechSignatureData(data)
      }
    }
  }, [])

  // Client signature handlers
  const handleClientBegin = useCallback(() => {
    setIsClientDrawing(true)
  }, [])

  const handleClientEnd = useCallback(() => {
    setIsClientDrawing(false)
    if (clientSignatureRef.current) {
      const isEmpty = clientSignatureRef.current.isEmpty()
      setIsClientSigned(!isEmpty)

      if (!isEmpty) {
        // Store the signature data to prevent loss on mobile
        const data = clientSignatureRef.current.toDataURL()
        setClientSignatureData(data)
      }
    }
  }, [])

  // Add document-wide click/touch handler to restore signatures if they get cleared
  useEffect(() => {
    const handleDocumentInteraction = () => {
      // Skip if we're currently drawing
      if (isTechDrawing || isClientDrawing) return

      // Small delay to let other events process
      setTimeout(() => {
        // Restore tech signature if needed
        if (techSignatureData && techSignatureRef.current && techSignatureRef.current.isEmpty()) {
          techSignatureRef.current.fromDataURL(techSignatureData)
          setIsTechSigned(true)
        }

        // Restore client signature if needed
        if (clientSignatureData && clientSignatureRef.current && clientSignatureRef.current.isEmpty()) {
          clientSignatureRef.current.fromDataURL(clientSignatureData)
          setIsClientSigned(true)
        }
      }, 100)
    }

    document.addEventListener("click", handleDocumentInteraction)
    document.addEventListener("touchend", handleDocumentInteraction)

    return () => {
      document.removeEventListener("click", handleDocumentInteraction)
      document.removeEventListener("touchend", handleDocumentInteraction)
    }
  }, [techSignatureData, clientSignatureData, isTechDrawing, isClientDrawing])

  // Actualizăm statusul tichetului și marcăm raportul ca generat
  const updateWorkOrderStatus = async (lucrareId: string) => {
    try {
      if (!lucrareId) {
        console.error("ID-ul lucrării lipsește")
        return
      }

      console.log("Actualizăm statusul lucrării și marcăm raportul ca generat:", lucrareId)

      // Actualizăm documentul în Firestore direct
      const lucrareRef = doc(db, "lucrari", lucrareId)

      // Folosim updateDoc direct, fără a mai importa din nou
      await updateDoc(lucrareRef, {
        raportGenerat: true,
        statusLucrare: "Finalizat", // Actualizez și statusul pentru consistență
        preluatDispecer: false,
        updatedAt: serverTimestamp(),
      })

      // LOG DEBUG – confirmare după updateWorkOrderStatus
      console.log("🔍 updateWorkOrderStatus – raportGenerat:true, statusLucrare:Finalizat, preluatDispecer:false")
    } catch (error) {
      console.error("Eroare la actualizarea statusului lucrării:", error)
      toast({
        title: "Atenție",
        description: "Raportul a fost generat, dar nu s-a putut actualiza starea în sistem.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru salvarea timpului de plecare manual
  const handleSaveDepartureTime = async () => {
    if (!tichet?.id || !editingDepartureDate || !editingDepartureTime) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați atât data cât și ora de plecare.",
        variant: "destructive",
      })
      return
    }

    setIsSavingDepartureTime(true)

    try {
      // Construim timestamp-ul complet pentru plecare
      const [day, month, year] = editingDepartureDate.split('.')
      const [hour, minute] = editingDepartureTime.split(':')
      const departureDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
      
      // Verificăm dacă data este validă
      if (isNaN(departureDateTime.getTime())) {
        throw new Error("Data sau ora introdusă nu este validă")
      }

      // Verificăm dacă plecare este după sosire
      if (tichet.timpSosire) {
        const arrivalTime = new Date(tichet.timpSosire)
        if (departureDateTime <= arrivalTime) {
          toast({
            title: "Eroare",
            description: "Timpul de plecare trebuie să fie după timpul de sosire.",
            variant: "destructive",
          })
          setIsSavingDepartureTime(false)
          return
        }
      }

      const timpPlecare = departureDateTime.toISOString()
      const dataPlecare = editingDepartureDate
      const oraPlecare = editingDepartureTime
      
      // Calculăm durata dacă avem și timpul de sosire
      let durataInterventie = "-"
      if (tichet.timpSosire) {
        durataInterventie = calculateDuration(tichet.timpSosire, timpPlecare)
      }

      // Salvăm în Firestore
      const updateData = {
        timpPlecare,
        dataPlecare,
        oraPlecare,
        durataInterventie
      }

      await updateLucrare(tichet.id, updateData)

      // Actualizăm starea locală
      const updatedLucrareData = {
        ...tichet,
        ...updateData
      }
      setLucrare(updatedLucrareData)
      setUpdatedLucrare(updatedLucrareData)

      // Resetăm formularul
      setIsEditingDepartureTime(false)
      setEditingDepartureDate("")
      setEditingDepartureTime("")

      toast({
        title: "Succes",
        description: `Timpul de plecare a fost salvat. Durata calculată: ${durataInterventie}`,
        variant: "default",
      })

    } catch (error) {
      console.error("Eroare la salvarea timpului de plecare:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut salva timpul de plecare. Verificați datele introduse.",
        variant: "destructive",
      })
    } finally {
      setIsSavingDepartureTime(false)
    }
  }

  // Funcție pentru inițierea editării timpului de plecare
  const handleStartEditingDepartureTime = () => {
    // Setăm valorile implicite la data și ora curentă
    const now = new Date()
    const currentDate = now.toLocaleDateString('ro-RO').split('.').map(part => part.padStart(2, '0')).join('.')
    const currentTime = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
    
    setEditingDepartureDate(currentDate)
    setEditingDepartureTime(currentTime)
    setIsEditingDepartureTime(true)
  }

  // Funcție pentru salvarea timpului de sosire manual
  const handleSaveArrivalTime = async () => {
    if (!tichet?.id || !editingArrivalDate || !editingArrivalTime) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați atât data cât și ora de sosire.",
        variant: "destructive",
      })
      return
    }

    setIsSavingArrivalTime(true)

    try {
      // Construim timestamp-ul complet pentru sosire
      const [day, month, year] = editingArrivalDate.split('.')
      const [hour, minute] = editingArrivalTime.split(':')
      const arrivalDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
      
      // Verificăm dacă data este validă
      if (isNaN(arrivalDateTime.getTime())) {
        throw new Error("Data sau ora introdusă nu este validă")
      }

      const timpSosire = arrivalDateTime.toISOString()
      const dataSosire = editingArrivalDate
      const oraSosire = editingArrivalTime

      // Salvăm în Firestore
      const updateData = {
        timpSosire,
        dataSosire,
        oraSosire
      }

      await updateLucrare(tichet.id, updateData)

      // Actualizăm starea locală
      const updatedLucrareData = {
        ...tichet,
        ...updateData
      }
      setLucrare(updatedLucrareData)
      setUpdatedLucrare(updatedLucrareData)

      // Resetăm formularul
      setIsEditingArrivalTime(false)
      setEditingArrivalDate("")
      setEditingArrivalTime("")

      toast({
        title: "Succes",
        description: "Timpul de sosire a fost salvat cu succes.",
        variant: "default",
      })

    } catch (error) {
      console.error("Eroare la salvarea timpului de sosire:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut salva timpul de sosire. Verificați datele introduse.",
        variant: "destructive",
      })
    } finally {
      setIsSavingArrivalTime(false)
    }
  }

  // Funcție pentru inițierea editării timpului de sosire
  const handleStartEditingArrivalTime = () => {
    // Setăm valorile implicite la data intervenției sau data curentă
    const interventionDate = tichet?.dataInterventie?.split(' ')[0] || new Date().toLocaleDateString('ro-RO').split('.').map(part => part.padStart(2, '0')).join('.')
    const currentTime = "09:00" // Ora implicită de sosire
    
    setEditingArrivalDate(interventionDate)
    setEditingArrivalTime(currentTime)
    setIsEditingArrivalTime(true)
  }

  // Funcție pentru salvarea datelor lipsă din raport
  const handleSaveMissingData = async () => {
    if (!tichet?.id) {
      toast({
        title: "Eroare",
        description: "Nu s-a putut identifica lucrarea.",
        variant: "destructive",
      })
      return
    }

    setIsSavingMissingData(true)

    try {
      // Construim obiectul cu datele de actualizat (doar cele completate)
      const updateData: any = {}

      if (editingTechnicianName.trim()) {
        updateData.numeTehnician = editingTechnicianName.trim()
      }

      if (editingBeneficiaryName.trim()) {
        updateData.numeBeneficiar = editingBeneficiaryName.trim()
      }

      if (editingFindingsOnSite.trim()) {
        updateData.constatareLaLocatie = editingFindingsOnSite.trim()
      }

      if (editingInterventionDescription.trim()) {
        updateData.descriereInterventie = editingInterventionDescription.trim()
      }

      // Verificăm dacă avem ceva de salvat
      if (Object.keys(updateData).length === 0) {
        toast({
          title: "Eroare",
          description: "Nu ați completat niciun câmp pentru salvare.",
          variant: "destructive",
        })
        setIsSavingMissingData(false)
        return
      }

      // Salvăm în Firestore
      await updateLucrare(tichet.id, updateData)

      // Actualizăm starea locală
      const updatedLucrareData = {
        ...tichet,
        ...updateData
      }
      setLucrare(updatedLucrareData)
      setUpdatedLucrare(updatedLucrareData)

      // Resetăm formularul
      setIsEditingMissingData(false)
      setEditingTechnicianName("")
      setEditingBeneficiaryName("")
      setEditingFindingsOnSite("")
      setEditingInterventionDescription("")

      const fieldsUpdated = Object.keys(updateData).map(key => {
        const fieldNames: {[key: string]: string} = {
          numeTehnician: 'Numele tehnicianului',
          numeBeneficiar: 'Numele beneficiarului', 
          constatareLaLocatie: 'Constatarea la locație',
          descriereInterventie: 'Descrierea intervenției'
        }
        return fieldNames[key]
      }).join(', ')

      toast({
        title: "Succes",
        description: `Au fost salvate: ${fieldsUpdated}`,
        variant: "default",
      })

    } catch (error) {
      console.error("Eroare la salvarea datelor lipsă:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut salva datele. Încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSavingMissingData(false)
    }
  }

  // Funcție pentru inițierea editării datelor lipsă
  const handleStartEditingMissingData = () => {
    // Pre-completăm cu valorile existente (dacă sunt)
    setEditingTechnicianName(tichet?.numeTehnician || "")
    setEditingBeneficiaryName(tichet?.numeBeneficiar || "")
    setEditingFindingsOnSite(tichet?.constatareLaLocatie || "")
    setEditingInterventionDescription(tichet?.descriereInterventie || "")
    setIsEditingMissingData(true)
  }

  // Funcție pentru verificarea datelor lipsă
  const getMissingDataInfo = () => {
    const missing = []
    
    if (!tichet?.timpSosire) missing.push("Timpul de sosire")
    if (!tichet?.timpPlecare && !tichet?.raportSnapshot?.timpPlecare) missing.push("Timpul de plecare")
    if (!tichet?.numeTehnician) missing.push("Numele tehnicianului")
    if (!tichet?.numeBeneficiar) missing.push("Numele beneficiarului")
    if (!tichet?.constatareLaLocatie) missing.push("Constatarea la locație")
    if (!tichet?.descriereInterventie) missing.push("Descrierea intervenției")
    
    return missing
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-600"></div>
            <p className="mt-4 text-gray-500">Se încarcă datele raportului...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error state
  if (error || !tichet) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <div className="rounded-full bg-red-100 p-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-red-600">Eroare</h2>
            <p className="mt-2 text-center text-gray-500">{error || "Nu s-au putut încărca datele raportului."}</p>
            <Button className="mt-6" onClick={() => router.push("/dashboard/lucrari")}>
              Înapoi la lucrări
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // INTERFACE FOR DISPATCHER/ADMIN - DOWNLOAD ONLY
  if (showDownloadInterface) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader className="text-center">
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="w-full">
                <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">
                  Raport Finalizat #{paramsId}
                </CardTitle>
                <CardDescription>Raport generat de tehnician - doar descărcare</CardDescription>
              </div>
            </div>
          </CardHeader>
          
          {/* BANNER pentru raport blocat */}
          <div className="mx-6 mb-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Raport Finalizat de Tehnician
                  </h3>
                  <div className="mt-1 text-sm text-green-700">
                    <p>
                      Acest raport a fost finalizat pe <strong>{(() => {
                        const dataGenerare = lucrare?.raportSnapshot?.dataGenerare || lucrare?.updatedAt?.toDate?.() || lucrare?.updatedAt
                        try { return formatUiDate(toDateSafe(dataGenerare)) } catch { return "data necunoscută" }
                      })()}</strong> de către tehnician. 
                      Puteți descărca PDF-ul.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-medium text-gray-500">Client</h3>
                <p>{lucrare?.client || "N/A"}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500">Locație</h3>
                <p>{lucrare?.locatie || "N/A"}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                <p>{(() => { try { return formatUiDate(toDateSafe(lucrare?.dataInterventie)) } catch { return "N/A" } })()}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500">Tehnician</h3>
                <p>{lucrare?.tehnicieni?.join(", ") || "N/A"}</p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-medium text-gray-500">Data Generare Raport</h3>
                <p>{(() => { try { const d = lucrare?.raportSnapshot?.dataGenerare || lucrare?.updatedAt?.toDate?.() || lucrare?.updatedAt; return formatUiDate(toDateSafe(d)) } catch { return "Necunoscută" } })()}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500">Status</h3>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-700 font-medium">Finalizat și Blocat</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Informații despre raport */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-700 mb-3">Conținut Raport</h3>
              
              {/* VERIFICARE ȘI FORMULARE PENTRU DATELE LIPSĂ */}
              {(() => {
                const missingData = getMissingDataInfo()
                
                // Afișează un overview cu toate datele lipsă
                if (missingData.length > 0) {
                  return (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <p className="text-amber-800 font-medium">Date incomplete pentru raport</p>
                      </div>
                      <p className="text-amber-700 text-sm mb-3">
                        Următoarele date lipsesc și ar trebui completate pentru un raport complet:
                      </p>
                      <ul className="text-amber-700 text-sm mb-4 space-y-1">
                        {missingData.map((item, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                            {item}
                          </li>
                        ))}
                      </ul>
                      <div className="text-sm text-amber-600">
                        💡 Puteți completa datele lipsă folosind formularele de mai jos înainte de a descărca raportul.
                </div>
                    </div>
                  )
                }
                return null
              })()}

              {/* FORMULAR PENTRU INTRODUCEREA MANUALĂ A TIMPULUI DE SOSIRE */}
              {!lucrare?.timpSosire && (
                <div className="mb-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  {!isEditingArrivalTime ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-red-600" />
                        <p className="text-red-800 font-medium">⚠️ Lipsește timpul de sosire</p>
                      </div>
                      <p className="text-red-700 text-sm mb-3">
                        Nu există înregistrare pentru sosirea tehnicianului la locație.
                        Durata intervenției nu poate fi calculată fără acest timp.
                      </p>
                      <Button 
                        onClick={handleStartEditingArrivalTime}
                        size="sm" 
                        className="bg-red-600 hover:bg-red-700"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Introduceți timpul de sosire
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-red-600" />
                        <p className="text-red-800 font-medium">Introduceți timpul de sosire</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                          <Label htmlFor="arrivalDate" className="text-sm font-medium">
                            Data sosire
                          </Label>
                          <Input
                            id="arrivalDate"
                            type="text"
                            placeholder="dd.mm.yyyy"
                            value={editingArrivalDate}
                            onChange={(e) => setEditingArrivalDate(e.target.value)}
                            disabled={isSavingArrivalTime}
                            className="text-sm"
                          />
                          <p className="text-xs text-gray-500">Format: zz.ll.aaaa (ex: 27.01.2025)</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="arrivalTime" className="text-sm font-medium">
                            Ora sosire
                          </Label>
                          <Input
                            id="arrivalTime"
                            type="text"
                            placeholder="hh:mm"
                            value={editingArrivalTime}
                            onChange={(e) => setEditingArrivalTime(e.target.value)}
                            disabled={isSavingArrivalTime}
                            className="text-sm"
                          />
                          <p className="text-xs text-gray-500">Format: oo:mm (ex: 09:00)</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleSaveArrivalTime}
                          disabled={isSavingArrivalTime || !editingArrivalDate || !editingArrivalTime}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isSavingArrivalTime ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Se salvează...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Salvează
                            </>
                          )}
                        </Button>
                        
                        <Button 
                          onClick={() => {
                            setIsEditingArrivalTime(false)
                            setEditingArrivalDate("")
                            setEditingArrivalTime("")
                          }}
                          variant="outline"
                          size="sm"
                          disabled={isSavingArrivalTime}
                        >
                          Anulează
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {/* FORMULAR PENTRU INTRODUCEREA MANUALĂ A TIMPULUI DE PLECARE */}
              {!lucrare?.raportSnapshot?.durataInterventie && !lucrare?.durataInterventie && lucrare?.timpSosire && !lucrare?.timpPlecare && !lucrare?.raportSnapshot?.timpPlecare && (
                <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  {!isEditingDepartureTime ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <p className="text-blue-800 font-medium">⚠️ Lipsește timpul de plecare</p>
                      </div>
                      <p className="text-blue-700 text-sm mb-3">
                    Durata nu poate fi calculată pentru că lipsește timpul de plecare din raport.
                        Puteți introduce manual datele de plecare.
                      </p>
                      <Button 
                        onClick={handleStartEditingDepartureTime}
                        size="sm" 
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Introduceți timpul de plecare
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <p className="text-blue-800 font-medium">Introduceți timpul de plecare</p>
                </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                          <Label htmlFor="departureDate" className="text-sm font-medium">
                            Data plecare
                          </Label>
                          <Input
                            id="departureDate"
                            type="text"
                            placeholder="dd.mm.yyyy"
                            value={editingDepartureDate}
                            onChange={(e) => setEditingDepartureDate(e.target.value)}
                            disabled={isSavingDepartureTime}
                            className="text-sm"
                          />
                          <p className="text-xs text-gray-500">Format: zz.ll.aaaa (ex: 27.01.2025)</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="departureTime" className="text-sm font-medium">
                            Ora plecare
                          </Label>
                          <Input
                            id="departureTime"
                            type="text"
                            placeholder="hh:mm"
                            value={editingDepartureTime}
                            onChange={(e) => setEditingDepartureTime(e.target.value)}
                            disabled={isSavingDepartureTime}
                            className="text-sm"
                          />
                          <p className="text-xs text-gray-500">Format: oo:mm (ex: 14:30)</p>
                        </div>
                      </div>
                      
                      {lucrare?.timpSosire && (
                        <div className="mb-4 p-3 bg-white rounded border text-sm">
                          <p className="text-gray-600 mb-1">
                            <strong>Timpul de sosire:</strong> {new Date(lucrare.timpSosire).toLocaleString('ro-RO')}
                          </p>
                          {editingDepartureDate && editingDepartureTime && (
                            <p className="text-gray-600">
                              <strong>Durata estimată:</strong> {(() => {
                                try {
                                  const [day, month, year] = editingDepartureDate.split('.')
                                  const [hour, minute] = editingDepartureTime.split(':')
                                  const departureDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
                                  
                                  if (!isNaN(departureDateTime.getTime())) {
                                    return calculateDuration(lucrare.timpSosire, departureDateTime.toISOString())
                                  }
                                  return "Format invalid"
                } catch (e) {
                                  return "Format invalid"
                                }
                              })()}
                            </p>
                          )}
                </div>
              )}
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleSaveDepartureTime}
                          disabled={isSavingDepartureTime || !editingDepartureDate || !editingDepartureTime}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isSavingDepartureTime ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Se salvează...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Salvează
                            </>
                          )}
                        </Button>
                        
                        <Button 
                          onClick={() => {
                            setIsEditingDepartureTime(false)
                            setEditingDepartureDate("")
                            setEditingDepartureTime("")
                          }}
                          variant="outline"
                          size="sm"
                          disabled={isSavingDepartureTime}
                        >
                          Anulează
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* FORMULAR PENTRU COMPLETAREA DATELOR LIPSĂ DIN RAPORT */}
              {(!lucrare?.numeTehnician || !lucrare?.numeBeneficiar || !lucrare?.constatareLaLocatie || !lucrare?.descriereInterventie) && (
                <div className="mb-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  {!isEditingMissingData ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Edit className="h-4 w-4 text-purple-600" />
                        <p className="text-purple-800 font-medium">⚠️ Date incomplete în raport</p>
                      </div>
                      <p className="text-purple-700 text-sm mb-3">
                        Unele informații importante lipsesc din raport și ar trebui completate:
                      </p>
                      <ul className="text-purple-700 text-sm mb-4 space-y-1">
                        {!lucrare?.numeTehnician && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                            Numele tehnicianului
                          </li>
                        )}
                        {!lucrare?.numeBeneficiar && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                            Numele beneficiarului
                          </li>
                        )}
                        {!lucrare?.constatareLaLocatie && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                            Constatarea la locație
                          </li>
                        )}
                        {!lucrare?.descriereInterventie && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                            Descrierea intervenției
                          </li>
                        )}
                      </ul>
                      <Button 
                        onClick={handleStartEditingMissingData}
                        size="sm" 
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Completați datele lipsă
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Edit className="h-4 w-4 text-purple-600" />
                        <p className="text-purple-800 font-medium">Completați datele lipsă</p>
                      </div>
                      
                      <div className="space-y-4">
                        {!lucrare?.numeTehnician && (
                          <div className="space-y-2">
                            <Label htmlFor="technicianName" className="text-sm font-medium">
                              Numele complet al tehnicianului
                            </Label>
                            <Input
                              id="technicianName"
                              type="text"
                              placeholder="ex: Ion Popescu"
                              value={editingTechnicianName}
                              onChange={(e) => setEditingTechnicianName(e.target.value)}
                              disabled={isSavingMissingData}
                              className="text-sm"
                            />
                          </div>
                        )}

                        {!lucrare?.numeBeneficiar && (
                          <div className="space-y-2">
                            <Label htmlFor="beneficiaryName" className="text-sm font-medium">
                              Numele complet al beneficiarului
                            </Label>
                            <Input
                              id="beneficiaryName"
                              type="text"
                              placeholder="ex: Maria Ionescu"
                              value={editingBeneficiaryName}
                              onChange={(e) => setEditingBeneficiaryName(e.target.value)}
                              disabled={isSavingMissingData}
                              className="text-sm"
                            />
                          </div>
                        )}

                        {!lucrare?.constatareLaLocatie && (
                          <div className="space-y-2">
                            <Label htmlFor="findingsOnSite" className="text-sm font-medium">
                              Constatarea la locație
                            </Label>
                            <Textarea
                              id="findingsOnSite"
                              placeholder="Descrieți ce ați constatat la fața locului..."
                              value={editingFindingsOnSite}
                              onChange={(e) => setEditingFindingsOnSite(e.target.value)}
                              disabled={isSavingMissingData}
                              className="text-sm"
                              rows={3}
                            />
                          </div>
                        )}

                        {!lucrare?.descriereInterventie && (
                          <div className="space-y-2">
                            <Label htmlFor="interventionDescription" className="text-sm font-medium">
                              Descrierea intervenției
                            </Label>
                            <Textarea
                              id="interventionDescription"
                              placeholder="Descrieți ce tichete ați efectuat..."
                              value={editingInterventionDescription}
                              onChange={(e) => setEditingInterventionDescription(e.target.value)}
                              disabled={isSavingMissingData}
                              className="text-sm"
                              rows={4}
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-4">
                        <Button 
                          onClick={handleSaveMissingData}
                          disabled={isSavingMissingData}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isSavingMissingData ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Se salvează...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Salvează datele
                            </>
                          )}
                        </Button>
                        
                        <Button 
                          onClick={() => {
                            setIsEditingMissingData(false)
                            setEditingTechnicianName("")
                            setEditingBeneficiaryName("")
                            setEditingFindingsOnSite("")
                            setEditingInterventionDescription("")
                          }}
                          variant="outline"
                          size="sm"
                          disabled={isSavingMissingData}
                        >
                          Anulează
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Informații generale despre raport */}
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Produse/Servicii:</span>
                  <span className="font-medium">
                    {(lucrare?.raportSnapshot?.products?.length || lucrare?.products?.length || 0)} elemente
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Durata Intervenție:</span>
                  <span className="font-medium">
                    {(() => {
                      // Încercăm să găsim durata din snapshot, apoi din datele principale
                      const savedDuration = lucrare?.raportSnapshot?.durataInterventie || lucrare?.durataInterventie;
                      
                      if (savedDuration) {
                        return savedDuration;
                      }
                      
                      // Dacă nu avem durata salvată, încercăm să o calculăm din timpii existenți
                      const timpSosire = lucrare?.timpSosire;
                      const timpPlecare = lucrare?.raportSnapshot?.timpPlecare || lucrare?.timpPlecare;
                      
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
                              // Doar informativ - nu restricționăm nimic
                            }
                            
                            const diffMinutes = Math.floor(diffMs / 60000);
                            const hours = Math.floor(diffMinutes / 60);
                            const minutes = diffMinutes % 60;
                            return `${hours}h ${minutes}m`;
                          }
                        } catch (e) {
                          console.error("Eroare la calculul duratei:", e);
                        }
                      }
                      
                      return "N/A";
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Hidden ReportGenerator component for PDF generation */}
            <div className="hidden">
              <ReportGenerator
                ref={reportGeneratorRef}
                lucrare={lucrare}
                onGenerate={(blob) => {
                  // Automatically download the PDF
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                    const numRaw = String(lucrare?.nrLucrare || lucrare?.numarRaport || paramsId || "")
                    const num = numRaw.replace(/^#\s*/, "").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
                    const clientPart = String(tichet?.client || "Interventie").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
                    a.download = `Raport_${clientPart}_${num}.pdf`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  
                  toast({
                    title: "PDF Descărcat",
                    description: "Raportul a fost descărcat cu succes.",
                    variant: "default",
                  })
                  setIsSubmitting(false)
                }}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-4 justify-between pb-6 pt-4">
            <div className="order-2 sm:order-1 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="w-full sm:w-auto"
                disabled={isSubmitting}
              >
                Înapoi
              </Button>
            </div>
            <div className="order-1 sm:order-2 w-full sm:w-auto mb-2 sm:mb-0">
              <Button
                className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={downloadPDF}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>Se descarcă...</>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Descarcă PDF Raport
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // INTERFACE FOR TECHNICIAN - GENERATION/EDITING
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-full">
              <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">
                Raport Intervenție #{paramsId}
              </CardTitle>
              <CardDescription>Detalii despre intervenția efectuată</CardDescription>
            </div>
          </div>
        </CardHeader>
        
        {/* BANNER pentru raport blocat */}
        {lucrare?.raportDataLocked && lucrare?.raportSnapshot && (
          <div className="mx-6 mb-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Raport Finalizat și Blocat
                  </h3>
                  <div className="mt-1 text-sm text-blue-700">
                    <p>
                      Acest raport a fost generat pe <strong>{(() => { try { return formatUiDate(toDateSafe(lucrare.raportSnapshot.dataGenerare)) } catch { return "data necunoscută" } })()}</strong> și datele au fost înghețate permanent. 
                      Orice regenerare va produce exact același PDF cu aceleași informații.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <CardContent className="px-0 sm:px-6 pb-0">
          {/* ReportGenerator este ascuns pentru dispeceri care văd rapoarte finalizate */}
          {showDownloadInterface && (
            <div className="space-y-6 p-6 bg-blue-50 rounded-lg border border-blue-200 m-6">
              <div className="flex items-center space-x-3">
                <FileDown className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">Raport Finalizat</h3>
                  <p className="text-sm text-blue-700">Tehnicianul a generat raportul. Puteți descărca documentele.</p>
                </div>
              </div>
              
              {lucrare?.raportSnapshot ? (
                <div className="space-y-4">
                  <Button 
                    onClick={downloadPDF} 
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generez PDF...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Descarcă Raport PDF
                      </>
                    )}
                  </Button>
                  
                  <div className="mt-6 p-4 bg-white rounded-lg border">
                    <h4 className="font-medium mb-2">Informații Raport:</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Client:</strong> {lucrare?.client}</p>
                      <p><strong>Locație:</strong> {lucrare?.locatie}</p>
                      <p><strong>Data intervenție:</strong> {(() => { try { return formatUiDate(toDateSafe(lucrare?.dataInterventie)) } catch { return "N/A" } })()}</p>
                      <p><strong>Status:</strong> {lucrare?.statusLucrare}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-amber-600 bg-amber-50 p-4 rounded-md border border-amber-200">
                  <p className="text-sm">Raportul a fost marcat ca generat, dar snapshotul nu este disponibil încă.</p>
                </div>
              )}
            </div>
          )}

          {!showDownloadInterface && (
            <>
              {/* Conținutul existent pentru tehnician */}
              <div className="px-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="font-medium text-gray-500">Client</h3>
                    <p>{lucrare?.client || "N/A"}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Locație</h3>
                    <p>{lucrare?.locatie || "N/A"}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                <p>{(() => { try { return formatUiDate(toDateSafe(lucrare?.dataInterventie)) } catch { return "N/A" } })()}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Tehnician</h3>
                    <p>{lucrare?.tehnicieni?.join(", ") || "N/A"}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-medium text-gray-500">Defect Reclamat</h3>
                  <p>{lucrare?.defectReclamat || "Nu a fost specificat"}</p>
                </div>

                {lucrare?.textReinterventie && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-medium text-gray-500">Text reintervenție</h3>
                      <p className="whitespace-pre-line">{lucrare?.textReinterventie}</p>
                    </div>
                  </>
                )}

                <Separator />

                <div>
                  <h3 className="font-medium text-gray-500">Constatarea la locație</h3>
                  <p className="whitespace-pre-line">{lucrare?.constatareLaLocatie || "Nu a fost specificată"}</p>
                </div>

                <Separator />

                <div>
                  <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
                  <p className="whitespace-pre-line">{lucrare?.descriereInterventie || "Nu a fost specificată"}</p>
                </div>

                <Separator />

        
             
                <ProductTableForm 
                  products={products} 
                  onProductsChange={setProducts}
                  disabled={lucrare?.raportDataLocked}
                  showTitle={false}
                />
                {/* Sumar totaluri pentru raport (21% TVA) */}
                {products && products.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    {(() => {
                      const subtotal = products.reduce((s: number, p: any) => s + (Number(p.total) || ((Number(p.quantity)||0)*(Number(p.price)||0))), 0)
                      const total = subtotal
                      return (
                        <div className="text-sm space-y-1 text-right">
                          <div><span className="font-medium">Total:</span> {total.toFixed(2)}</div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                <Separator />

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Semnătură Tehnician */}
                  <div className="space-y-2">
                    <h3 className="font-medium text-gray-500">Semnătură Tehnician</h3>
                    <div className="space-y-2">
                      <Label htmlFor="numeTehnician">Nume și prenume tehnician</Label>
                      {lucrare?.tehnicieni && lucrare.tehnicieni.length > 0 ? (
                        <Select
                          value={numeTehnician}
                          onValueChange={(value) => setNumeTehnician(value)}
                          disabled={isSubmitting || lucrare?.raportDataLocked}
                        >
                          <SelectTrigger id="numeTehnician">
                            <SelectValue placeholder="Selectează tehnicianul care semnează" />
                          </SelectTrigger>
                          <SelectContent>
                            {lucrare.tehnicieni.map((tech: string, idx: number) => (
                              <SelectItem key={idx} value={tech}>
                                {tech}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="numeTehnician"
                          type="text"
                          placeholder="Numele complet al tehnicianului"
                          value={numeTehnician}
                          onChange={(e) => setNumeTehnician(e.target.value)}
                          disabled={isSubmitting || lucrare?.raportDataLocked}
                        />
                      )}
                    </div>
                    <div className="rounded-md border border-gray-300 bg-white p-2">
                      <SignatureCanvas
                        ref={techSignatureRef}
                        canvasProps={{
                          className: "w-full h-40 border rounded",
                          width: SIG_MIN_WIDTH,
                          height: SIG_HEIGHT,
                        }}
                        onBegin={handleTechBegin}
                        onEnd={handleTechEnd}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={clearTechSignature} disabled={isSubmitting || lucrare?.raportDataLocked}>
                        Șterge
                      </Button>
                    </div>
                    <p className="text-xs text-center text-gray-500">Semnătura tehnicianului</p>
                  </div>

                  {/* Semnătură Beneficiar */}
                  <div className="space-y-2">
                    <h3 className="font-medium text-gray-500">Semnătură Beneficiar</h3>
                    <div className="space-y-2">
                      <Label htmlFor="numeBeneficiar">Nume și prenume beneficiar</Label>
                      <Input
                        id="numeBeneficiar"
                        type="text"
                        placeholder="Numele complet al beneficiarului"
                        value={numeBeneficiar}
                        onChange={(e) => setNumeBeneficiar(e.target.value)}
                        disabled={isSubmitting || lucrare?.raportDataLocked}
                      />
                    </div>
                    <div className="rounded-md border border-gray-300 bg-white p-2">
                      <SignatureCanvas
                        ref={clientSignatureRef}
                        canvasProps={{
                          className: "w-full h-40 border rounded",
                          width: SIG_MIN_WIDTH,
                          height: SIG_HEIGHT,
                        }}
                        onBegin={handleClientBegin}
                        onEnd={handleClientEnd}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={clearClientSignature} disabled={isSubmitting || lucrare?.raportDataLocked}>
                        Șterge
                      </Button>
                    </div>
                    <p className="text-xs text-center text-gray-500">Semnătura beneficiarului</p>
                  </div>
                </div>

                {/* Feedback client – secțiune separată după semnături */}
                <Separator />
      

                {/* Adăugăm câmpul pentru email */}
                <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="useManualRecipients"
                  checked={useManualRecipients}
                  onCheckedChange={(v) => setUseManualRecipients(Boolean(v))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="useManualRecipients">Destinatari multipli pt raport</Label>
              </div>
              <Label htmlFor="emails">E-mailuri destinatari (opțional)</Label>
                  <MultiEmailInput
                    emails={manualEmails}
                    onEmailsChange={setManualEmails}
                    placeholder="Introduceți adresele de email pentru raport..."
                disabled={isSubmitting || !useManualRecipients}
                  />
                  <p className="text-xs text-muted-foreground">
                Implicit se trimite către emailurile de locație din client. Bifați „Destinatari multipli pt raport" pentru a adăuga și alte adrese.
                  </p>
                </div>

                {/* Hidden ReportGenerator component */}
                <div className="hidden">
                  <ReportGenerator
                    ref={reportGeneratorRef}
                    tichet={updatedLucrare || tichet}
                    onGenerate={(blob) => {
                      // Send email automatically when PDF is generated
                      sendEmail(blob)
                        .then((success) => {
                          if (success) {
                            // Show success toast
                            toast({
                              title: "Raport finalizat",
                              description: "Raportul a fost generat și trimis pe email cu succes.",
                              variant: "default",
                            })

                            // Actualizăm statusul tichetului
                            if (updatedLucrare && updatedLucrare.id) {
                              updateWorkOrderStatus(updatedLucrare.id)
                            }

                            // Redirect to dashboard after a short delay
                            router.push("/dashboard/lucrari")
                          } else {
                            setIsSubmitting(false)
                          }
                        })
                        .catch((error) => {
                          console.error("Eroare la trimiterea emailului:", error)
                          toast({
                            title: "Eroare",
                            description: "Raportul a fost generat, dar trimiterea pe email a eșuat.",
                            variant: "destructive",
                          })
                          setIsSubmitting(false)
                        })
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>

        {/* Footer with buttons */}
        <CardFooter className="flex flex-col sm:flex-row gap-4 justify-between pb-6 pt-4">
          <div className="order-2 sm:order-1 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="w-full sm:w-auto"
              disabled={isSubmitting}
            >
              Înapoi
            </Button>
          </div>
          
          {!showDownloadInterface && (
            <div className="order-1 sm:order-2 w-full sm:w-auto mb-2 sm:mb-0">
              <Button
                ref={submitButtonRef}
                className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{
                  position: "relative",
                  zIndex: 50,
                  touchAction: "manipulation",
                }}
              >
                {isSubmitting ? (
                  <>Se procesează...</>
                ) : tichet?.raportDataLocked ? (
                  <div className="text-center text-gray-600 p-8">
                    <Lock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium">Raportul a fost finalizat și datele sunt blocate</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Nu se mai pot face modificări. Pentru modificări, contactați administratorul.
                    </p>
                  </div>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Finalizează și Trimite Raport
                  </>
                )}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
