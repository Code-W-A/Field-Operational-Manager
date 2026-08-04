"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { DevDebugPanel } from "@/components/debug/dev-debug-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { OfferEditorDialog } from "./offer-editor-dialog"
import { DevizEditorDialog } from "./deviz-editor-dialog"
import { LucrareForm } from "@/components/lucrare-form"
import { DownloadHistory } from "@/components/download-history"
import { OfferEvidencePanel } from "@/components/offer/offer-evidence-panel"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
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
  X,
  Check,
  RefreshCw,
  ArchiveRestore,
  Archive,
  Clock,
  Download,
  Mail,
  History,
  Loader2,
  FileCheck2,
} from "lucide-react"
import { format } from "date-fns"
import { getLucrareById, deleteLucrare, updateLucrare, getClientById, addLucrare } from "@/lib/firebase/firestore"
import { subscribeDocumentatiiFiles, type DocumentatiiFile } from "@/lib/firebase/documentatii"
import { WORK_STATUS, WORK_STATUS_OPTIONS } from "@/lib/utils/constants"
import { isLucrareAnulata } from "@/lib/utils/work-canceled"
import {
  isTehnicianGarantieDecizie,
  TEHNICIAN_GARANTIE_DECIZIE_LABELS,
  tehnicianGarantieDecizieBadgeClassName,
} from "@/lib/utils/tehnician-garantie-decizie"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { DocumentUpload } from "@/components/document-upload"
import { ReportGenerator } from "@/components/report-generator"
import { ImageDefectViewer } from "@/components/image-defect-viewer"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDate, formatTime, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { EquipmentQRCode } from "@/components/equipment-qr-code"
import { ensureAutoCheckInFromFirstQr } from "@/lib/attendance/auto-pontaj"
// Adăugăm importurile pentru calculul garanției
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"
import { ReinterventionReasonDialog } from "@/components/reintervention-reason-dialog"
import { PostponeWorkDialog } from "@/components/postpone-work-dialog"
import { ModificationBanner } from "@/components/modification-banner"
import { useModificationDetails } from "@/hooks/use-modification-details"
import { db } from "@/lib/firebase/config"
import { collection, query, where, getDocs, limit, serverTimestamp } from "firebase/firestore"
import { getArchiveValidationDetails } from "@/lib/utils/archive-validation"
import { useArchiveRulesSettings } from "@/hooks/use-archive-rules-settings"
import { deleteField } from "firebase/firestore"
import { generateRevisionOperationsPDF, generateRevisionEquipmentPDF } from "@/lib/pdf/revision-operations"
import { generateDevizPdf } from "@/lib/utils/offer-pdf"
import { getTicketEmitent } from "@/lib/utils/ticket-emitent"

const debugClient = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log("[fom][client-debug]", ...args)
}

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cif || "N/A"
}

type ActiveWorkSummary = {
  id: string
  nrDisplay: string
  statusLucrare: string
  dataInterventie?: string
  tehnicieni?: string[]
}

type OfferHistoryDialogVersion = {
  savedAt: string
  savedBy: string
  total: number
  products: Array<any>
  responses: Array<{ status: "accept" | "reject"; at: any; reason?: string; verifiedEmail?: string }>
}

type EditFormData = {
  tipLucrare: string
  tehnicieni: string[]
  client: string
  locatie: string
  echipament: string
  descriere: string
  persoanaContact: string
  telefon: string
  statusLucrare: string
  statusFacturare: string
  contract?: string
  contractNumber?: string
  contractType?: string
  defectReclamat?: string
  defectReclamatHistory?: string[]
  persoaneContact?: any[]
  echipamentId?: string
  echipamentCod?: string
  equipmentIds?: string[]
}

const EMPTY_EDIT_FORM: EditFormData = {
  tipLucrare: "",
  tehnicieni: [],
  client: "",
  locatie: "",
  echipament: "",
  descriere: "",
  persoanaContact: "",
  telefon: "",
  statusLucrare: "Listată",
  statusFacturare: "Nefacturat",
  contract: "",
  contractNumber: "",
  contractType: "",
  defectReclamat: "",
  defectReclamatHistory: [],
  persoaneContact: [],
  echipamentId: "",
  echipamentCod: "",
  equipmentIds: [],
}

const ACTIVE_WORK_STATUSES = [
  "Listată",
  "Atribuită",
  "În lucru",
  "În așteptare",
  "Amânată",
  "Programată",
]

function EquipmentDocumentationList({
  folderId,
  subfolderId,
  fileIds,
}: {
  folderId?: string | null
  subfolderId?: string | null
  fileIds?: string[] | null
}) {
  const [docs, setDocs] = useState<DocumentatiiFile[]>([])

  useEffect(() => {
    const fid = String(folderId || "").trim()
    if (!fid) {
      setDocs([])
      return
    }
    const unsub = subscribeDocumentatiiFiles(fid, subfolderId || null, setDocs)
    return () => {
      try { (unsub as any)?.() } catch {}
    }
  }, [folderId, subfolderId])

  if (!folderId) {
    return <div className="text-sm text-muted-foreground">Nu este asociată documentație pentru acest echipament.</div>
  }
  const selectedDocs =
    Array.isArray(fileIds) && fileIds.length > 0 ? docs.filter((d) => fileIds.includes(d.id)) : docs

  if (!selectedDocs.length) {
    return <div className="text-sm text-muted-foreground">Nu există documentație disponibilă.</div>
  }
  return (
    <ul className="text-sm space-y-1">
      {selectedDocs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2">
          <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">
            {d.name || "Document"}
          </a>
          {d.uploadedAt ? (
            <span className="text-xs text-muted-foreground">{formatUiDate(d.uploadedAt?.toDate?.() || new Date(d.uploadedAt))}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
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
  const { config: archiveRulesConfig } = useArchiveRulesSettings()
  const role = userData?.role || "tehnician"
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const isAdmin = role === "admin"
  const debugRevizie = searchParams.get("debugRevizie") === "1"
  const fromArhivate = searchParams.get('from') === 'arhivate'
  const fromIstoricEchipament = searchParams.get("from") === "istoric-echipament"

  /** Păstrează accesul tehnicianului din fluxul „Istoric echipament” la tichete înrudite (ex. lucrarea inițială). */
  const relatedTicketUrl = useCallback(
    (lucrareId: string) => {
      if (!lucrareId) return "/dashboard/lucrari"
      if (!fromIstoricEchipament) return `/dashboard/lucrari/${lucrareId}`
      return `/dashboard/lucrari/${lucrareId}?from=istoric-echipament`
    },
    [fromIstoricEchipament]
  )

  const { id: paramsId } = React.use(params)
  
  // Detectăm parametrul modificationId din URL
  const modificationId = searchParams.get('modificationId')
  const { modification, loading: modificationLoading } = useModificationDetails(modificationId)
  
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const isAssignedTehnician =
    role === "tehnician" && !!userData?.displayName && !!lucrare?.tehnicieni?.includes(userData.displayName)
  const isReadOnlyTechView = role === "tehnician" && fromIstoricEchipament && !isAssignedTehnician
  const [activeTab, setActiveTab] = useState("detalii")
  const [isReinterventionReasonDialogOpen, setIsReinterventionReasonDialogOpen] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)

  const [equipmentVerified, setEquipmentVerified] = useState(false)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isOfferEditorOpen, setIsOfferEditorOpen] = useState(false)
  const [isDevizEditorOpen, setIsDevizEditorOpen] = useState(false)
  const [offerHistoryDialogVersion, setOfferHistoryDialogVersion] = useState<OfferHistoryDialogVersion | null>(null)
  const [reinterventii, setReinterventii] = useState<Lucrare[]>([])
  const [loadingReinterventii, setLoadingReinterventii] = useState(false)
  const [clientData, setClientData] = useState<any>(null)
  // Resolved from live client data (preferred); snapshot fields are fallback only
  const [resolvedLocation, setResolvedLocation] = useState<any>(null)
  const [resolvedContact, setResolvedContact] = useState<any>(null)
  const [resolvedEquipment, setResolvedEquipment] = useState<any>(null)
  // Blocare scanare dacă tehnicianul are deja altă lucrare "În lucru"
  const [otherActiveWork, setOtherActiveWork] = useState<null | { id: string; numar: string; client?: string; locatie?: string }>(null)
  const [checkingOtherActive, setCheckingOtherActive] = useState(false)
  const [equipmentActiveConflicts, setEquipmentActiveConflicts] = useState<ActiveWorkSummary[]>([])
  const [loadingEquipmentActiveConflicts, setLoadingEquipmentActiveConflicts] = useState(false)
  const [showConflictDetails, setShowConflictDetails] = useState(false)
  const debugLoggedOnceRef = useState({ did: false })[0]
  const [isRevizieDebugDialogOpen, setIsRevizieDebugDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editDataEmiterii, setEditDataEmiterii] = useState<Date | undefined>(new Date())
  const [editDataInterventie, setEditDataInterventie] = useState<Date | undefined>(undefined)
  const [editFormData, setEditFormData] = useState<EditFormData>(EMPTY_EDIT_FORM)
  const [editFieldErrors, setEditFieldErrors] = useState<string[]>([])
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)

  const isFinalizatByReport = useMemo(() => {
    const status = String(lucrare?.statusLucrare || "").toLowerCase()
    const byStatus = status === "finalizat"
    const byFinalizare = String((lucrare as any)?.statusFinalizareInterventie || "").toUpperCase() === "FINALIZAT"
    return byStatus || byFinalizare
  }, [lucrare])

  // Revizie: folosim lista de echipamente din equipmentIds, cu fallback la revision.equipment
  const revizieEquipmentIds = useMemo(() => {
    if (!lucrare || lucrare.tipLucrare !== "Revizie") {
      return Array.isArray(lucrare?.equipmentIds) ? (lucrare?.equipmentIds as string[]) : []
    }
    const workAny: any = lucrare as any
    const equipmentIds = Array.isArray(workAny?.equipmentIds) ? (workAny.equipmentIds as string[]) : []
    const revList = Array.isArray(workAny?.revision?.equipment) ? (workAny.revision.equipment as any[]) : []
    const derived = revList
      .map((r: any) => r?.equipmentId || r?.equipmentCode || r?.id || r?.code)
      .filter(Boolean)
      .map((v: any) => String(v))
    const unique = Array.from(new Set(derived))
    return unique.length > equipmentIds.length ? unique : equipmentIds
  }, [lucrare])

  const revizieReportDebug = useMemo(() => {
    if (!lucrare) return null
    const status = ((lucrare as any)?.revision?.equipmentStatus || {}) as Record<string, string>
    const completedIds = revizieEquipmentIds.filter((id) => status[id] === "done")
    const wouldTechSeeGenerateButton = !lucrare.raportGenerat && role === "tehnician"
    const isRevizie = lucrare.tipLucrare === "Revizie"
    const revizieComplete = revizieEquipmentIds.length > 0 && completedIds.length === revizieEquipmentIds.length

    const disabledReasonForRevizie = (() => {
      if (!isRevizie) return null
      if (revizieEquipmentIds.length === 0) return "Nu există revizieEquipmentIds (lista echipamentelor pentru revizie e goală)."
      if (!revizieComplete) return `Revizia nu e completă: ${completedIds.length}/${revizieEquipmentIds.length} done.`
      return null
    })()

    const notVisibleReasonForTech = (() => {
      if (role !== "tehnician") return `Butonul „Generează raport” e afișat doar pentru tehnician. (role=${role})`
      if (lucrare.raportGenerat) return "Butonul nu apare pentru că `raportGenerat=true` (se afișează „Descarcă raport”)."
      if (!isRevizie && !(lucrare as any)?.equipmentVerified) return "Lucrare normală: echipamentul nu e verificat (`equipmentVerified=false`)."
      if (isRevizie && disabledReasonForRevizie) return disabledReasonForRevizie
      return null
    })()

    return {
      when: new Date().toISOString(),
      lucrare: {
        id: lucrare.id,
        nrLucrare: (lucrare as any)?.nrLucrare || "",
        tipLucrare: lucrare.tipLucrare,
        statusLucrare: lucrare.statusLucrare,
        raportGenerat: Boolean(lucrare.raportGenerat),
        equipmentVerified: Boolean((lucrare as any)?.equipmentVerified),
      },
      viewer: {
        role,
        uid: userData?.uid || null,
        displayName: userData?.displayName || null,
        email: userData?.email || null,
      },
      revizie: {
        revizieEquipmentIds,
        counts: {
          total: revizieEquipmentIds.length,
          done: completedIds.length,
        },
        completedIds,
        equipmentStatus: status,
      },
      ui: {
        wouldTechSeeGenerateButton,
        notVisibleReasonForTech,
        showDownloadReportButton: Boolean(lucrare.raportGenerat) && role !== "client",
      },
    }
  }, [lucrare, revizieEquipmentIds, role, userData])

  const openRevizieDebug = useCallback(() => {
    if (!revizieReportDebug) return
    console.log("🧪 [Revizie Report Debug] JSON:", revizieReportDebug)
    setIsRevizieDebugDialogOpen(true)
  }, [revizieReportDebug])

  const copyRevizieDebugJson = useCallback(async () => {
    try {
      if (!revizieReportDebug) return
      const txt = JSON.stringify(revizieReportDebug, null, 2)
      await navigator.clipboard.writeText(txt)
      toast({ title: "Copiat", description: "JSON-ul de debug a fost copiat în clipboard." })
    } catch (e) {
      console.error("Eroare la copiere:", e)
      toast({ title: "Eroare", description: "Nu s-a putut copia JSON-ul.", variant: "destructive" })
    }
  }, [revizieReportDebug])

  // Debug Revizie: logăm o singură dată, doar când e cerut explicit din URL (?debugRevizie=1)
  useEffect(() => {
    if (!debugRevizie) return
    if (!lucrare || lucrare.tipLucrare !== "Revizie") return
    if (debugLoggedOnceRef.did) return
    debugLoggedOnceRef.did = true

    const workAny: any = lucrare as any
    const equipmentIds = Array.isArray(workAny?.equipmentIds) ? workAny.equipmentIds : []
    const equipmentIdSingle = workAny?.echipamentId || workAny?.equipmentId
    const equipmentCodeSingle = workAny?.echipamentCod || workAny?.equipmentCode
    const status = (workAny?.revision?.equipmentStatus || {}) as Record<string, string>
    const statusKeys = Object.keys(status || {})
    const revisionEquipment = Array.isArray(workAny?.revision?.equipment) ? (workAny.revision.equipment as any[]) : []
    const completed = equipmentIds.filter((eid: string) => status[eid] === "done")

    const locatii = Array.isArray(clientData?.locatii) ? clientData.locatii : []
    const workLocationId = workAny?.locationId || workAny?.clientInfo?.locationId || workAny?.clientInfo?.locatieId
    const loc =
      (workLocationId ? locatii.find((l: any) => String(l?.id || "") === String(workLocationId)) : null) ||
      locatii.find((l: any) => l?.nume === lucrare.locatie) ||
      null

    const resolvedEqSamples = equipmentIds.slice(0, 15).map((eid: string) => {
      const eq =
        loc?.echipamente?.find(
          (e: any) => String(e?.id || "") === String(eid) || String(e?.cod || "") === String(eid),
        ) || null
      return { eid, found: !!eq, id: eq?.id, cod: eq?.cod, nume: eq?.nume }
    })

    // Linie simplă (ușor de văzut/căutat) + grup detaliat
    console.log("🔎 [Revizie Debug] summary", {
      lucrareId: lucrare.id,
      nrLucrare: (lucrare as any)?.nrLucrare || "",
      equipmentIdsCount: equipmentIds.length,
      revizieEquipmentIdsCount: revizieEquipmentIds.length,
      revisionEquipmentCount: revisionEquipment.length,
      revisionStatusKeys: statusKeys.length,
      completedCount: completed.length,
    })

    console.groupCollapsed(`🔎 [Revizie Debug] lucrare=${lucrare.id} nr=${(lucrare as any)?.nrLucrare || ""}`)
    console.log("tipLucrare:", lucrare.tipLucrare)
    console.log("equipmentIds (array):", { count: equipmentIds.length, equipmentIds })
    console.log("revizieEquipmentIds (computed):", { count: revizieEquipmentIds.length, revizieEquipmentIds })
    console.log("single equipment fields:", { echipamentId: equipmentIdSingle, echipamentCod: equipmentCodeSingle })
    console.log("revision.equipmentStatus:", { keys: statusKeys.length, sample: statusKeys.slice(0, 20), status })
    console.log("revision.equipment (list):", { count: revisionEquipment.length, revisionEquipment })
    console.log("progress computed from equipmentIds:", { completed: completed.length, total: equipmentIds.length, completedIds: completed })
    console.log("location resolve:", { workLocationId, locatieName: lucrare.locatie, locFound: !!loc, locId: loc?.id, locatiiCount: locatii.length })
    console.log("equipment resolve samples:", resolvedEqSamples)
    console.log("hint:", "Dacă equipmentIds are 1 dar revision.equipment are >1, lista afișată e limitată de equipmentIds.")
    console.groupEnd()
  }, [debugRevizie, lucrare, clientData, debugLoggedOnceRef, revizieEquipmentIds])

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

  useEffect(() => {
    if (isDevizEditorOpen && lucrare && role !== "tehnician" && !lucrare.preluatDispecer) {
      toast({
        title: "Editor indisponibil",
        description: "Lucrarea trebuie preluată de dispecer/admin înainte de editarea devizului.",
        variant: "destructive",
      })
      setIsDevizEditorOpen(false)
    }
  }, [isDevizEditorOpen, lucrare, role])

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

  const openDevizPdf = useCallback(async () => {
    if (!lucrare?.id) return

    const legacyUrl = String((lucrare as any)?.devizDocument?.url || "").trim()
    const openLegacy = () => {
      if (!legacyUrl) return false
      window.open(
        `/api/download?lucrareId=${encodeURIComponent(lucrare.id!)}&type=deviz&url=${encodeURIComponent(legacyUrl)}`,
        "_blank",
      )
      return true
    }

    const sourceProducts = Array.isArray((lucrare as any)?.devizProducts) ? (lucrare as any).devizProducts : []
    if (sourceProducts.length === 0) {
      if (openLegacy()) return
      toast({
        title: "Deviz indisponibil",
        description: "Nu există poziții salvate pentru regenerarea PDF-ului.",
        variant: "destructive",
      })
      return
    }

    try {
      const preparedAtRaw = (lucrare as any)?.devizPreparedAt
      const preparedAt =
        preparedAtRaw?.toDate?.() ||
        (preparedAtRaw instanceof Date ? preparedAtRaw : typeof preparedAtRaw === "string" ? preparedAtRaw : new Date())

      const blob = await generateDevizPdf({
        id: String(lucrare.id),
        numarRaport: String((lucrare as any)?.numarRaport || ""),
        offerNumber: Number((lucrare as any)?.devizSendCount || 0),
        client: String(lucrare.client || ""),
        fromCompany: "NRG Access Systems SRL",
        products: sourceProducts.map((product: any) => ({
          name: String(product?.name || ""),
          quantity: Number(product?.quantity || 0),
          price: Number(product?.price || 0),
        })),
        offerVAT: Number((lucrare as any)?.devizVAT || 0),
        adjustmentPercent: Number((lucrare as any)?.devizAdjustmentPercent || 0),
        preparedBy: String((lucrare as any)?.devizPreparedBy || (lucrare as any)?.preluatDe || userData?.displayName || userData?.email || ""),
        preparedAt,
        beneficiar: {
          name: String((lucrare as any)?.client || clientData?.nume || clientData?.name || ""),
          cui: String((lucrare as any)?.clientInfo?.cui || clientData?.cui || clientData?.cif || ""),
          reg: String((lucrare as any)?.clientInfo?.rc || clientData?.regCom || ""),
          address: String((lucrare as any)?.clientInfo?.adresa || clientData?.adresa || ""),
        },
      } as any)

      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, "_blank")
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (error) {
      console.error("Eroare la regenerarea devizului:", error)
      if (openLegacy()) return
      toast({
        title: "Eroare",
        description: "Nu s-a putut regenera PDF-ul de deviz.",
        variant: "destructive",
      })
    }
  }, [lucrare, clientData, userData])

  // Verifică lucrările active pe același echipament (inclusiv lucrarea curentă),
  // pentru a clarifica blocajul la creare reintervenție.
  useEffect(() => {
    let mounted = true

    const loadEquipmentActiveConflicts = async () => {
      if (!isAdminOrDispatcher || !lucrare?.id) {
        if (mounted) {
          setEquipmentActiveConflicts([])
          setLoadingEquipmentActiveConflicts(false)
        }
        return
      }

      const equipmentId = String((lucrare as any)?.echipamentId || "").trim()
      const equipmentCod = String((lucrare as any)?.echipamentCod || "").trim()

      if (!equipmentId && !equipmentCod) {
        if (mounted) {
          setEquipmentActiveConflicts([])
          setLoadingEquipmentActiveConflicts(false)
        }
        return
      }

      setLoadingEquipmentActiveConflicts(true)
      try {
        const byId = new Map<string, ActiveWorkSummary>()
        const isActiveStatus = (status: unknown) => {
          const normalized = String(status || "").toLowerCase()
          return ACTIVE_WORK_STATUSES.some((activeStatus) => normalized.includes(activeStatus.toLowerCase()))
        }

        const toSummary = (id: string, raw: any): ActiveWorkSummary => ({
          id,
          nrDisplay: String(raw?.nrLucrare || raw?.numarRaport || id),
          statusLucrare: String(raw?.statusLucrare || "N/A"),
          dataInterventie: raw?.dataInterventie ? String(raw.dataInterventie) : undefined,
          tehnicieni: Array.isArray(raw?.tehnicieni) ? raw.tehnicieni.map((t: unknown) => String(t)) : [],
        })

        const addSnapshotEntries = (snapshot: any) => {
          snapshot.docs.forEach((docSnap: any) => {
            const docId = String(docSnap?.id || "")
            if (!docId) return
            const raw = docSnap.data()
            if (!isActiveStatus(raw?.statusLucrare)) return
            byId.set(docId, toSummary(docId, raw))
          })
        }

        if (equipmentId) {
          const byIdQuery = query(collection(db, "lucrari"), where("echipamentId", "==", equipmentId))
          const byIdSnapshot = await getDocs(byIdQuery)
          addSnapshotEntries(byIdSnapshot)
        }

        if (equipmentCod && (byId.size === 0 || !equipmentId)) {
          const byCodQuery = query(collection(db, "lucrari"), where("echipamentCod", "==", equipmentCod))
          const byCodSnapshot = await getDocs(byCodQuery)
          addSnapshotEntries(byCodSnapshot)
        }

        if (!mounted) return
        setEquipmentActiveConflicts(Array.from(byId.values()))
      } catch (error) {
        console.error("Eroare la încărcarea conflictelor active pe echipament:", error)
        if (mounted) setEquipmentActiveConflicts([])
      } finally {
        if (mounted) setLoadingEquipmentActiveConflicts(false)
      }
    }

    loadEquipmentActiveConflicts()
    return () => { mounted = false }
  }, [isAdminOrDispatcher, lucrare?.id, lucrare?.statusLucrare, (lucrare as any)?.echipamentId, (lucrare as any)?.echipamentCod])

  // UX implicit pentru lista de conflicte:
  // 1 conflict => listă deschisă; 2+ conflicte => listă închisă (compact).
  useEffect(() => {
    if (loadingEquipmentActiveConflicts) return
    if (equipmentActiveConflicts.length === 1) {
      setShowConflictDetails(true)
      return
    }
    setShowConflictDetails(false)
  }, [lucrare?.id, loadingEquipmentActiveConflicts, equipmentActiveConflicts.length])

  // Backfill: pentru lucrări vechi, setăm flag-ul de reintervenție pe lucrarea originală
  // ca regulile de arhivare să recunoască faptul că există deja o reintervenție creată.
  useEffect(() => {
    if (!isAdminOrDispatcher) return
    if (!lucrare?.id) return
    if (!Array.isArray(reinterventii) || reinterventii.length === 0) return

    const hasReinterventionFlag =
      (lucrare as any)?.reinterventieLansata === true ||
      Boolean((lucrare as any)?.reinterventieLansataAt) ||
      Boolean((lucrare as any)?.reinterventieLucrareId)

    if (hasReinterventionFlag) return

    const firstReinterventieId = String(reinterventii[0]?.id || "")
    if (!firstReinterventieId) return

    // Optimistic update în UI
    setLucrare((prev) => {
      if (!prev) return prev
      return {
        ...(prev as any),
        reinterventieLansata: true,
        reinterventieLucrareId: firstReinterventieId,
        reinterventieLansataAt: new Date(),
      } as any
    })

    // Persistăm în Firestore (o singură dată / lucrare)
    updateLucrare(lucrare.id, {
      reinterventieLansata: true,
      reinterventieLucrareId: firstReinterventieId,
      reinterventieLansataAt: serverTimestamp() as any,
    }).catch((e) => {
      console.error("Eroare la backfill reinterventieLansata:", e)
    })
  }, [isAdminOrDispatcher, lucrare?.id, reinterventii])

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

  // Helper: parsează în siguranță o dată (Timestamp, ISO, date-only, dd.MM.yyyy) -> Date
  const coerceDate = (val: any): Date | undefined => {
    const d = toDateSafe(val)
    if (d && !isNaN(d.getTime())) return d
    return undefined
  }

  // Încărcăm datele lucrării și adresa locației
  useEffect(() => {
    const fetchLucrareAndLocationAddress = async () => {
      try {
        // Obținem datele lucrării
        const data = await getLucrareById(paramsId)
        setLucrare(data)

        if (!debugLoggedOnceRef.did) {
          debugLoggedOnceRef.did = true
          const workAny: any = data as any
          debugClient("enter_work_page", {
            workId: paramsId,
            clientName: data?.client,
            locatieName: data?.locatie,
            tipLucrare: data?.tipLucrare,
            clientId: workAny?.clientId,
            clientInfoId: workAny?.clientInfo?.id,
            locationId: workAny?.locationId,
            clientInfoLocationId: workAny?.clientInfo?.locationId || workAny?.clientInfo?.locatieId,
            echipamentId: workAny?.echipamentId,
            echipamentCod: workAny?.echipamentCod,
            equipmentIdsCount: Array.isArray(workAny?.equipmentIds) ? workAny.equipmentIds.length : 0,
          })
        }

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
              
              console.log(`✅ Tichet ${paramsId} marcată ca citită automat pentru ${userData.uid}`)
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

        // Încarcă datele clientului dinamic (preferă clientId; fallback safe pe nume unic) și completează backfill.
        if (data?.client) {
          try {
            const workAny: any = data as any
            let resolvedClient: any = null
            let resolution: "byId" | "byNameUnique" | "none" = "none"
            let resolvedFromId: string | null = null

            const existingClientId = workAny.clientId || workAny.clientInfo?.id
            if (existingClientId) {
              try {
                resolvedClient = await getClientById(String(existingClientId))
                resolvedFromId = String(existingClientId)
                resolution = "byId"
              } catch {
                resolvedClient = null
              }
              // Dacă ID-ul există dar clientul nu mai poate fi încărcat (șters / inconsistent),
              // încercăm fallback-ul safe după nume.
              if (!resolvedClient) {
                const clientiRef = collection(db, "clienti")
                const q = query(clientiRef, where("nume", "==", String(data.client)), limit(2))
                const snap = await getDocs(q)
                debugClient("client_fallback_query_after_bad_id", { size: snap.size, clientName: String(data.client) })
                if (snap.size === 1) {
                  const d0 = snap.docs[0]
                  resolvedClient = { id: d0.id, ...(d0.data() as any) }
                  resolvedFromId = d0.id
                  resolution = "byNameUnique"
                  // Persistăm clientId pe lucrare (silent)
                  await updateLucrare(paramsId, { clientId: d0.id } as any, undefined, undefined, true)
                  setLucrare((prev: any) => (prev ? { ...prev, clientId: d0.id } : prev))
                }
              }
            } else {
              // Backfill safe: client.nume e unic → query exact
              const clientiRef = collection(db, "clienti")
              const q = query(clientiRef, where("nume", "==", String(data.client)), limit(2))
              const snap = await getDocs(q)
              debugClient("client_fallback_query_no_id", { size: snap.size, clientName: String(data.client) })
              if (snap.size === 1) {
                const d0 = snap.docs[0]
                resolvedClient = { id: d0.id, ...(d0.data() as any) }
                resolvedFromId = d0.id
                resolution = "byNameUnique"
                // Persistăm clientId pe lucrare (silent)
                await updateLucrare(paramsId, { clientId: d0.id } as any, undefined, undefined, true)
                // Actualizăm și starea locală ca să evităm re-rulări inutile
                setLucrare((prev: any) => (prev ? { ...prev, clientId: d0.id } : prev))
          }
        }

            // Dacă avem doar clientInfo.id (legacy) și nu există clientId pe lucrare, îl persistăm (silent).
            if (!workAny.clientId && workAny.clientInfo?.id) {
              try {
                await updateLucrare(paramsId, { clientId: String(workAny.clientInfo.id) } as any, undefined, undefined, true)
                setLucrare((prev: any) => (prev ? { ...prev, clientId: String(workAny.clientInfo.id) } : prev))
              } catch {}
            }

            if (resolvedClient) {
              setClientData(resolvedClient)
              debugClient("client_resolved", {
                resolution,
                resolvedClientId: resolvedClient?.id || resolvedFromId || null,
                workClientId: workAny?.clientId || null,
                workClientInfoId: workAny?.clientInfo?.id || null,
                clientName: data?.client,
                hasLocatii: Array.isArray(resolvedClient?.locatii),
                locatiiCount: Array.isArray(resolvedClient?.locatii) ? resolvedClient.locatii.length : 0,
              })

              // Resolve locație (preferă locationId, altfel fallback pe nume/adresă)
              const workLocationId = workAny.locationId || workAny.clientInfo?.locationId || workAny.clientInfo?.locatieId
              const locatii = Array.isArray(resolvedClient?.locatii) ? resolvedClient.locatii : []
              let matchedLoc: any =
                workLocationId ? locatii.find((l: any) => String(l?.id || "") === String(workLocationId)) : null
              if (!matchedLoc && data.locatie) {
                matchedLoc = locatii.find((l: any) => l?.nume === data.locatie) || null
              }
              if (!matchedLoc && workAny?.clientInfo?.locationAddress) {
                matchedLoc = locatii.find((l: any) => l?.adresa === workAny.clientInfo.locationAddress) || null
              }

              if (matchedLoc?.adresa) setLocationAddress(String(matchedLoc.adresa))
              setResolvedLocation(matchedLoc || null)

              // Persoană de contact + echipament: derivăm din locația live (fallback la snapshot)
              try {
                const contacts: any[] = Array.isArray(matchedLoc?.persoaneContact) ? matchedLoc.persoaneContact : []
                const targetName = String((data as any)?.persoanaContact || "").trim()
                const foundContact = targetName
                  ? contacts.find((c: any) => String(c?.nume || "").trim() === targetName) || null
                  : null
                setResolvedContact(foundContact || null)
              } catch {
                setResolvedContact(null)
              }
              try {
                const eqs: any[] = Array.isArray(matchedLoc?.echipamente) ? matchedLoc.echipamente : []
                const targetEid = String((data as any).echipamentId || "")
                const targetCod = String((data as any).echipamentCod || "")
                const targetName = String((data as any).echipament || "")
                const foundEq =
                  eqs.find((e: any) => (targetEid && String(e?.id || "") === targetEid)) ||
                  eqs.find((e: any) => (targetCod && String(e?.cod || "") === targetCod)) ||
                  eqs.find((e: any) => (targetName && String(e?.nume || "") === targetName)) ||
                  null
                setResolvedEquipment(foundEq || null)
              } catch {
                setResolvedEquipment(null)
              }
              debugClient("location_resolved", {
                workLocationId: workLocationId ? String(workLocationId) : null,
                matchedLocationId: matchedLoc?.id ? String(matchedLoc.id) : null,
                matchedLocationName: matchedLoc?.nume || null,
                matchedLocationAddress: matchedLoc?.adresa || null,
                via: workLocationId
                  ? "id"
                  : data?.locatie
                    ? "name"
                    : workAny?.clientInfo?.locationAddress
                      ? "address"
                      : "none",
              })

              // Backfill locationId dacă putem (silent)
              if (matchedLoc?.id && !workAny.locationId) {
                await updateLucrare(paramsId, { locationId: String(matchedLoc.id) } as any, undefined, undefined, true)
                setLucrare((prev: any) => (prev ? { ...prev, locationId: String(matchedLoc.id) } : prev))
                debugClient("location_backfilled", { locationId: String(matchedLoc.id) })
              }
                  
              // Calculăm informațiile de garanție folosind clientul live (fără full scan)
              if (data.tipLucrare === "Intervenție în garanție" && data.locatie && (data.echipament || data.echipamentCod || (data as any).echipamentId)) {
                try {
                  const eqs = Array.isArray(matchedLoc?.echipamente) ? matchedLoc.echipamente : []
                  const targetEid = String((data as any).echipamentId || "")
                  const targetCod = String((data as any).echipamentCod || "")
                  const targetName = String((data as any).echipament || "")
                  const eq = eqs.find((e: any) =>
                    (targetEid && String(e?.id || "") === targetEid) ||
                    (targetCod && String(e?.cod || "") === targetCod) ||
                    (targetName && String(e?.nume || "") === targetName)
                  )
                  if (eq) {
                    setEquipmentData(eq)
                    setWarrantyInfo(getWarrantyDisplayInfo(eq))
                  }
                } catch {}
              }
            } else {
              // fallback UI pe snapshot (nu blocăm pagina)
              setClientData(null)
              setResolvedLocation(null)
              setResolvedContact(null)
              setResolvedEquipment(null)
              debugClient("client_not_resolved", {
                reason: existingClientId ? "id_invalid_and_name_not_unique_or_missing" : "no_id_and_name_not_unique_or_missing",
                workClientId: workAny?.clientId || null,
                workClientInfoId: workAny?.clientInfo?.id || null,
                clientName: data?.client,
              })
            }
          } catch (error) {
            console.error("Eroare la încărcarea datelor clientului dinamic:", error)
            debugClient("client_load_error", String((error as any)?.message || error))
          }
        }
      } catch (error) {
        console.error("Eroare la încărcarea tichetului:", error)
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
      (userData?.displayName && !lucrare.tehnicieni.includes(userData.displayName))
    ) {
      // Tehnicianul nu este alocat la această lucrare.
      // Permitem vizualizarea DOAR din fluxul de „Istoric echipament” (scan QR),
      // dar păstrăm restricția pe restul navigației.
      if (!fromIstoricEchipament) {
        toast({
          title: "Acces restricționat",
          description: "Nu aveți acces la această tichet.",
          variant: "destructive",
        })
        router.push("/dashboard/lucrari")
        return
      }

      toast({
        title: "Vizualizare istoric",
        description: "Poți vedea detaliile tichetului, dar nu poți face modificări (nu ești alocat pe tichet).",
      })
    }
  }, [loading, lucrare, userData, router, fromIstoricEchipament])

  // Funcție pentru a șterge o lucrare
  const handleDeleteLucrare = useStableCallback(async () => {
    if (role !== "admin") return
    if (!lucrare?.id) return

    try {
      await deleteLucrare(lucrare.id)
      toast({
        title: "Tichet șters",
        description: "Tichet a fost ștears cu succes.",
      })
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la ștergerea tichetului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la ștergerea tichetului.",
        variant: "destructive",
      })
    }
  })

  const validateEditForm = useCallback(() => {
    const errors: string[] = []
    if (!editDataInterventie) errors.push("dataInterventie")
    if (!editFormData.tipLucrare) errors.push("tipLucrare")
    if (!editFormData.client) errors.push("client")
    setEditFieldErrors(errors)
    return errors.length === 0
  }, [editDataInterventie, editFormData.tipLucrare, editFormData.client])

  const handleEditInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setEditFormData((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleEditSelectChange = useCallback((id: string, value: string) => {
    setEditFormData((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleEditTehnicieniChange = useCallback((value: string) => {
    setEditFormData((prev) => {
      const isAlready = prev.tehnicieni.includes(value)
      const nextTehnicieni = isAlready ? prev.tehnicieni.filter((t) => t !== value) : [...prev.tehnicieni, value]
      const nextStatus =
        prev.statusLucrare === "Finalizat" || prev.statusLucrare === "Arhivată" || prev.statusLucrare === WORK_STATUS.CANCELED
          ? prev.statusLucrare
          : (nextTehnicieni.length > 0 ? "Atribuită" : "Listată")
      return { ...prev, tehnicieni: nextTehnicieni, statusLucrare: nextStatus }
    })
  }, [])

  const handleEditCustomChange = useCallback((field: string, value: any) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleUpdateFromDetail = useCallback(async () => {
    if (!lucrare?.id) return
    if (isEditSubmitting) return

    if (!validateEditForm()) {
      if (!editDataInterventie) {
        toast({
          title: "Data intervenție lipsă",
          description: "Selectați data la care se solicită intervenția.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Eroare",
          description: "Vă rugăm să completați toate câmpurile obligatorii.",
          variant: "destructive",
        })
      }
      return
    }

    try {
      setIsEditSubmitting(true)

      let statusLucrare = editFormData.statusLucrare
      const hasTechnicians = Array.isArray(editFormData.tehnicieni) && editFormData.tehnicieni.length > 0
      if (
        statusLucrare !== "Finalizat" &&
        statusLucrare !== "Arhivată" &&
        statusLucrare !== WORK_STATUS.NO_SIGNATURE &&
        statusLucrare !== WORK_STATUS.CANCELED
      ) {
        statusLucrare = hasTechnicians ? "Atribuită" : "Listată"
      }

      const updatedPayload: any = {
        ...editFormData,
        statusLucrare,
        dataEmiterii: format(editDataEmiterii || new Date(), "dd.MM.yyyy HH:mm"),
        dataInterventie: format(editDataInterventie as Date, "dd.MM.yyyy HH:mm"),
      }

      if (updatedPayload.tipLucrare === "Revizie") {
        delete updatedPayload.echipament
        delete updatedPayload.echipamentId
        delete updatedPayload.echipamentCod
      }

      Object.keys(updatedPayload).forEach((k) => {
        if (updatedPayload[k] === undefined) delete updatedPayload[k]
      })

      await updateLucrare(
        lucrare.id,
        updatedPayload,
        userData?.uid,
        userData?.displayName || userData?.email || "Utilizator",
      )

      setLucrare((prev) => (prev ? ({ ...prev, ...updatedPayload } as Lucrare) : prev))
      setIsEditDialogOpen(false)
      toast({
        title: "Tichet actualizat",
        description: "Modificările au fost salvate cu succes.",
      })
    } catch (error) {
      console.error("Eroare la actualizarea tichetului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea tichetului.",
        variant: "destructive",
      })
    } finally {
      setIsEditSubmitting(false)
    }
  }, [
    lucrare?.id,
    isEditSubmitting,
    validateEditForm,
    editDataInterventie,
    editFormData,
    editDataEmiterii,
    userData?.uid,
    userData?.displayName,
    userData?.email,
  ])

  // Funcție pentru a edita lucrarea direct din pagina de detaliu
  const handleEdit = useCallback(() => {
    if (!lucrare) return
    setEditDataEmiterii(toDateSafe(lucrare.dataEmiterii) || new Date())
    setEditDataInterventie(toDateSafe(lucrare.dataInterventie) || undefined)
    setEditFormData({
      tipLucrare: lucrare.tipLucrare || "",
      tehnicieni: Array.isArray(lucrare.tehnicieni) ? [...lucrare.tehnicieni] : [],
      client: lucrare.client || "",
      locatie: lucrare.locatie || "",
      echipament: (lucrare as any).echipament || "",
      descriere: (lucrare as any).descriere || "",
      persoanaContact: (lucrare as any).persoanaContact || "",
      telefon: (lucrare as any).telefon || "",
      statusLucrare: lucrare.statusLucrare || "Listată",
      statusFacturare: lucrare.statusFacturare || "Nefacturat",
      contract: (lucrare as any).contract || "",
      contractNumber: (lucrare as any).contractNumber || "",
      contractType: (lucrare as any).contractType || "",
      defectReclamat: (lucrare as any).defectReclamat || "",
      defectReclamatHistory: (lucrare as any).defectReclamatHistory || [],
      persoaneContact: (lucrare as any).persoaneContact || [],
      echipamentId: (lucrare as any).echipamentId || "",
      echipamentCod: (lucrare as any).echipamentCod || "",
      equipmentIds: Array.isArray((lucrare as any).equipmentIds) ? (lucrare as any).equipmentIds : [],
    })
    setEditFieldErrors([])
    setIsEditDialogOpen(true)
  }, [lucrare])

  // Navigare unificată către istoricul echipamentului (același mecanism folosit în aplicație)
  const reportGeneratorRef = useRef<HTMLButtonElement>(null)

  const handleReportPdfDownload = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const fileName = `Raport_${lucrare?.nrLucrare || lucrare?.numarRaport || lucrare?.id || "tichet"}.pdf`
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    },
    [lucrare?.id, lucrare?.nrLucrare, lucrare?.numarRaport],
  )

  /** Descarcă raportul generat — același mecanism ca butonul din secțiunea „Documente PDF”. */
  const handleDownloadReport = useCallback(() => {
    if (!lucrare?.raportGenerat || !lucrare?.id) return
    reportGeneratorRef.current?.click()
    toast({
      title: "Descărcare raport",
      description: "Raportul se va descărca automat...",
      variant: "default",
    })
  }, [lucrare?.id, lucrare?.raportGenerat, toast])

  // Modificăm funcția handleGenerateReport pentru a descărca direct raportul dacă este generat
  const handleGenerateReport = useCallback(() => {
    if (!lucrare?.id) {
      console.error("ID-ul tichetului lipsește:", lucrare)
      toast({
        title: "Eroare",
        description: "ID-ul tichetului nu este valid",
        variant: "destructive",
      })
      return
    }

    // Pentru revizii, verificăm dacă toate echipamentele au fost revizuite
    if (lucrare.tipLucrare === "Revizie" && revizieEquipmentIds.length > 0) {
      const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
      const all = revizieEquipmentIds
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

    // Raport deja generat: descărcare în pagină (ReportGenerator ascuns), ca în „Documente PDF”.
    handleDownloadReport()
  }, [router, lucrare, toast, revizieEquipmentIds, handleDownloadReport])

  // Funcție pentru a reîncărca datele lucrării
  // Important UX: toast "Actualizat" doar pentru acțiuni explicite (ex: salvare), nu la refresh automat (ex: focus).
  const refreshLucrare = useStableCallback(async (options?: { preserveActiveTab?: boolean; showToast?: boolean }) => {
    const preserveActiveTab = options?.preserveActiveTab ?? false
    const showToast = options?.showToast ?? false
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

      console.log("Refreshed tichet data:", data)

      // Toast doar pentru acțiuni explicite (avoid spam)
      if (showToast) {
        toast({
          title: "Actualizat",
          description: "Datele tichetului au fost actualizate.",
        })
      }
    } catch (error) {
      console.error("Eroare la reîncărcarea tichetului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut reîncărca datele tichetului.",
        variant: "destructive",
      })
    }
  })

  // Finalizare parțială pentru revizii: închide lucrarea curentă și creează o lucrare nouă cu echipamentele rămase
  const handleFinalizePartial = useStableCallback(async () => {
    if (!lucrare || lucrare.tipLucrare !== "Revizie" || revizieEquipmentIds.length === 0) return
    const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
    const all = revizieEquipmentIds
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
    if (!window.confirm(`Finalizezi parțial revizia? Echipamente finalizate: ${done.length}. Se creează o tichet nouă pentru ${remaining.length} echipament(e) rămas(e).`)) {
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
        description: `Am creat o tichet nouă pentru echipamentele rămase (ID: ${created.id}).`,
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

  // Utilitare locale pentru a afișa corect datele indiferent de tip (string/Date/Timestamp)
  const toDateSafe = (val: any): Date | null => {
    try {
      if (!val) return null
      // Firestore Timestamp
      if (typeof val?.toDate === "function") return val.toDate()
      // Admin SDK serialized object { seconds, nanoseconds }
      if (typeof val?.seconds === "number" && typeof val?.nanoseconds === "number") {
        return new Date(val.seconds * 1000 + Math.floor(val.nanoseconds / 1e6))
      }
      if (val instanceof Date) return val
      if (typeof val === "string") {
        const parts = val.trim()
        // Accept ONLY strict ISO-like strings for native Date parsing to avoid dd.MM ambiguity
        const isIsoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/.test(parts)
        if (isIsoLike) {
          const maybe = new Date(parts)
          if (!isNaN(maybe.getTime())) return maybe
        }
        // Try parse dd.MM.yyyy HH:mm
        const [datePart, timePart] = parts.split(" ")
        if (datePart) {
          const [dd, mm, yyyy] = datePart.split(".").map((x) => parseInt(x, 10))
          const [hh = 0, min = 0] = (timePart || "00:00").split(":").map((x) => parseInt(x, 10))
          if (yyyy && mm && dd) {
            return new Date(yyyy, (mm - 1) as number, dd, hh || 0, min || 0, 0, 0)
          }
        }
      }
    } catch {}
    return null
  }

  const formatDateSafe = (val: any): string => {
    const d = toDateSafe(val)
    if (!d) return "-"
    try {
      // cerință: pe pagina de detalii folosim „02 dec 2025”
      return formatUiDate(d)
    } catch {
      return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")
    }
  }

  // Detectăm întoarcerea de la pagina de raport prin focus pe fereastră
  useEffect(() => {
    let hasFocus = true
    
    const handleFocus = () => {
      // Doar dacă fereastra a fost într-adevăr blurred înainte (adică s-a navigat la altă pagină)
      if (!hasFocus) {
        // Delay scurt pentru a permite actualizarea în Firebase
        setTimeout(() => {
          refreshLucrare({ showToast: false })
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
      console.warn("Nu s-a putut verifica existența unei alte tichete active:", e)
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
          title: "Ai deja o tichet deschisă",
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
        const dataSosire = formatUiDate(now)
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

        if (role === "tehnician" && userData?.uid) {
          void ensureAutoCheckInFromFirstQr({
            userId: userData.uid,
            userName: userData.displayName,
            atMs: now.getTime(),
          }).then((res) => {
            if (res.ok) {
              toast({
                title: "Pontaj pornit automat",
                description: "Primul QR al zilei — ora pontajului este ora scanării.",
              })
            } else if (!res.ok && !res.skipped) {
              console.warn("Pontaj automat (primul QR) eșuat:", res.error)
            }
          })
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
        description: "Echipamentul scanat nu corespunde cu cel din tichet. Nu puteți continua intervenția.",
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
        title: "Tichet preluat",
        description: shouldList 
          ? "Tichetul a fost marcat ca preluat și trecut în status 'Listat'."
          : "Tichetul a fost marcat ca preluat de dispecer.",
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

  const handleCancelWorkOrder = async () => {
    if (!lucrare?.id) return
    if (!cancelReason.trim()) {
      toast({
        title: "Motiv obligatoriu",
        description: "Vă rugăm să introduceți motivul anulării.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsCancelling(true)
      const archivedBy = userData?.displayName || userData?.email || "Dispecer"
      await updateLucrare(
        lucrare.id,
        {
          statusLucrare: WORK_STATUS.ARCHIVED,
          archivedAt: serverTimestamp(),
          archivedBy,
          anulat: true,
          motivAnulare: cancelReason.trim(),
          anulatAt: serverTimestamp(),
          anulatDe: archivedBy,
          anulatDeId: userData?.uid || "",
        } as any,
        userData?.uid,
        archivedBy,
      )

      setLucrare((prev) =>
        prev
          ? {
              ...prev,
              statusLucrare: WORK_STATUS.ARCHIVED,
              archivedBy,
              anulat: true,
              motivAnulare: cancelReason.trim(),
              anulatAt: new Date().toISOString(),
              anulatDe: archivedBy,
              anulatDeId: userData?.uid || "",
            }
          : null,
      )
      setIsCancelDialogOpen(false)
      setCancelReason("")
      toast({
        title: "Tichet anulat",
        description: "Tichetul a fost anulat și arhivat.",
      })
      router.push(`/dashboard/arhivate/${lucrare.id}`)
    } catch (error) {
      console.error("Eroare la anularea tichetului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut anula tichetul.",
        variant: "destructive",
      })
    } finally {
      setIsCancelling(false)
    }
  }

  // Funcție pentru formatarea numărului de telefon pentru apelare
  const formatPhoneForCall = (phone: string) => {
    // Eliminăm toate caracterele non-numerice
    return phone.replace(/\D/g, "")
  }

  const getRevisionSheetNumberLabel = useCallback((equipmentId: string): string => {
    const rawBase = String(lucrare?.nrLucrare || lucrare?.numarRaport || lucrare?.id || "")
      .replace(/^#\s*/, "")
      .trim()
    const baseNumber = /^\d+$/.test(rawBase) ? rawBase.padStart(6, "0") : (rawBase || "000000")
    const idx = revizieEquipmentIds.findIndex((id: string) => String(id) === String(equipmentId))
    const n = idx >= 0 ? idx + 1 : 1
    return `${baseNumber} - ${n}`
  }, [lucrare?.nrLucrare, lucrare?.numarRaport, lucrare?.id, revizieEquipmentIds])

  // --- UTILITARE DESCĂRCĂRI CLIENT ---
  const handleClientDownloadReport = useCallback(() => {
    handleDownloadReport()
  }, [handleDownloadReport])

  const handleClientDownloadEquipmentSheet = useCallback(
    async (equipmentId: string, equipmentLabel?: string, headerOverride?: string) => {
      if (!lucrare?.id) return
      try {
        const sheetNumberLabel = getRevisionSheetNumberLabel(String(equipmentId))
        const blob = await generateRevisionEquipmentPDF(String(lucrare.id), String(equipmentId), {
          headerLabelOverride: headerOverride,
          sheetNumberLabel,
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const finalLabel = headerOverride || equipmentLabel || equipmentId || "Echipament"
        const safeLabel = finalLabel.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
        const safeSheetNumber = sheetNumberLabel.replace(/[\\/:*?"<>|]+/g, "").trim()
        a.download = `Fisa_Operatiuni_${safeLabel}_${safeSheetNumber}.pdf`
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
    },
    [lucrare?.id, getRevisionSheetNumberLabel, toast]
  )

  const renderEquipmentDocumentation = (): React.ReactNode => {
    try {
      if (!lucrare?.echipamentCod || !clientData?.locatii) return null
      const loc = (clientData.locatii || []).find(
        (l: any) => l?.nume === lucrare?.locatie || l?.adresa === lucrare?.clientInfo?.locationAddress
      )
      const eq = loc?.echipamente?.find((e: any) => e?.cod === lucrare?.echipamentCod)
      return (
        <EquipmentDocumentationList
          folderId={(eq as any)?.documentationFolderId}
          subfolderId={(eq as any)?.documentationSubfolderId}
          fileIds={(eq as any)?.documentationFileIds}
        />
      )
    } catch {
      return <div className="text-sm text-muted-foreground">Nu există documentație disponibilă.</div>
    }
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
        <DashboardHeader heading="Tichet negăsit" text="Tichetul nu a fost găsit în sistem" />
        <Button onClick={() => router.back()}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>
      </DashboardShell>
    )
  }

  const hasPostponeContext = Boolean(lucrare?.motivAmanare || lucrare?.dataAmanare || lucrare?.amanataDe)
  const isCompletedWithReport = isFinalizatByReport && lucrare.raportGenerat === true
  const isCanceled = isLucrareAnulata(lucrare)
  const offerResponseStatus = (lucrare as any)?.offerResponse?.status as "accept" | "reject" | undefined
  const offerResponseReason = String((lucrare as any)?.offerResponse?.reason || "").trim()
  const offerResponseVerifiedEmail = String((lucrare as any)?.offerResponse?.verifiedEmail || "").trim()
  const offerResponseVersionAtRaw =
    (lucrare as any)?.offerResponse?.versionSavedAt ||
    (lucrare as any)?.offerActionVersionSavedAt ||
    (lucrare as any)?.offerActionSnapshot?.savedAt ||
    (lucrare as any)?.acceptedOfferSnapshot?.savedAt ||
    null
  const offerResponseVersionAt = offerResponseVersionAtRaw ? String(offerResponseVersionAtRaw) : null
  const offerVersionsRaw = Array.isArray((lucrare as any)?.offerVersions) ? ((lucrare as any).offerVersions as Array<any>) : []
  const offerVersionsHistory = [...offerVersionsRaw].sort((a, b) => {
    const aMs = toDateSafe(a?.savedAt as any)?.getTime() || 0
    const bMs = toDateSafe(b?.savedAt as any)?.getTime() || 0
    return bMs - aMs
  })
  const offerResponsesHistoryRaw = Array.isArray((lucrare as any)?.offerResponsesHistory)
    ? ((lucrare as any).offerResponsesHistory as Array<any>)
    : []
  const offerResponsesHistory = offerResponsesHistoryRaw
    .map((row) => ({
      status: row?.status === "accept" || row?.status === "reject" ? row.status : undefined,
      reason: String(row?.reason || "").trim(),
      verifiedEmail: String(row?.verifiedEmail || "").trim(),
      versionSavedAt: row?.versionSavedAt ? String(row.versionSavedAt) : "",
      offerSendCountAtResponse:
        typeof row?.offerSendCountAtResponse === "number"
          ? row.offerSendCountAtResponse
          : Number(row?.offerSendCountAtResponse || 0) || undefined,
      tokenUsed: String(row?.tokenUsed || "").trim(),
      at: row?.at,
    }))
    .filter((row) => row.status)
    .sort((a, b) => {
      const aMs = toDateSafe(a.at as any)?.getTime() || 0
      const bMs = toDateSafe(b.at as any)?.getTime() || 0
      return bMs - aMs
    })
  const fallbackCurrentOfferResponse =
    offerResponseStatus
      ? [
          {
            status: offerResponseStatus,
            reason: offerResponseReason,
            verifiedEmail: offerResponseVerifiedEmail,
            versionSavedAt: offerResponseVersionAt || "",
            offerSendCountAtResponse: Number((lucrare as any)?.offerSendCount || 0) || undefined,
            tokenUsed: "",
            at: (lucrare as any)?.offerResponse?.at,
          },
        ]
      : []
  const allOfferResponses = offerResponsesHistory.length > 0 ? offerResponsesHistory : fallbackCurrentOfferResponse
  const mappedVersionKeys = new Set(offerVersionsHistory.map((version) => String(version?.savedAt || "")))
  const versionsAsc = [...offerVersionsHistory].sort((a, b) => {
    const aMs = toDateSafe(a?.savedAt as any)?.getTime() || 0
    const bMs = toDateSafe(b?.savedAt as any)?.getTime() || 0
    return aMs - bMs
  })
  const versionKeyBySendCount = new Map<number, string>()
  versionsAsc.forEach((version, index) => {
    const versionKey = String(version?.savedAt || "")
    if (versionKey) {
      versionKeyBySendCount.set(index + 1, versionKey)
    }
  })
  const versionsAscWithMs = versionsAsc
    .map((version) => ({
      versionKey: String(version?.savedAt || ""),
      savedAtMs: toDateSafe(version?.savedAt as any)?.getTime() || 0,
    }))
    .filter((row) => row.versionKey)

  const resolvedOfferResponses = allOfferResponses.map((row) => {
    const directVersionKey = String(row.versionSavedAt || "")
    if (directVersionKey && mappedVersionKeys.has(directVersionKey)) {
      return { ...row, resolvedVersionSavedAt: directVersionKey }
    }

    if (row.offerSendCountAtResponse && versionKeyBySendCount.has(row.offerSendCountAtResponse)) {
      return {
        ...row,
        resolvedVersionSavedAt: String(versionKeyBySendCount.get(row.offerSendCountAtResponse) || ""),
      }
    }

    const responseAtMs = toDateSafe(row.at as any)?.getTime() || 0
    if (responseAtMs > 0 && versionsAscWithMs.length > 0) {
      const candidate =
        [...versionsAscWithMs].reverse().find((version) => version.savedAtMs > 0 && version.savedAtMs <= responseAtMs) ||
        versionsAscWithMs[0]
      if (candidate?.versionKey) {
        return { ...row, resolvedVersionSavedAt: candidate.versionKey }
      }
    }

    return { ...row, resolvedVersionSavedAt: "" }
  })

  const unmappedOfferResponses = resolvedOfferResponses.filter((row) => !row.resolvedVersionSavedAt)
  const latestOfferResponse = allOfferResponses.length > 0 ? allOfferResponses[0] : null
  const hasOfferHistory =
    offerVersionsHistory.length > 0 ||
    Number((lucrare as any)?.offerSendCount || 0) > 0 ||
    Boolean((lucrare as any)?.lastOfferEmail) ||
    allOfferResponses.length > 0

  const formatOfferHistoryDate = (value: any) => {
    const date = toDateSafe(value)
    return date ? `${formatUiDate(date)} ${formatTime(date)}` : "-"
  }
  
  // Condiții pentru reintervenție: lucrare preluată + (raport generat sau context de amânare) + neanulată
  const needsReintervention = (lucrare: any) => {
    const hasWorkPostponeContext = Boolean(lucrare?.motivAmanare || lucrare?.dataAmanare || lucrare?.amanataDe)
    return Boolean(
      lucrare?.preluatDispecer === true &&
      (lucrare?.raportGenerat === true || hasWorkPostponeContext) &&
      !isLucrareAnulata(lucrare)
    )
  }
  
  // Funcție pentru a gestiona reintervenția - deschide dialogul de motive
  const handleReintervention = () => {
    if (!lucrare) return
    if (loadingEquipmentActiveConflicts || equipmentActiveConflicts.length > 0) {
      toast({
        title: "Reintervenție blocată",
        description:
          "Nu poți crea încă o reintervenție: există deja tichete active pe acest echipament.",
        variant: "destructive",
      })
      return
    }
    
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

  const ticketBadgeText =
    lucrare.nrLucrare && lucrare.tipLucrare === "Revizie" && revizieEquipmentIds.length > 0
      ? `${lucrare.nrLucrare} - ${revizieEquipmentIds.length}`
      : lucrare.nrLucrare

  const hasExternalConflict = equipmentActiveConflicts.some((conflict) => conflict.id !== lucrare.id)
  const onlyCurrentTicketConflict = equipmentActiveConflicts.length > 0 && !hasExternalConflict
  const conflictTitle = loadingEquipmentActiveConflicts
    ? "Verificare tichete active"
    : onlyCurrentTicketConflict
      ? "Tichetul curent este deja activ"
      : "Reintervenția este blocată de un tichet activ"
  const conflictDescription = loadingEquipmentActiveConflicts
    ? "Verificăm tichetele active pe acest echipament..."
    : onlyCurrentTicketConflict
      ? "Acest tichet este activ pe echipament; nu poți crea încă o reintervenție nouă."
      : `Există deja ${equipmentActiveConflicts.length} ${
          equipmentActiveConflicts.length === 1 ? "tichet activ" : "tichete active"
        } pe acest echipament.`
  const conflictCardClass = loadingEquipmentActiveConflicts
    ? "bg-amber-50 border-amber-200"
    : onlyCurrentTicketConflict
      ? "bg-blue-50 border-blue-200"
      : "bg-amber-50 border-amber-200"
  const conflictIconClass = loadingEquipmentActiveConflicts
    ? "text-amber-600"
    : onlyCurrentTicketConflict
      ? "text-blue-600"
      : "text-amber-600"
  const conflictBadgeClass = onlyCurrentTicketConflict
    ? "border-blue-300 bg-blue-100 text-blue-800"
    : "border-amber-300 bg-amber-100 text-amber-900"

  return (
    <TooltipProvider>
      <DashboardShell>
        {/* Generator ascuns — descărcare raport fără navigare (folosit de butonul de sus și de client). */}
        {lucrare?.raportGenerat && (
          <div className="hidden" aria-hidden="true">
            <ReportGenerator
              lucrare={lucrare as any}
              onGenerate={handleReportPdfDownload}
              ref={reportGeneratorRef}
            />
          </div>
        )}

        {/* Dialog debug: doar admin */}
        {isAdmin && revizieReportDebug && (
          <Dialog open={isRevizieDebugDialogOpen} onOpenChange={setIsRevizieDebugDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Debug „Generează raport” (Revizie)</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Acest JSON explică de ce butonul apare / nu apare / este dezactivat (în funcție de rol, `raportGenerat`,
                  statusuri pe echipamente).
                </p>
                <Textarea
                  readOnly
                  className="min-h-[360px] font-mono text-xs"
                  value={JSON.stringify(revizieReportDebug, null, 2)}
                />
              </div>
              <DialogFooter className="flex gap-2 sm:justify-end">
                <Button variant="outline" onClick={copyRevizieDebugJson}>
                  Copiază JSON
                </Button>
                <Button onClick={() => setIsRevizieDebugDialogOpen(false)}>Închide</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      <DashboardHeader 
        heading={
          <span className="flex items-center gap-2">
            Tichetul: 
            {lucrare.nrLucrare && (
              <Badge className="bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-100 text-base font-semibold px-3 py-1 rounded-md">
                {ticketBadgeText}
              </Badge>
            )}
            {" - "}
            {lucrare.tipLucrare}
          </span>
        } 
      >
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => router.back()}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
            </Button>

            {isAdminOrDispatcher && !isCanceled && (
              <Button
                variant="destructive"
                onClick={() => setIsCancelDialogOpen(true)}
                disabled={isUpdating || isCancelling}
              >
                <X className="mr-2 h-4 w-4" />
                Anulează
              </Button>
            )}

          {/* Tehnician: verifică istoricul echipamentului (după echipamentCod) */}
          {role === "tehnician" && lucrare?.echipamentCod && (
            <Button asChild variant="outline">
              <Link
                href={`/dashboard/istoric-interventii/echipament?cod=${encodeURIComponent(String(lucrare.echipamentCod))}`}
              >
                <History className="mr-2 h-4 w-4" /> Vezi istoric
              </Link>
            </Button>
          )}

          {/* Raport: ascuns pentru rol client (au secțiune dedicată mai jos) */}
          {lucrare.raportGenerat && role !== "client" && (
            <Button onClick={handleDownloadReport}>
              <FileText className="mr-2 h-4 w-4" /> Descarcă raport
            </Button>
          )}

          {/* Doar tehnicienii pot genera raportul, și doar dacă nu este deja generat */}
          {!lucrare.raportGenerat && role === "tehnician" && (
            <Button 
              onClick={handleGenerateReport}
              disabled={
                role === "tehnician" && 
                (lucrare.tipLucrare === "Revizie" 
                  ? (() => {
                      // Pentru revizii: verificăm dacă toate echipamentele sunt completate
                      if (revizieEquipmentIds.length === 0) return true
                      const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                      const completed = revizieEquipmentIds.filter((id) => status[id] === "done")
                      return completed.length < revizieEquipmentIds.length
                    })()
                  : !equipmentVerified // Pentru lucrări normale: verificare QR echipament
                )
              }
            >
              <FileText className="mr-2 h-4 w-4" /> Generează raport
            </Button>
          )}

          {/* Debug: admin */}
          {isAdmin && lucrare.tipLucrare === "Revizie" && (
            <Button variant="outline" onClick={openRevizieDebug}>
              Debug raport (revizie)
            </Button>
          )}

          {lucrare.statusLucrare === WORK_STATUS.ARCHIVED && role === "admin" && (
            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                if (!window.confirm("Sigur doriți să dezarhivați această tichet? Va reveni la statusul 'Finalizat'.")) return
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
              disabled={loadingEquipmentActiveConflicts || equipmentActiveConflicts.length > 0}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reintervenție
            </Button>
          )}

          {/* Buton pentru arhivare - vizibil întotdeauna pentru admin/dispecer, disabled când nu sunt îndeplinite condițiile */}
          {isAdminOrDispatcher && (() => {
            const lucrareForArchiveValidation: any = {
              ...(lucrare as any),
              // ajută regulile să recunoască reintervențiile fără a depinde exclusiv de flag-uri
              reinterventiiCount: Array.isArray(reinterventii) ? reinterventii.length : 0,
            }
            const details = getArchiveValidationDetails(lucrareForArchiveValidation, archiveRulesConfig)
            const canArchive = details.canArchive
            const disableReason = !canArchive ? (details.blockingReasons?.[0] || "Nu se poate arhiva încă") : ""
            
            // Tooltip diferit în funcție de starea butonului
            const tooltipContent = !canArchive 
              ? (
                  <div className="max-w-xs">
                    <p className="font-semibold mb-2">Nu se poate arhiva încă</p>
                    {details.blockingReasons?.length ? (
                      <ul className="text-sm list-disc pl-4 space-y-1">
                        {details.blockingReasons.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                    <ul className="text-sm list-disc pl-4 space-y-1">
                      <li>{disableReason}</li>
                      </ul>
                    )}

                    {details.ignoredRules?.length ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="font-semibold mb-2 text-xs text-muted-foreground">Reguli ignorate (dezactivate din Setări Sistem)</p>
                        <ul className="text-xs list-disc pl-4 space-y-1 text-muted-foreground">
                          {details.ignoredRules.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                    </ul>
                      </div>
                    ) : null}
                  </div>
                )
              : (
                  <div className="max-w-xs">
                    <p className="font-semibold mb-2">Gata de arhivare</p>
                    <p className="text-sm">Toate condițiile sunt îndeplinite. Click pentru a arhiva lucrarea.</p>
                    {details.ignoredRules?.length ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="font-semibold mb-2 text-xs text-muted-foreground">Reguli ignorate (dezactivate din Setări Sistem)</p>
                        <ul className="text-xs list-disc pl-4 space-y-1 text-muted-foreground">
                          {details.ignoredRules.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
                        if (window.confirm("Sigur doriți să arhivați această tichet? Lucrarea va fi mutată în secțiunea Arhivate.")) {
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
          {isAdminOrDispatcher && !lucrare.preluatDispecer && !isCanceled && (isCompletedWithReport || lucrare.statusLucrare === WORK_STATUS.POSTPONED) && (
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
                      if (window.confirm("Sigur doriți să ștergeți această tichet?")) {
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

          {isAdminOrDispatcher && needsReintervention(lucrare) && (loadingEquipmentActiveConflicts || equipmentActiveConflicts.length > 0) && (
            <Alert variant="default" className={conflictCardClass}>
              <AlertCircle className={`h-4 w-4 ${conflictIconClass}`} />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{conflictTitle}</p>
                    {!loadingEquipmentActiveConflicts && (
                      <Badge variant="outline" className={`text-xs ${conflictBadgeClass}`}>
                        {equipmentActiveConflicts.length}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">{conflictDescription}</p>

                  {!loadingEquipmentActiveConflicts && equipmentActiveConflicts.length > 0 && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setShowConflictDetails((prev) => !prev)}
                      >
                        {showConflictDetails ? "Ascunde tichetele active" : "Vezi tichetele active"}
                      </Button>

                      {showConflictDetails && (
                        <div className="space-y-1">
                          {equipmentActiveConflicts.map((conflict) => {
                            const displayNrRaw = String(conflict.nrDisplay || conflict.id || "").trim()
                            const displayNr = displayNrRaw.startsWith("#") ? displayNrRaw : `#${displayNrRaw}`
                            const isCurrentTicket = conflict.id === lucrare.id
                            return (
                              <div
                                key={conflict.id}
                                className="flex flex-col gap-2 rounded border border-border bg-white/70 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium">{displayNr}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {conflict.statusLucrare || "N/A"}
                                  </Badge>
                                  {isCurrentTicket && (
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                      acest tichet
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs self-start sm:self-center"
                                >
                                  <Link href={relatedTicketUrl(conflict.id)}>
                                    Deschide
                                  </Link>
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
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

      {role !== "client" && lucrare?.statusLucrare === WORK_STATUS.NO_SIGNATURE && (
        <Alert variant="default" className="mb-4 border-amber-300 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Semnare amânată („Semnează mai târziu”)</AlertTitle>
          <AlertDescription className="space-y-3 text-amber-950/90">
            <p>
              Tichetul are statusul „Fără semnătură”. Intervenția se încheie cu semnătura clientului din pagina de raport.
            </p>
            <Button asChild variant="outline" size="sm" className="border-amber-400 bg-white hover:bg-amber-100">
              <Link href={`/raport/${paramsId}`}>Deschide raportul</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isReadOnlyTechView && (
        <Alert variant="default" className="mb-4 bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Vizualizare doar</AlertTitle>
          <AlertDescription>
            Vizualizare doar – nu ești alocat pe tichet. Poți vedea detaliile și documentele, dar nu poți face modificări.
          </AlertDescription>
        </Alert>
      )}

      {role === "tehnician" && lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true && (
        <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertTitle>Tichet finalizat</AlertTitle>
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
            Detalii&nbsp;Tichet
          </TabsTrigger>

          {/* ------------ 3. Verificare Echipament (100 % pe mobil) ------- */}
          {/* ASCUNS pentru revizii - verificarea se face per echipament în fișa de operațiuni */}
          {role === "tehnician" &&
            isAssignedTehnician &&
            !lucrare.raportGenerat &&
            lucrare.statusLucrare !== WORK_STATUS.POSTPONED &&
            lucrare.tipLucrare !== "Revizie" && (
            <TabsTrigger value="verificare" className="basis-full md:basis-auto text-center whitespace-normal">
              Verificare echipament
            </TabsTrigger>
          )}
          {/* ------------ 2. Intervenție (50 %) --------------------------- */}
          {/* ASCUNS pentru revizii - intervenția se face per echipament în fișa de operațiuni */}
          {role === "tehnician" &&
            isAssignedTehnician &&
            !lucrare.raportGenerat &&
            lucrare.statusLucrare !== WORK_STATUS.POSTPONED &&
            lucrare.tipLucrare !== "Revizie" && (
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
            <Card className="border-0 shadow-none bg-transparent md:border md:bg-card md:shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                <CardTitle className="text-xl md:text-2xl">Detalii lucrare</CardTitle>
            
                  </div>
                </div>

                {/* Documentație echipament (vizibilă pentru tehnicieni) */}
                {role === "tehnician" && lucrare?.echipamentCod && clientData?.locatii && (
                  <div className="mt-4">
                    <p className="text-base font-semibold mb-2">Documentație echipament:</p>
                    {renderEquipmentDocumentation()}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="text-base md:text-sm flex flex-wrap items-start gap-x-3 gap-y-2 mt-2">
                  <div className="flex flex-col min-w-[140px]">
                    <div className="text-sm md:text-xs font-medium text-muted-foreground">Data emiterii:</div>
                    <div className="text-gray-900 whitespace-nowrap">{formatDateSafe(lucrare.dataEmiterii)}</div>
                  </div>
                  <div className="flex flex-col min-w-[140px]">
                    <div className="text-sm md:text-xs font-medium text-muted-foreground">Data intervenție:</div>
                    <div className="text-gray-900 whitespace-nowrap">{formatDateSafe(lucrare.dataInterventie)}</div>
                  </div>
                  {lucrare.timpSosire && (
                    <div className="flex flex-col min-w-[160px]">
                      <div className="text-sm md:text-xs font-medium text-muted-foreground">Sosire la locație:</div>
                      <div className="text-gray-900 whitespace-nowrap">{formatDateSafe(lucrare.timpSosire || lucrare.dataSosire)} {lucrare.oraSosire}</div>
                    </div>
                  )}
                  {lucrare.timpPlecare && (
                    <div className="flex flex-col min-w-[160px]">
                      <div className="text-sm md:text-xs font-medium text-muted-foreground">Plecare de la locație:</div>
                      <div className="text-gray-900 whitespace-nowrap">{formatDateSafe(lucrare.timpPlecare || lucrare.dataPlecare)} {lucrare.oraPlecare}</div>
                    </div>
                  )}
                  {lucrare.timpSosire && lucrare.timpPlecare && (
                    <div className="flex flex-col min-w-[120px]">
                      <div className="text-sm md:text-xs font-medium text-muted-foreground">Durata intervenție:</div>
                      <div className="text-gray-900 whitespace-nowrap">{calculateInterventionDuration(lucrare)}</div>
                    </div>
                  )}
                </div>

                {isLucrareAnulata(lucrare) && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertTitle>Tichet anulat</AlertTitle>
                    <AlertDescription>
                      <div className="space-y-1">
                        <div><strong>Motiv:</strong> {(lucrare as any)?.motivAnulare || "N/A"}</div>
                        <div><strong>Anulat de:</strong> {(lucrare as any)?.anulatDe || "N/A"}</div>
                        <div>
                          <strong>Data:</strong>{" "}
                          {(() => {
                            try {
                              const at: any = (lucrare as any)?.anulatAt
                              const d = at?.toDate ? at.toDate() : new Date(at)
                              return isNaN(d?.getTime?.() ?? Number.NaN) ? "N/A" : formatUiDate(d)
                            } catch {
                              return "N/A"
                            }
                          })()}
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

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
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Echipamente în revizie</h3>
                    {revizieEquipmentIds.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-sm sm:text-base font-semibold px-3 py-1.5">
                          {revizieEquipmentIds.filter((eid: string) => (lucrare.revision?.equipmentStatus || {})[eid] === "done").length} / {revizieEquipmentIds.length} completate
                          </Badge>
                        </div>
                      )}
                    </div>
                    {role === "client" && (
                      <div className="mb-3">
                        <Alert className="bg-blue-50 border-blue-200">
                          <AlertCircle className="h-4 w-4 text-blue-500" />
                          <AlertTitle>Informație</AlertTitle>
                          <AlertDescription>
                            Revizia se desfășoară pentru fiecare echipament în parte. Ca utilizator client puteți descărca fișa de operațiuni doar pentru echipamentele finalizate.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}

                    {revizieEquipmentIds.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {revizieEquipmentIds.map((eid: string, index: number) => {
                          const status = (lucrare.revision?.equipmentStatus || {})[eid] || "pending"
                          const locatii = Array.isArray(clientData?.locatii) ? clientData.locatii : []
                          const workLocationId =
                            (lucrare as any)?.locationId ||
                            (lucrare as any)?.clientInfo?.locationId ||
                            (lucrare as any)?.clientInfo?.locatieId
                          const loc =
                            (workLocationId
                              ? locatii.find((l: any) => String(l?.id || "") === String(workLocationId))
                              : null) ||
                            locatii.find((l: any) => l?.nume === lucrare.locatie) ||
                            null
                          const eq =
                            loc?.echipamente?.find(
                              (e: any) => String(e?.id || "") === String(eid) || String(e?.cod || "") === String(eid),
                            ) || null
                          const revList = Array.isArray((lucrare as any)?.revision?.equipment)
                            ? ((lucrare as any).revision.equipment as any[])
                            : []
                          const revItem =
                            revList.find((r: any) => String(r?.equipmentId || "") === String(eid)) ||
                            revList.find((r: any) => String(r?.equipmentCode || "") === String(eid)) ||
                            null
                          const eqTimes = (lucrare as any)?.revisionEquipmentTimes || {}
                          const eqTime = eqTimes[eid]
                          const durationText = eqTime?.durationText || (eqTime?.durationMinutes != null
                            ? `${Math.floor((eqTime.durationMinutes || 0) / 60)}h ${(eqTime.durationMinutes || 0) % 60}m`
                            : undefined)
                          
                          // Debug logging (doar la cerere, ca să nu spamăm producția)
                          if (debugRevizie && index === 0) {
                            console.log("🔍 Debug Revizie QR:", { 
                              eid, 
                              hasEq: !!eq,
                              eq,
                              role, 
                              isDispatcherOrAdmin: role === "dispecer" || role === "admin",
                              shouldShowQR: (role === "dispecer" || role === "admin") && !!eq,
                              client: lucrare.client,
                              locatie: lucrare.locatie,
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
                                  <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-bold">
                                    {index + 1}
                                  </div>
                                  <Badge className={`${statusConfig.badgeClass} text-xs sm:text-sm font-semibold px-2 py-1`}>
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
                                      clientId={String((lucrare as any)?.clientId || "").trim() || undefined}
                                      locationId={String((lucrare as any)?.locationId || "").trim() || undefined}
                                      useSimpleFormat={true}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Informații echipament - stack vertical pentru mobile */}
                              <div className="p-4">
                                <h4 className="text-xl font-bold mb-2 text-gray-900 leading-tight">
                                  {eq?.nume || revItem?.equipmentName || "Echipament necunoscut"}
                                </h4>
                                
                                <div className="space-y-2 mb-4 text-base">
                                  {eq?.cod && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500 font-medium min-w-[70px]">Cod:</span>
                                      <span className="font-mono text-base bg-slate-100 px-2.5 py-1 rounded font-semibold text-slate-700">
                                        {eq.cod}
                                      </span>
                                    </div>
                                  )}
                                  {eq?.model && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500 font-medium min-w-[70px]">Model:</span>
                                      <span className="text-base text-gray-700">{eq.model}</span>
                                    </div>
                                  )}
                                  {eq?.producator && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500 font-medium min-w-[70px]">Brand:</span>
                                      <span className="text-base text-gray-700">{eq.producator}</span>
                                    </div>
                                  )}
                                  {durationText && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500 font-medium min-w-[70px]">Timp lucru:</span>
                                      <span className="text-base text-gray-800 font-semibold">
                                        {durationText}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Documentații pentru echipament (vizibile tehnicianului) */}
                                {role === "tehnician" && (
                                  <div className="mb-4 space-y-1">
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Documente</p>
                                    <EquipmentDocumentationList
                                      folderId={(eq as any)?.documentationFolderId}
                                      subfolderId={(eq as any)?.documentationSubfolderId}
                                        fileIds={(eq as any)?.documentationFileIds}
                                    />
                                  </div>
                                )}

                                {/* Buton mare pentru touch - ascuns pentru clienți */}
                                {role !== "client" && (
                                  <Button
                                    asChild
                                    className={`w-full h-12 text-base font-semibold rounded-lg ${statusConfig.buttonClass}`}
                                    size="lg"
                                  >
                                    <Link href={`/dashboard/lucrari/${lucrare.id}/revizie/${eid}`}>
                                      {statusConfig.buttonText}
                                    </Link>
                                  </Button>
                                )}
                                
                                {/* Descărcare fișa de operațiuni pentru acest echipament */}
                                {(role !== "client" || status === "done") && (
                                <div className="mt-2">
                                  <Button
                                    variant="outline"
                                    className="w-full h-10 text-sm font-medium rounded-lg"
                                    onClick={async () => {
                                      try {
                                        if (!lucrare?.id) return
                                        const headerOverride =
                                          (eq as any)?.dynamicSettings?.["revision.checklistParentName"] ||
                                          (eq as any)?.dynamicSettings?.["revision.templateName"] ||
                                          (eq as any)?.dynamicSettings?.["revision.checklistName"]
                                        const sheetNumberLabel = getRevisionSheetNumberLabel(String(eid))
                                        const blob = await generateRevisionEquipmentPDF(String(lucrare.id), String(eid), {
                                          headerLabelOverride: headerOverride,
                                          sheetNumberLabel,
                                        })
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        // Construim numele fișierului pe baza selecției (headerOverride) sau fallback
                                        const fileLabel = headerOverride || eq?.nume || eq?.name || eq?.model || eid || "Echipament"
                                        const safeLabel = String(fileLabel).replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_")
                                        const safeSheetNumber = sheetNumberLabel.replace(/[\\/:*?"<>|]+/g, "").trim()
                                        a.download = `Fisa_Operatiuni_${safeLabel}_${safeSheetNumber}.pdf`
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
                                )}
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
                                  if (revizieEquipmentIds.length === 0) return true
                                  const status = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                                  const completed = revizieEquipmentIds.filter((id) => status[id] === "done")
                                  // Generare raport disponibilă DOAR când toate echipamentele sunt finalizate
                                  return completed.length !== revizieEquipmentIds.length
                                })()
                              }
                              className="w-full h-14 text-base font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                              size="lg"
                            >
                              <FileText className="mr-2 h-5 w-5" />
                              Generează raport
                            </Button>
                            {/* Finalizare parțială – disponibilă dacă cel puțin un echipament este finalizat dar nu toate */}
                            {revizieEquipmentIds.length > 0 && (() => {
                              const st = (lucrare.revision?.equipmentStatus || {}) as Record<string, string>
                              const all = revizieEquipmentIds || []
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
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md my-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <RefreshCw className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-medium text-blue-800">Tichet reatribuit:</p>
                    </div>
                    <p className="text-sm text-blue-700">{lucrare.mesajReatribuire}</p>
                    {lucrare.lucrareOriginala && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-100"
                      >
                        <Link href={relatedTicketUrl(String(lucrare.lucrareOriginala))}>
                          Vizualizează lucrarea originală
                        </Link>
                      </Button>
                    )}
                  </div>
                )}

                {/* Afișăm istoricul de amânare dacă există datele de context */}
                {hasPostponeContext && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-md mb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Clock className="h-4 w-4 text-purple-600" />
                      <p className="text-sm font-medium text-purple-800">Istoric amânare</p>
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
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs px-2 py-1 h-7 text-orange-700 border-orange-300 hover:bg-orange-100"
                        >
                          <Link href={relatedTicketUrl(String(lucrare.lucrareOriginala))}>
                            <ChevronLeft className="h-3 w-3 mr-1" />
                            Vezi lucrarea inițială
                          </Link>
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
                        {lucrare.reinterventieMotiv.garantieInterventiei && (
                          <div className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 bg-emerald-600 rounded-full flex-shrink-0"></div>
                            <span className="text-emerald-700 font-medium">Garanția intervenției</span>
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
                                    {formatDateSafe(reinterventie.dataInterventie)}
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
                                    {reinterventie.reinterventieMotiv.necesitaPieseSuplimentare && "Piese suplimentare "}
                                    {reinterventie.reinterventieMotiv.garantieInterventiei && "Garanția intervenției"}
                                  </div>
                                )}
                          {reinterventie.defectReclamat && (
                            <div className="text-xs text-gray-700 mt-1">
                              Defect reclamat: <span className="font-medium">{reinterventie.defectReclamat}</span>
                            </div>
                          )}
                              </div>
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="text-xs px-2 py-1 h-7 text-blue-700 border-blue-300 hover:bg-blue-100"
                              >
                                <Link href={relatedTicketUrl(reinterventie.id)}>
                                  <ChevronLeft className="h-3 w-3 mr-1 rotate-180" />
                                  Vezi reintervenția
                                </Link>
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
                {(lucrare?.lastReportEmail || lucrare?.lastOfferEmail || (lucrare as any)?.lastDevizEmail) && (
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
                    {(lucrare as any)?.lastDevizEmail && (
                      <div className="text-sm flex flex-wrap gap-2 items-center mt-1">
                        <Badge variant="outline">Deviz</Badge>
                        <span>Status: {(lucrare as any).lastDevizEmail.status || '-'}</span>
                        {(lucrare as any).lastDevizEmail.sentAt && <span>• {String((lucrare as any).lastDevizEmail.sentAt)}</span>}
                        {Array.isArray((lucrare as any).lastDevizEmail.to) && (lucrare as any).lastDevizEmail.to.length > 0 && (
                          <span>• către {(lucrare as any).lastDevizEmail.to.join(', ')}</span>
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
                    <p className="text-base mb-1">{resolvedLocation?.nume || lucrare.locatie}</p>
                    {(() => {
                      const addr = String(resolvedLocation?.adresa || locationAddress || (lucrare as any)?.clientInfo?.locationAddress || "").trim()
                      if (!addr) return null
                      return (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                          <MapPin className="h-4 w-4" />
                          {addr}
                        </p>
                        <div className="flex gap-2">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Google Maps
                          </a>
                          <a
                            href={`https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            <MapPin className="h-3 w-3" />
                            Waze
                          </a>
                        </div>
                      </div>
                      )
                    })()}
                  </div>

                  {/* Persoană contact */}
                  <div>
                    <p className="text-base font-semibold mb-2">Persoană contact (locație):</p>
                    <p className="text-sm mb-2">{resolvedContact?.nume || lucrare.persoanaContact}</p>
                    {(() => {
                      const email = String(resolvedContact?.email || (lucrare as any)?.persoanaContactEmail || "").trim()
                      if (!email) return null
                      return (
                          <div className="text-sm mb-2">
                            <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all">{email}</span>
                              <a
                              href={`mailto:${email}`}
                                className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                              aria-label={`Scrie email către ${email}`}
                              title={`Scrie email către ${email}`}
                              >
                                <Mail className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                      )
                    })()}
                    <div className="text-sm flex items-center gap-2">
                      <span>{resolvedContact?.telefon || lucrare.telefon}</span>
                      <a
                        href={`tel:${formatPhoneForCall(resolvedContact?.telefon || lucrare.telefon)}`}
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                        aria-label={`Apelează ${resolvedContact?.nume || lucrare.persoanaContact}`}
                        title={`Apelează ${resolvedContact?.nume || lucrare.persoanaContact}`}
                      >
                        <Phone className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {/* Echipament */}
                  <div>
                    <p className="text-base font-semibold mb-2">Echipament:</p>
                    <p className="text-sm mb-2">
                      {(() => {
                        const eq = resolvedEquipment || equipmentData
                        const name = eq?.denumire || eq?.nume || eq?.name || lucrare.echipament
                        return name ? String(name) : "Nespecificat"
                      })()}
                    </p>
                    <div className="space-y-1">
                      {role !== "tehnician" && (resolvedEquipment?.cod || lucrare.echipamentCod) && (
                        <div className="text-sm flex items-center gap-2">
                          <span className="font-medium text-blue-600">Cod:</span>
                          <span className="text-blue-600">{resolvedEquipment?.cod || lucrare.echipamentCod}</span>
                          <Button
                            asChild
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Vezi istoric echipament"
                            title="Vezi istoric echipament"
                          >
                            <Link
                              href={`/dashboard/istoric-interventii/echipament?cod=${encodeURIComponent(String(resolvedEquipment?.cod || lucrare.echipamentCod))}`}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <EquipmentQRCode
                            equipment={{
                              id: String(resolvedEquipment?.id || (lucrare as any)?.echipamentId || (lucrare as any)?.echipamentCod || ""),
                              cod: String(resolvedEquipment?.cod || lucrare.echipamentCod || ""),
                              nume: String(
                                resolvedEquipment?.denumire ||
                                  resolvedEquipment?.nume ||
                                  resolvedEquipment?.name ||
                                  lucrare.echipament ||
                                  "Echipament necunoscut",
                              ),
                              model: String(resolvedEquipment?.model || (lucrare as any)?.echipamentModel || ""),
                              lastQrPrintedAt:
                                resolvedEquipment?.lastQrPrintedAt ||
                                (equipmentData as any)?.lastQrPrintedAt ||
                                undefined,
                              lastQrPrintedBy:
                                resolvedEquipment?.lastQrPrintedBy ||
                                (equipmentData as any)?.lastQrPrintedBy ||
                                undefined,
                              lastQrPrintedById:
                                resolvedEquipment?.lastQrPrintedById ||
                                (equipmentData as any)?.lastQrPrintedById ||
                                undefined,
                            }}
                            clientName={clientData?.nume || clientData?.name || lucrare.client}
                            locationName={resolvedLocation?.nume || lucrare.locatie}
                            clientId={String((lucrare as any)?.clientId || clientData?.id || "").trim() || undefined}
                            locationId={String((resolvedLocation as any)?.id || (lucrare as any)?.locationId || "").trim() || undefined}
                            showLabel={false}
                            useSimpleFormat={true}
                            className="h-7 w-7 p-0"
                          />
                        </div>
                      )}
                      {(resolvedEquipment?.model || (lucrare as any)?.echipamentModel) && (
                        <p className="text-sm">
                          <span className="font-medium text-blue-600">Model:</span>{" "}
                          <span className="text-blue-600">{resolvedEquipment?.model || (lucrare as any)?.echipamentModel}</span>
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
                  {role !== "client" && !(lucrare.raportGenerat && lucrare.numarRaport) && (lucrare.descriere || lucrare.notaInternaTehnician || isAdminOrDispatcher) && (
                    <div className="mt-4">
                      <p className="text-base font-semibold mb-2">Notă internă:</p>
                      <div className="space-y-1">
                        {(lucrare.descriere || isAdminOrDispatcher) && (
                          <div>
                            <span className="font-semibold text-base mr-2">Dispecer:</span>
                            {isAdminOrDispatcher ? (
                              <Textarea
                                value={lucrare.descriere || ""}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setLucrare((prev) => (prev ? { ...prev, descriere: value } : prev))
                                }}
                                onBlur={async () => {
                                  if (!lucrare?.id) return
                                  try {
                                    setIsUpdating(true)
                                    await updateLucrare(lucrare.id, { descriere: lucrare.descriere || "" })
                                    toast({ title: "Actualizat", description: "Nota internă a dispecerului a fost salvată." })
                                  } catch (error) {
                                    console.error("Eroare la salvarea notei interne a dispecerului:", error)
                                    toast({
                                      title: "Eroare",
                                      description: "Nu s-a putut salva nota internă a dispecerului.",
                                      variant: "destructive",
                                    })
                                  } finally {
                                    setIsUpdating(false)
                                  }
                                }}
                                className="min-h-[72px] text-sm mt-2"
                                disabled={isUpdating}
                                placeholder="Adăugați notă internă pentru acest tichet..."
                              />
                            ) : (
                              <span className="text-base text-gray-600">{lucrare.descriere}</span>
                            )}
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
                    {role !== "client" && (lucrare.descriere || lucrare.notaInternaTehnician || isAdminOrDispatcher) && (
                      <div className="mt-4">
                        <p className="text-base font-semibold mb-2">Notă internă:</p>
                        <div className="space-y-1">
                          {(lucrare.descriere || isAdminOrDispatcher) && (
                            <div>
                              <span className="font-semibold text-base mr-2">Dispecer:</span>
                              {isAdminOrDispatcher ? (
                                <Textarea
                                  value={lucrare.descriere || ""}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    setLucrare((prev) => (prev ? { ...prev, descriere: value } : prev))
                                  }}
                                  onBlur={async () => {
                                    if (!lucrare?.id) return
                                    try {
                                      setIsUpdating(true)
                                      await updateLucrare(lucrare.id, { descriere: lucrare.descriere || "" })
                                      toast({ title: "Actualizat", description: "Nota internă a dispecerului a fost salvată." })
                                    } catch (error) {
                                      console.error("Eroare la salvarea notei interne a dispecerului:", error)
                                      toast({
                                        title: "Eroare",
                                        description: "Nu s-a putut salva nota internă a dispecerului.",
                                        variant: "destructive",
                                      })
                                    } finally {
                                      setIsUpdating(false)
                                    }
                                  }}
                                  className="min-h-[72px] text-sm mt-2"
                                  disabled={isUpdating}
                                  placeholder="Adăugați notă internă pentru acest tichet..."
                                />
                              ) : (
                                <span className="text-base text-gray-600">{lucrare.descriere}</span>
                              )}
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
                    {((lucrare as any).tehnicianGarantieDecizie &&
                      isTehnicianGarantieDecizie(String((lucrare as any).tehnicianGarantieDecizie))) ||
                    lucrare.tehnicianConfirmaGarantie !== undefined ? (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md mb-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm text-yellow-800">
                            Confirmarea tehnicianului la fața locului:
                          </span>
                          {(lucrare as any).tehnicianGarantieDecizie &&
                          isTehnicianGarantieDecizie(String((lucrare as any).tehnicianGarantieDecizie)) ? (
                            <Badge
                              className={`rounded-md border ${tehnicianGarantieDecizieBadgeClassName(
                                (lucrare as any).tehnicianGarantieDecizie
                              )}`}
                            >
                              {
                                TEHNICIAN_GARANTIE_DECIZIE_LABELS[
                                  (lucrare as any).tehnicianGarantieDecizie
                                ]
                              }
                            </Badge>
                          ) : (
                            <Badge
                              className={
                                lucrare.tehnicianConfirmaGarantie
                                  ? "bg-green-100 text-green-800 border-green-200 rounded-md"
                                  : "bg-red-100 text-red-800 border-red-200 rounded-md"
                              }
                            >
                              {lucrare.tehnicianConfirmaGarantie
                                ? "✓ Confirmă garanția"
                                : "✗ Nu confirmă garanția"}
                            </Badge>
                          )}
                        </div>
                        {(lucrare as any).tehnicianGarantieDecizie === "nu_intra" &&
                        (lucrare as any).tehnicianGarantieNuIntraMotiv ? (
                          <p className="text-xs text-yellow-900 mt-2 whitespace-pre-wrap">
                            <span className="font-medium">Motiv: </span>
                            {(lucrare as any).tehnicianGarantieNuIntraMotiv}
                          </p>
                        ) : (
                          <p className="text-xs text-yellow-700 mt-1">
                            {(lucrare as any).tehnicianGarantieDecizie &&
                            isTehnicianGarantieDecizie(String((lucrare as any).tehnicianGarantieDecizie)) ? (
                              (lucrare as any).tehnicianGarantieDecizie === "confirma" ? (
                                <>Tehnicianul a confirmat că intervenția face obiectul garanției.</>
                              ) : (lucrare as any).tehnicianGarantieDecizie === "dupa_atelier" ? (
                                <>Se va stabili după constatarea în atelier.</>
                              ) : (lucrare as any).tehnicianGarantieDecizie === "nu_intra" ? (
                                <>Intervenția a fost considerată că nu face obiectul garanției.</>
                              ) : null
                            ) : (
                              <>
                                Tehnicianul a verificat fizic echipamentul și a{" "}
                                {lucrare.tehnicianConfirmaGarantie ? "confirmat" : "infirmat"} că este în
                                garanție.
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    ) : null}
                      </div>
                )}

                {/* Secțiunea de management a statusurilor a fost mutată în cardul "Informații client" pentru un layout mai clar */}

                {/* Eliminat: Documente PDF integrate în acest card. Mutat într-un card separat, mai jos. */}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-transparent md:border md:bg-card md:shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>Informații client</CardTitle>
                    <CardDescription className="text-base font-semibold text-gray-600">
                      {clientData?.nume || clientData?.name || lucrare.client}
                    </CardDescription>
                  </div>
                  {(lucrare as any)?.clientId || clientData?.id ? (
                    <Link href={`/dashboard/clienti/${(lucrare as any)?.clientId ?? clientData?.id}`}>
                      <Button variant="outline" size="sm" className="whitespace-nowrap">
                        Vezi detalii client
                      </Button>
                    </Link>
                  ) : null}
                </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 w-full">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Emitent:</span>
          <span className="mt-0.5">
            <Badge variant="outline" className="rounded-md">
              {getTicketEmitent(lucrare)}
            </Badge>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Tichet:</span>
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
                    description: `Statusul tichetului a fost schimbat în "${newStatus}"` 
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
                    description: "Nu s-a putut actualiza statusul tichetului", 
                    variant: "destructive" 
                  })
                } finally {
                  setIsUpdating(false)
                }
              }}
              disabled={isUpdating || isCanceled}
            >
              <SelectTrigger className="w-[180px] mt-0.5">
                <SelectValue placeholder="Selectează status" />
              </SelectTrigger>
              <SelectContent>
                {WORK_STATUS_OPTIONS.filter((status) => status !== WORK_STATUS.CANCELED).map((status) => (
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
                {/* Setări ofertă – ascunse integral dacă lucrarea este arhivată sau anulată */}
                {(role === "admin" || role === "dispecer") && lucrare.statusLucrare !== "Arhivată" && !isCanceled && (
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

                    {(!lucrare.preluatDispecer || lucrare.statusLucrare === "Arhivată" || isCanceled) && (
                      <div className="flex items-start gap-3 text-sm bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 shadow-sm mb-4">
                        <div className="flex-shrink-0">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-amber-900">Editor indisponibil</p>
                          <p className="text-amber-700 mt-1">
                            {lucrare.statusLucrare === "Arhivată"
                              ? "Lucrarea este arhivată. Editorul de ofertă nu este disponibil."
                              : isCanceled
                                ? "Lucrarea este anulată. Editorul de ofertă nu este disponibil."
                              : "Lucrarea trebuie preluată de dispecer/admin pentru a edita oferta."}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Flex cu coloane compacte: Necesită ofertă și editor ofertă */}
                      <div className="flex flex-wrap gap-8">
                        {/* Necesită ofertă - switch dedesubt */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor="necesitaOfertaSwitch"
                              className={`text-sm font-medium ${(!lucrare.preluatDispecer && !isAdminOrDispatcher) ? 'text-gray-500' : 'text-blue-800'}`}
                            >
                              Necesită ofertă
                            </Label>
                            {(() => {
                              const offerSendCount = Number((lucrare as any)?.offerSendCount || 0)
                              const offerAlreadySent = offerSendCount > 0
                              const msg = offerAlreadySent
                                ? `Nu se poate dezactiva: oferta a fost transmisă pe email (${offerSendCount}).`
                                : "Activează/dezactivează necesitatea unei oferte pentru această lucrare."
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label="Info necesită ofertă"
                                    >
                                      i
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {msg}
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })()}
                          </div>
                          <div>
                            {(() => {
                              const offerSendCount = Number((lucrare as any)?.offerSendCount || 0)
                              const offerAlreadySent = offerSendCount > 0
                              const lockDisable = offerAlreadySent && Boolean(lucrare.necesitaOferta)
                              return (
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
                                        offerSendCount,
                                      })
                                    } catch (e) {
                                      // ignore
                                    }
                                    if (!checked && offerAlreadySent) {
                                      toast({
                                        title: "Dezactivare blocată",
                                        description: `Oferta a fost deja transmisă pe email (${offerSendCount}). Nu se poate dezactiva.`,
                                        variant: "destructive",
                                      })
                                      return
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
                                  disabled={isUpdating || lockDisable}
                                  className={`${!isAdminOrDispatcher && !lucrare.preluatDispecer ? 'opacity-50' : ''}${lockDisable ? ' opacity-50 cursor-not-allowed' : ''}`}
                                />
                              )
                            })()}
                          </div>
                        </div>

                        {/* Editor ofertă - buton dedesubt */}
                        <div className="space-y-2">
                          <Label className={`text-sm font-medium ${!lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată' || isCanceled ? 'text-gray-500' : 'text-blue-800'}`}>Editor ofertă</Label>
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (lucrare.statusLucrare === "Arhivată" || isCanceled) {
                                  toast({
                                    title: 'Editor indisponibil',
                                    description: isCanceled
                                      ? 'Editorul de ofertă nu este disponibil pentru tichete anulate.'
                                      : 'Editorul de ofertă nu este disponibil pentru tichete arhivate.',
                                    variant: 'destructive',
                                  })
                                  return
                                }
                                if (!lucrare.preluatDispecer) {
                                  toast({ title: 'Editor indisponibil', description: 'Lucrarea trebuie preluată de dispecer/admin înainte de editarea ofertei.', variant: 'destructive' })
                                  return
                                }
                                setIsOfferEditorOpen(true)
                              }}
                              disabled={isUpdating || !lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată' || isCanceled}
                              className={!lucrare.preluatDispecer || !lucrare.necesitaOferta || lucrare.statusLucrare === 'Arhivată' || isCanceled ? 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-100 hover:text-gray-500 cursor-not-allowed' : ''}
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
                            placeholder={!lucrare.preluatDispecer ? "Indisponibil până la preluarea tichetului..." : "Detalii relevante pentru ofertă..."}
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
                          {(() => {
                            const verifiedBy =
                              (lucrare as any)?.offerResponse?.verifiedEmail ||
                              (lucrare as any)?.offerActionVerification?.email
                            return verifiedBy ? (
                              <div className="text-sm text-gray-700">Confirmată de către: {verifiedBy}</div>
                            ) : null
                          })()}
                          {lucrare.offerResponse.at && (
                            <div className="text-xs text-gray-500 mt-1">
                              {(() => {
                                try {
                                  const at: any = (lucrare as any).offerResponse?.at
                                  const d = at?.toDate ? at.toDate() : new Date(at)
                                  return isNaN(d?.getTime?.() ?? Number.NaN) ? '-' : formatUiDate(d)
                                } catch {
                                  return '-'
                                }
                              })()}
                            </div>
                          )}
                          {(lucrare as any)?.acceptedOfferSnapshot && lucrare.statusLucrare !== 'Arhivată' && !isCanceled && (
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
                          {(lucrare as any)?.responseCertifiedPdf?.storagePath ? (
                            <div className="mt-2">
                              <Button asChild variant="outline" size="sm">
                                <a
                                  href={`/api/lucrari/${encodeURIComponent(lucrare.id!)}/offer-certified-pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileCheck2 className="mr-1.5 h-4 w-4" />
                                  PDF dovadă
                                </a>
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(role === "admin" || role === "dispecer") && lucrare.statusLucrare !== "Arhivată" && !isCanceled && (
                  <div className="p-4 border rounded-md bg-slate-50 border-slate-200 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-600 flex items-center justify-center">
                          <span className="text-white text-sm font-bold">D</span>
                        </div>
                        <h4 className="text-base font-semibold text-slate-900">Deviz</h4>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className={`text-sm font-medium ${!lucrare.preluatDispecer || lucrare.statusLucrare === 'Arhivată' || isCanceled ? 'text-gray-500' : 'text-slate-800'}`}>Editor deviz</Label>
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (lucrare.statusLucrare === "Arhivată" || isCanceled) {
                              toast({
                                title: "Editor indisponibil",
                                description: isCanceled
                                  ? "Editorul de deviz nu este disponibil pentru tichete anulate."
                                  : "Editorul de deviz nu este disponibil pentru tichete arhivate.",
                                variant: "destructive",
                              })
                              return
                            }
                            if (!lucrare.preluatDispecer) {
                              toast({
                                title: "Editor indisponibil",
                                description: "Lucrarea trebuie preluată de dispecer/admin înainte de editarea devizului.",
                                variant: "destructive",
                              })
                              return
                            }
                            setIsDevizEditorOpen(true)
                          }}
                          disabled={isUpdating || !lucrare.preluatDispecer || lucrare.statusLucrare === 'Arhivată' || isCanceled}
                          className={!lucrare.preluatDispecer || lucrare.statusLucrare === 'Arhivată' || isCanceled ? 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-100 hover:text-gray-500 cursor-not-allowed' : ''}
                        >
                          Deschide deviz
                        </Button>
                      </div>

                      {(Array.isArray((lucrare as any)?.devizProducts) && (lucrare as any)?.devizProducts.length > 0) ||
                      (lucrare as any)?.devizDocument?.url ? (
                        <div>
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-slate-700 text-white hover:bg-slate-800"
                            onClick={() => {
                              void openDevizPdf()
                            }}
                          >
                            Vizualizează deviz (PDF)
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                {role !== "client" && hasOfferHistory && lucrare.id && (
                  <OfferEvidencePanel mode="lucrari" entityId={lucrare.id} className="mb-4" />
                )}
                {role !== "client" && hasOfferHistory && (
                  <div className="p-3 border rounded-md bg-white mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold">Istoric ofertare</p>
                      <Badge variant="outline" className="rounded-md">
                        Read-only
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3 text-xs">
                      <Badge variant="secondary" className="rounded-md">
                        Trimiteri: {Number((lucrare as any)?.offerSendCount || 0)}
                      </Badge>
                      {latestOfferResponse?.status && (
                        <Badge
                          className={
                            latestOfferResponse.status === "accept"
                              ? "bg-green-100 text-green-800 border-green-200 rounded-md"
                              : "bg-red-100 text-red-800 border-red-200 rounded-md"
                          }
                        >
                          {latestOfferResponse.status === "accept" ? "Ultimul răspuns: Acceptată" : "Ultimul răspuns: Respinsă"}
                        </Badge>
                      )}
                    </div>

                    {offerVersionsHistory.length > 0 ? (
                      <div className="rounded border divide-y">
                        {offerVersionsHistory.map((version, index) => {
                          const savedAtStr = String(version?.savedAt || "")
                          const versionResponses = resolvedOfferResponses.filter(
                            (row) => String(row.resolvedVersionSavedAt || "") === savedAtStr
                          )
                          const versionProducts = Array.isArray(version?.products) ? (version.products as Array<any>) : []
                          return (
                            <div key={`${savedAtStr || "no-date"}-${index}`} className="p-2 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{formatOfferHistoryDate(version?.savedAt)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {version?.savedBy || "Necunoscut"} • Total: {Number(version?.total || 0).toFixed(2)} lei
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    setOfferHistoryDialogVersion({
                                      savedAt: savedAtStr,
                                      savedBy: String(version?.savedBy || "Necunoscut"),
                                      total: Number(version?.total || 0),
                                      products: versionProducts,
                                      responses: versionResponses.map((response) => ({
                                        status: response.status,
                                        at: response.at,
                                        reason: response.reason || undefined,
                                        verifiedEmail: response.verifiedEmail || undefined,
                                      })),
                                    })
                                  }
                                >
                                  Detalii
                                </Button>
                              </div>
                              {versionResponses.length > 0 ? (
                                <div className="mt-1 space-y-1">
                                  {versionResponses.map((response, responseIndex) => (
                                    <div key={`${savedAtStr}-resp-${responseIndex}`} className="text-xs">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          className={
                                            response.status === "accept"
                                              ? "bg-green-100 text-green-800 border-green-200 rounded-md"
                                              : "bg-red-100 text-red-800 border-red-200 rounded-md"
                                          }
                                        >
                                          {response.status === "accept" ? "Acceptată" : "Respinsă"}
                                        </Badge>
                                        <span className="text-muted-foreground">{formatOfferHistoryDate(response.at)}</span>
                                        {response.verifiedEmail ? (
                                          <span className="text-muted-foreground">• {response.verifiedEmail}</span>
                                        ) : null}
                                      </div>
                                      {response.status === "reject" && response.reason ? (
                                        <p className="mt-0.5 text-red-800">Mesaj client: {response.reason}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">Fără răspuns client pentru această versiune.</p>
                              )}
                              <details className="mt-2 rounded border border-neutral-200 bg-neutral-50/60 p-2">
                                <summary className="cursor-pointer text-xs font-medium text-neutral-700">
                                  Linii ofertate: {versionProducts.length}
                                </summary>
                                {versionProducts.length > 0 ? (
                                  <div className="mt-2 overflow-x-auto rounded border bg-white">
                                    <table className="w-full min-w-[420px] text-xs">
                                      <thead className="bg-neutral-100 text-neutral-600">
                                        <tr>
                                          <th className="px-2 py-1 text-left font-medium">#</th>
                                          <th className="px-2 py-1 text-left font-medium">Denumire</th>
                                          <th className="px-2 py-1 text-center font-medium">UM</th>
                                          <th className="px-2 py-1 text-right font-medium">Cant.</th>
                                          <th className="px-2 py-1 text-right font-medium">PU</th>
                                          <th className="px-2 py-1 text-right font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {versionProducts.map((product, productIndex) => (
                                          <tr key={`${savedAtStr}-product-${productIndex}`} className="border-t border-neutral-100">
                                            <td className="px-2 py-1.5 text-neutral-500">{productIndex + 1}</td>
                                            <td className="px-2 py-1.5 text-neutral-800">{String(product?.name || "-")}</td>
                                            <td className="px-2 py-1.5 text-center text-neutral-600">{String(product?.um || "-")}</td>
                                            <td className="px-2 py-1.5 text-right text-neutral-700">{Number(product?.quantity || 0).toLocaleString("ro-RO")}</td>
                                            <td className="px-2 py-1.5 text-right text-neutral-700">{Number(product?.price || 0).toFixed(2)}</td>
                                            <td className="px-2 py-1.5 text-right font-medium text-neutral-900">{Number(product?.total || 0).toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-neutral-500">Nu există linii salvate pentru această versiune.</p>
                                )}
                              </details>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nu există versiuni salvate în istoric.</p>
                    )}

                    {unmappedOfferResponses.length > 0 && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                        <p className="text-xs font-medium text-amber-900">Răspunsuri fără versiune mapată</p>
                        <div className="mt-1 space-y-1">
                          {unmappedOfferResponses.map((response, responseIndex) => (
                            <div key={`unmapped-response-${responseIndex}`} className="text-xs text-amber-900">
                              <span className="font-medium">{response.status === "accept" ? "Acceptată" : "Respinsă"}</span>
                              <span> • {formatOfferHistoryDate(response.at)}</span>
                              {response.reason ? <span> • Mesaj: {response.reason}</span> : null}
                              {response.verifiedEmail ? <span> • {response.verifiedEmail}</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Dialog open={!!offerHistoryDialogVersion} onOpenChange={(open) => !open && setOfferHistoryDialogVersion(null)}>
                  <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Detalii versiune ofertă (read-only)</DialogTitle>
                    </DialogHeader>
                    {offerHistoryDialogVersion ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Salvată la</p>
                            <p className="font-medium">{formatOfferHistoryDate(offerHistoryDialogVersion.savedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Salvată de</p>
                            <p className="font-medium">{offerHistoryDialogVersion.savedBy}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total ofertă</p>
                            <p className="font-medium">{offerHistoryDialogVersion.total.toFixed(2)} lei</p>
                          </div>
                        </div>

                        <div className="rounded border p-3">
                          <p className="mb-2 text-sm font-medium">Răspuns client</p>
                          {offerHistoryDialogVersion.responses.length > 0 ? (
                            <div className="space-y-2">
                              {offerHistoryDialogVersion.responses.map((response, responseIndex) => (
                                <div key={`dialog-offer-response-${responseIndex}`} className="text-sm">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={response.status === "accept" ? "bg-green-100 text-green-800 border-green-200 rounded-md" : "bg-red-100 text-red-800 border-red-200 rounded-md"}>
                                      {response.status === "accept" ? "Acceptată" : "Respinsă"}
                                    </Badge>
                                    <span className="text-muted-foreground">{formatOfferHistoryDate(response.at)}</span>
                                    {response.verifiedEmail ? <span className="text-muted-foreground">• {response.verifiedEmail}</span> : null}
                                  </div>
                                  {response.status === "reject" && response.reason ? (
                                    <p className="mt-1 text-red-800">Mesaj client: {response.reason}</p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Fără răspuns client pentru această versiune.</p>
                          )}
                        </div>

                        <div className="rounded border p-3">
                          <p className="mb-2 text-sm font-medium">
                            Linii ofertate ({offerHistoryDialogVersion.products.length})
                          </p>
                          {offerHistoryDialogVersion.products.length > 0 ? (
                            <div className="overflow-x-auto rounded border">
                              <table className="w-full min-w-[560px] text-sm">
                                <thead className="bg-muted">
                                  <tr>
                                    <th className="px-3 py-2 text-left">#</th>
                                    <th className="px-3 py-2 text-left">Denumire</th>
                                    <th className="px-3 py-2 text-center">UM</th>
                                    <th className="px-3 py-2 text-right">Cantitate</th>
                                    <th className="px-3 py-2 text-right">PU (lei)</th>
                                    <th className="px-3 py-2 text-right">Total (lei)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {offerHistoryDialogVersion.products.map((product, productIndex) => (
                                    <tr key={`dialog-offer-product-${productIndex}`} className="border-t">
                                      <td className="px-3 py-2 text-muted-foreground">{productIndex + 1}</td>
                                      <td className="px-3 py-2">{String(product?.name || "-")}</td>
                                      <td className="px-3 py-2 text-center">{String(product?.um || "-")}</td>
                                      <td className="px-3 py-2 text-right">{Number(product?.quantity || 0).toLocaleString("ro-RO")}</td>
                                      <td className="px-3 py-2 text-right">{Number(product?.price || 0).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-medium">{Number(product?.total || 0).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Nu există linii salvate pentru această versiune.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOfferHistoryDialogVersion(null)}>
                        Închide
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

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
                {lucrare && role !== "tehnician" && lucrare.preluatDispecer && lucrare.statusLucrare !== 'Arhivată' && !isCanceled && (
                  <OfferEditorDialog
                    lucrareId={lucrare.id!}
                    open={isOfferEditorOpen}
                    onOpenChange={setIsOfferEditorOpen}
                    initialProducts={(lucrare as any).products || []}
                    presetLocationLabel={`${lucrare.locatie || (lucrare as any)?.clientInfo?.locationName || ''}${(lucrare as any)?.clientInfo?.locationAddress ? ` — ${(lucrare as any).clientInfo.locationAddress}` : ''}`}
                  />
                )}

                {lucrare && role !== "tehnician" && lucrare.preluatDispecer && lucrare.statusLucrare !== 'Arhivată' && !isCanceled && (
                  <DevizEditorDialog
                    lucrareId={lucrare.id!}
                    open={isDevizEditorOpen}
                    onOpenChange={(nextOpen) => {
                      setIsDevizEditorOpen(nextOpen)
                      if (!nextOpen) {
                        void refreshLucrare({ showToast: false })
                      }
                    }}
                    initialProducts={Array.isArray((lucrare as any).devizProducts) ? (lucrare as any).devizProducts : []}
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

                {/* Documente PDF – admin/dispecer sau client */}
                  <div className="mt-4">
                    <div className="mt-2 p-3">
                    {isAdminOrDispatcher ? (
                      <>
                        <div className="text-sm text-muted-foreground mb-2">
                          Facturare: Încărcați factura sau marcați „Nu se facturează” și adăugați motivul.
                        </div>
                        <DocumentUpload
                          lucrareId={lucrare.id!}
                          lucrare={lucrare}
                          onLucrareUpdate={setLucrare}
                          hideOfertaUpload
                        />
                      </>
                    ) : role === "client" ? (
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                          {lucrare?.raportGenerat ? (
                            <Button onClick={handleClientDownloadReport} className="w-full sm:w-auto">
                              <FileText className="mr-2 h-4 w-4" /> Descarcă raport
                            </Button>
                          ) : null}
                          {(lucrare as any)?.facturaDocument?.url ? (
                            <Button
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={() => {
                                const u = (lucrare as any).facturaDocument.url
                                const link = `/api/download?lucrareId=${encodeURIComponent(lucrare.id!)}&type=factura&url=${encodeURIComponent(u)}`
                                window.open(link, "_blank")
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" /> Descarcă factura
                            </Button>
                          ) : null}
                        </div>

                        {!lucrare?.raportGenerat ? (
                          <p className="text-sm text-muted-foreground">Raportul nu este încă disponibil.</p>
                        ) : null}

                        {!(lucrare as any)?.facturaDocument?.url && (lucrare as any)?.statusFacturare === "Nu se facturează" ? (
                          <p className="text-sm text-muted-foreground">
                            Nu se facturează{(lucrare as any)?.motivNefacturare ? `: ${(lucrare as any).motivNefacturare}` : "."}
                          </p>
                        ) : null}

                        {lucrare?.tipLucrare === "Revizie" && revizieEquipmentIds.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Fișe de operațiuni (echipamente finalizate)</p>
                            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {revizieEquipmentIds
                                .filter((eid: string) => (lucrare.revision?.equipmentStatus || {})[eid] === "done")
                                .map((eid: string) => {
                                  const loc = clientData?.locatii?.find((l: any) => l.nume === lucrare.locatie)
                                  const eq = loc?.echipamente?.find((e: any) => e.id === eid)
                                  const label = eq?.nume || eq?.name || eq?.model || eid
                                  return (
                                    <Button
                                      key={eid}
                                      variant="outline"
                                      className="justify-start"
                                      onClick={() => {
                                        const headerOverride =
                                          (eq as any)?.dynamicSettings?.["revision.checklistParentName"] ||
                                          (eq as any)?.dynamicSettings?.["revision.templateName"] ||
                                          (eq as any)?.dynamicSettings?.["revision.checklistName"]
                                        handleClientDownloadEquipmentSheet(eid, label, headerOverride)
                                      }}
                                    >
                                      <Download className="mr-2 h-4 w-4" />
                                      {label}
                                    </Button>
                                  )
                                })}
                              {revizieEquipmentIds.filter((eid: string) => (lucrare.revision?.equipmentStatus || {})[eid] === "done").length === 0 && (
                                <p className="text-sm text-muted-foreground sm:col-span-2 md:col-span-3">
                                  Nicio fișă disponibilă încă. Echipamentele trebuie finalizate.
                                </p>
                              )}
                    </div>
                  </div>
                )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">    
             
              </CardFooter>
            </Card>

          </div>
        </TabsContent>

        {role === "tehnician" && isAssignedTehnician && lucrare.statusLucrare !== WORK_STATUS.POSTPONED && (
          <TabsContent value="interventie" className="mt-4">
            {lucrare.statusLucrare === WORK_STATUS.NO_SIGNATURE && (
              <div className="mb-3 flex items-center gap-2">
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">Fără semnătură</Badge>
                <span className="text-xs text-muted-foreground">
                  Intervenția este salvată fără raport. Poți reveni pentru semnare și generare raport.
                </span>
              </div>
            )}
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
                    <AlertTitle>Tichet încheiată</AlertTitle>
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
                  cauzaPrincipalaDefectId: (lucrare as any).cauzaPrincipalaDefectId,
                  cauzaPrincipalaDefect: (lucrare as any).cauzaPrincipalaDefect,
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
                  tehnicianGarantieDecizie: lucrare.tehnicianGarantieDecizie,
                  tehnicianGarantieNuIntraMotiv: lucrare.tehnicianGarantieNuIntraMotiv,
                  // Adăugăm imaginile defectelor
                  imaginiDefecte: lucrare.imaginiDefecte,
                  // Notă internă tehnician
                  notaInternaTehnician: lucrare.notaInternaTehnician
                }}
                // onUpdate primește `preserveActiveTab`; aici vrem toast (e o acțiune explicită de salvare)
                onUpdate={(preserveActiveTab) => refreshLucrare({ preserveActiveTab, showToast: true })}
                isCompleted={lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true}
              />
            )}
          </TabsContent>
        )}

        {role === "tehnician" && isAssignedTehnician && (
          <TabsContent value="verificare" className="mt-4">
            <Card className="border-0 shadow-none bg-transparent md:border md:bg-card md:shadow-sm">
              <CardHeader>
                <div>
                  <CardTitle className="text-xl md:text-2xl">Verificare Echipament</CardTitle>
                  <CardDescription className="text-base md:text-sm">
                    {otherActiveWork
                      ? "Ai deja o tichet în lucru. Finalizează sau închide lucrarea deschisă înainte de a începe alta."
                      : "Scanați QR code-ul echipamentului pentru a verifica dacă corespunde cu lucrarea."}
                  </CardDescription>
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
                      <Button asChild>
                        <Link href={relatedTicketUrl(otherActiveWork.id)}>
                          Deschide lucrarea în lucru
                        </Link>
                      </Button>
                      {checkingOtherActive && (
                        <span className="text-xs text-gray-500">Se verifică starea lucrărilor...</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                      <p className="mb-4 text-center text-base md:text-sm">
                        Scanați QR code-ul echipamentului pentru a verifica dacă este cel corect pentru această lucrare.
                      </p>
                      <QRCodeScanner
                        expectedEquipmentCode={resolvedEquipment?.cod || lucrare.echipamentCod}
                        expectedLocationName={resolvedLocation?.nume || lucrare.locatie}
                        expectedClientName={clientData?.nume || clientData?.name || lucrare.client}
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

                {lucrare.statusLucrare !== "Amânată" && lucrare.statusLucrare !== "Finalizat" && (
                  <div className="mt-6 flex flex-col items-stretch border-t pt-4">
                    <PostponeWorkDialog
                      lucrareId={lucrare.id!}
                      onSuccess={() => {
                        toast({
                          title: "Tichet amânată",
                          description: "Vei fi redirecționat către lista de tichete.",
                        })
                        setTimeout(() => {
                          router.push("/dashboard/lucrari")
                        }, 2000)
                      }}
                      className="w-full sm:self-end"
                    />
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
                    const email =
                      String(resolvedContact?.email || "").trim() ||
                      String(resolvedLocation?.email || "").trim() ||
                      ""
                    return email ? email : undefined
                  } catch { return undefined }
                })()}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dev-only debug panel: work doc dump + computed flags */}
      <DevDebugPanel lucrare={lucrare} />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Tichet</DialogTitle>
          </DialogHeader>
          <LucrareForm
            isEdit={true}
            dataEmiterii={editDataEmiterii}
            setDataEmiterii={setEditDataEmiterii}
            dataInterventie={editDataInterventie}
            setDataInterventie={setEditDataInterventie}
            formData={editFormData as any}
            handleInputChange={handleEditInputChange}
            handleSelectChange={handleEditSelectChange}
            handleTehnicieniChange={handleEditTehnicieniChange}
            fieldErrors={editFieldErrors}
            onCancel={() => setIsEditDialogOpen(false)}
            handleCustomChange={handleEditCustomChange}
            initialData={lucrare as any}
          />
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Anulează
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleUpdateFromDetail} disabled={isEditSubmitting}>
              {isEditSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Actualizează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardShell>

    {/* Dialog pentru selectarea motivelor reintervenției */}
    <ReinterventionReasonDialog
      isOpen={isReinterventionReasonDialogOpen}
      onClose={() => setIsReinterventionReasonDialogOpen(false)}
      lucrareId={paramsId}
      interventionDate={lucrare?.dataInterventie}
      onSuccess={handleReinterventionAfterReasons}
    />
    <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anulează tichetul</AlertDialogTitle>
          <AlertDialogDescription>
            Introduceți motivul anulării. Această acțiune marchează tichetul ca „Anulat”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancelReason">Motiv anulare</Label>
          <Textarea
            id="cancelReason"
            placeholder="Ex.: Beneficiarul a anulat solicitarea..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={4}
            disabled={isCancelling}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>Renunță</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancelWorkOrder}
            className="bg-red-600 hover:bg-red-700"
            disabled={isCancelling || !cancelReason.trim()}
          >
            {isCancelling ? "Se anulează..." : "Anulează"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  )
}
