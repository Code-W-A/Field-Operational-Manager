"use client"

import type React from "react"
import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Plus, Trash2, MapPin, Wrench, AlertTriangle, FileText, Check, ChevronsUpDown, Folder, ChevronRight, ImagePlus, X } from "lucide-react"
import { addClient, updateClient, type Client, type PersoanaContact, type Locatie, type Echipament, isEchipamentCodeUnique } from "@/lib/firebase/firestore"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
// Adăugăm importul pentru componenta EquipmentQRCode
import { EquipmentQRCode } from "@/components/equipment-qr-code"
import {
  subscribeDocumentatiiFiles,
  subscribeDocumentatiiFolders,
  subscribeDocumentatiiSubfolders,
  type DocumentatiiFile,
  type DocumentatiiFolder,
  type DocumentatiiSubfolder,
} from "@/lib/firebase/documentatii"
import { formatDate, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { CustomDatePicker } from "@/components/custom-date-picker"
// Import the useUnsavedChanges hook and UnsavedChangesDialog component
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
// Import AlertDialog components
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
// Import pentru verificarea CUI
import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { toast } from "@/hooks/use-toast"
import { DynamicDialogFields } from "@/components/DynamicDialogFields"
import { subscribeRevisionChecklistTemplates, subscribeToSettings } from "@/lib/firebase/settings"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/AuthContext"
import { v4 as uuidv4 } from "uuid"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { getClientLevelContactsFromRecord } from "@/lib/client-contacts"

interface ClientFormProps {
  mode?: "add" | "edit"
  client?: Client
  onSuccess?: (clientName?: string) => void
  onCreatedClient?: (client: { clientId: string; clientName: string }) => void
  onCancel?: () => void
  initialEquipmentSelection?: {
    locationIndex?: number
    equipmentId?: string
    equipmentCode?: string
    equipmentIndex?: number
  }
}

const REVISION_CHECKLIST_PARENT_ERROR = "revision.checklistParentId"

// Funcție pentru verificarea CUI-ului
const checkCuiExists = async (cui: string): Promise<boolean> => {
  if (!cui || cui.trim() === "") return false

  try {
    const q = query(collection(db, "clienti"), where("cif", "==", cui.trim()))
    const querySnapshot = await getDocs(q)
    return !querySnapshot.empty
  } catch (error) {
    console.error("Eroare la verificarea CUI:", error)
    return false
  }
}

const createEmptyContact = (): PersoanaContact => ({ nume: "", telefon: "", email: "", functie: "" })

const createEmptyLocation = (): Locatie => ({
  nume: "",
  adresa: "",
  persoaneContact: [createEmptyContact()],
  echipamente: [],
})

const hasAnyContactContent = (contact: Partial<PersoanaContact> | null | undefined) =>
  Boolean(contact?.nume || contact?.telefon || contact?.email || contact?.functie)

const hasAnyLocationContent = (locatie: Partial<Locatie> | null | undefined) =>
  Boolean(
    locatie?.nume ||
      locatie?.adresa ||
      (Array.isArray(locatie?.echipamente) && locatie.echipamente.length > 0) ||
      (Array.isArray(locatie?.persoaneContact) && locatie.persoaneContact.some((contact) => hasAnyContactContent(contact))),
  )

const getInitialClientContacts = (mode: "add" | "edit", client?: Client) => {
  if (mode === "edit" && client) {
    const resolved = getClientLevelContactsFromRecord(String(client.id || ""), client as Record<string, unknown>)
    if (resolved.length > 0) {
      return resolved.map((contact) => ({
        id: contact.id,
        nume: contact.nume || "",
        telefon: contact.telefon || "",
        email: contact.email || "",
        functie: contact.functie || "",
      }))
    }
  }

  return [createEmptyContact()]
}

const getInitialLocatii = (mode: "add" | "edit", client?: Client) => {
  if (mode === "edit" && client && client.locatii && client.locatii.length > 0) {
    return client.locatii.map((loc) => ({
      ...loc,
      echipamente: loc.echipamente || [],
    }))
  }

  return mode === "add" ? [] : [createEmptyLocation()]
}

// Modify the component definition to use forwardRef
const ClientForm = forwardRef(({ mode = "add", client, onSuccess, onCreatedClient, onCancel, initialEquipmentSelection }: ClientFormProps, ref) => {
  const { userData } = useAuth()
  const isAdmin = userData?.role === "admin"
  
  // Add state to track if form has been modified
  const [formModified, setFormModified] = useState(false)
  
  // Initialize form data based on mode
  const [formData, setFormData] = useState({
    nume: mode === "edit" && client ? client.nume || "" : "",
    cif: mode === "edit" && client ? ((client as any).cif || client.cui || "") : "",
    regCom: mode === "edit" && client ? ((client as any).regCom || "") : "",
    adresa: mode === "edit" && client ? (client.adresa || "") : "",
    email: mode === "edit" && client ? (client.email || "") : "",
    telefon: mode === "edit" && client ? (client.telefon || "") : "",
    reprezentantFirma: mode === "edit" && client ? (client.reprezentantFirma || "") : "",
    functieReprezentant: mode === "edit" && client ? ((client as any).functieReprezentant || "") : "",
  })

  const [clientContacts, setClientContacts] = useState<PersoanaContact[]>(() => getInitialClientContacts(mode, client))

  // Add state for close alert dialog - IMPORTANT: default to true for testing
  const [showCloseAlert, setShowCloseAlert] = useState(false)

  // Adăugăm state pentru verificarea CUI
  const [isCuiChecking, setIsCuiChecking] = useState(false)
  const [cuiExists, setCuiExists] = useState(false)
  const [cuiTouched, setCuiTouched] = useState(false)
  const cuiTimeoutRef = useRef<NodeJS.Timeout | null>(null)



  // Adăugăm state pentru locații
  const [locatii, setLocatii] = useState<Locatie[]>(() => getInitialLocatii(mode, client))
  const [initialFormState, setInitialFormState] = useState({
    formData: { ...formData },
    clientContacts: JSON.stringify(getInitialClientContacts(mode, client)),
    locatii: JSON.stringify(getInitialLocatii(mode, client)),
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  // State pentru gestionarea dialogului de adăugare/editare echipament
  const [isEchipamentDialogOpen, setIsEchipamentDialogOpen] = useState(false)
  const [selectedLocatieIndex, setSelectedLocatieIndex] = useState<number | null>(null)
  const [selectedEchipamentIndex, setSelectedEchipamentIndex] = useState<number | null>(null)
  const hasAutoOpenedEquipmentRef = useRef(false)
  const [echipamentFormData, setEchipamentFormData] = useState<Echipament & { dataInstalare?: string; observatii?: string; dynamicSettings?: any }>({
    nume: "",
    cod: "",
    model: "",
    serie: "",
    dataInstalare: "",
    ultimaInterventie: "",
    observatii: "",
    documentationFolderId: "",
    documentationSubfolderId: "",
    documentationFileIds: [],
    documentationLabel: "",
    dynamicSettings: {} as any,
  })
  const [echipamentDataInstalareInput, setEchipamentDataInstalareInput] = useState<string>("")
  const [echipamentPhotoFile, setEchipamentPhotoFile] = useState<File | null>(null)
  const [echipamentPhotoPreview, setEchipamentPhotoPreview] = useState<string>("")
  const [echipamentPhotoRemoved, setEchipamentPhotoRemoved] = useState(false)
  const [echipamentPhotoUploading, setEchipamentPhotoUploading] = useState(false)
  /** Pending local photos for equipment created before the client has an ID (add mode). */
  const pendingEquipmentPhotosRef = useRef<Map<string, File>>(new Map())
  const echipamentPhotoInputRef = useRef<HTMLInputElement | null>(null)
  // Capture child selection from TemplateSelector (first-level under template)
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {}
      const parentId = String(detail.parentId || "")
      const parentName = String(detail.parentName || "")
      if (!parentId) return
      setEchipamentFormData((prev: any) => ({
        ...prev,
        dynamicSettings: {
          ...(prev?.dynamicSettings || {}),
          "revision.checklistParentId": parentId,
          "revision.checklistParentName": parentName,
        },
      }))
      setEchipamentFormErrors((prev) => prev.filter((error) => error !== REVISION_CHECKLIST_PARENT_ERROR))
    }
    try { window.addEventListener("revision-template-child-change", handler as any) } catch {}
    return () => {
      try { window.removeEventListener("revision-template-child-change", handler as any) } catch {}
    }
  }, [REVISION_CHECKLIST_PARENT_ERROR])

  // Sincronizăm câmpul de input text pentru data instalării cu valoarea salvată
  useEffect(() => {
    if (echipamentFormData.dataInstalare) {
      const d = toDateSafe(echipamentFormData.dataInstalare)
      if (d) {
        try {
          setEchipamentDataInstalareInput(formatUiDate(d))
        } catch {
          setEchipamentDataInstalareInput("")
        }
      } else {
        setEchipamentDataInstalareInput("")
      }
    } else {
      setEchipamentDataInstalareInput("")
    }
  }, [echipamentFormData.dataInstalare])

  // Auto-deschidere dialog echipament pe baza selecției inițiale (query params din pagina de listă)
  useEffect(() => {
    if (mode !== "edit") return
    if (!initialEquipmentSelection) return
    if (hasAutoOpenedEquipmentRef.current) return

    const locIdx = initialEquipmentSelection.locationIndex ?? 0
    const loc = locatii?.[locIdx]
    if (!loc || !Array.isArray(loc.echipamente)) return

    let targetIdx =
      typeof initialEquipmentSelection.equipmentIndex === "number" && Number.isFinite(initialEquipmentSelection.equipmentIndex)
        ? (initialEquipmentSelection.equipmentIndex as number)
        : -1

    if (targetIdx < 0) {
      const eqs = loc.echipamente
      const matchId = initialEquipmentSelection.equipmentId
      const matchCode = initialEquipmentSelection.equipmentCode
      targetIdx = eqs.findIndex((e: any) => (matchId && e?.id === matchId) || (matchCode && e?.cod === matchCode))
    }

    if (targetIdx >= 0) {
      handleOpenEditEchipamentDialog(locIdx, targetIdx)
      hasAutoOpenedEquipmentRef.current = true
    }
  }, [initialEquipmentSelection, locatii, mode])
  const [echipamentFormErrors, setEchipamentFormErrors] = useState<string[]>([])
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [isCodeUnique, setIsCodeUnique] = useState(true)
  // Legacy documentație upload removed (Documentații uses folder-based selection)

  // Documentații: dosare + subdosare (nou)
  const [docFolders, setDocFolders] = useState<DocumentatiiFolder[]>([])
  const [docSubfolders, setDocSubfolders] = useState<DocumentatiiSubfolder[]>([])
  const [docFiles, setDocFiles] = useState<DocumentatiiFile[]>([])
  const [docsPickerOpen, setDocsPickerOpen] = useState(false)
  const [docsPickerFolderId, setDocsPickerFolderId] = useState("")
  const [docsPickerSubfolderId, setDocsPickerSubfolderId] = useState("")
  const [docsPickerFileIds, setDocsPickerFileIds] = useState<string[]>([])
  
  // State pentru confirmarea închiderii dialog-ului de echipament
  const [showEchipamentCloseAlert, setShowEchipamentCloseAlert] = useState(false)
  const [echipamentFormModified, setEchipamentFormModified] = useState(false)
  const [initialEchipamentState, setInitialEchipamentState] = useState<Echipament & { dataInstalare?: string; observatii?: string }>({
    nume: "",
    cod: "",
    model: "",
    serie: "",
    dataInstalare: "",
    ultimaInterventie: "",
    observatii: "",
    documentationFolderId: "",
    documentationSubfolderId: "",
    documentationFileIds: [],
    documentationLabel: "",
    dynamicSettings: {} as any,
  })

  // Use the useUnsavedChanges hook
  const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
    useUnsavedChanges(formModified)

  // (Documentații no longer uses equipment.documentTypes)

  // Documentații: încărcăm dosarele (nou)
  useEffect(() => {
    const unsub = subscribeDocumentatiiFolders((items) => setDocFolders(items))
    return () => {
      try { (unsub as any)?.() } catch {}
    }
  }, [])

  const activeDocsFolderId = docsPickerOpen
    ? docsPickerFolderId
    : String((echipamentFormData as any)?.documentationFolderId || "").trim()
  const activeDocsSubfolderId = docsPickerOpen
    ? docsPickerSubfolderId
    : String((echipamentFormData as any)?.documentationSubfolderId || "").trim()

  const openDocsPicker = () => {
    const currentFolderId = String((echipamentFormData as any)?.documentationFolderId || "")
    const currentSubfolderId = String((echipamentFormData as any)?.documentationSubfolderId || "")
    const currentFileIds = Array.isArray((echipamentFormData as any)?.documentationFileIds)
      ? (echipamentFormData as any).documentationFileIds
      : []
    setDocsPickerFolderId(currentFolderId)
    setDocsPickerSubfolderId(currentSubfolderId)
    setDocsPickerFileIds(currentFileIds)
    setDocsPickerOpen(true)
  }

  const handleDocsPickerConfirm = () => {
    if (!docsPickerFileIds.length) {
      toast({
        title: "Selectați fișiere",
        description: "Alegeți cel puțin un fișier pentru a continua.",
        variant: "destructive",
      })
      return
    }
    const folder = docFolders.find((f) => f.id === docsPickerFolderId)
    const sub = docSubfolders.find((s) => s.id === docsPickerSubfolderId)
    setEchipamentFormData((prev: any) => ({
      ...prev,
      documentationFolderId: docsPickerFolderId,
      documentationSubfolderId: docsPickerSubfolderId,
      documentationFileIds: docsPickerFileIds,
      documentationLabel: folder ? `${folder.name}${sub ? ` / ${sub.name}` : ""}` : "",
    }))
    setDocsPickerOpen(false)
  }

  // Documentații: încărcăm subdosarele pentru dosarul selectat
  useEffect(() => {
    const folderId = String(activeDocsFolderId || "").trim()
    if (!folderId) {
      setDocSubfolders([])
      return
    }
    const unsub = subscribeDocumentatiiSubfolders(folderId, (items) => setDocSubfolders(items))
    return () => {
      try { (unsub as any)?.() } catch {}
    }
  }, [activeDocsFolderId])

  // Documentații: încărcăm fișierele pentru dosar/subdosar
  useEffect(() => {
    const folderId = String(activeDocsFolderId || "").trim()
    if (!folderId) {
      setDocFiles([])
      return
    }
    const subfolderId = activeDocsSubfolderId ? String(activeDocsSubfolderId) : null
    const unsub = subscribeDocumentatiiFiles(folderId, subfolderId, setDocFiles)
    return () => {
      try { (unsub as any)?.() } catch {}
    }
  }, [activeDocsFolderId, activeDocsSubfolderId])

  // Check if form has been modified
  useEffect(() => {
    const currentState = {
      formData,
      clientContacts: JSON.stringify(clientContacts),
      locatii: JSON.stringify(locatii),
    }

    // Only consider the form modified if it's different from the initial state
    // and if there's actual content (not just empty fields)
    const hasChanged =
      JSON.stringify(currentState.formData) !== JSON.stringify(initialFormState.formData) ||
      currentState.clientContacts !== initialFormState.clientContacts ||
      currentState.locatii !== initialFormState.locatii

    const hasContent =
      formData.nume ||
      formData.cif ||
      formData.regCom ||
      formData.adresa ||
      formData.email ||
      formData.telefon ||
      formData.reprezentantFirma ||
      clientContacts.some((contact) => hasAnyContactContent(contact)) ||
      locatii.some(
        (loc) =>
          loc.nume ||
          loc.adresa ||
          loc.persoaneContact.some((p) => p.nume || p.telefon) ||
          (loc.echipamente && loc.echipamente.length > 0),
      )

    setFormModified(Boolean(hasChanged && hasContent))
    console.log("Form modified:", hasChanged && hasContent)
  }, [formData, clientContacts, locatii, initialFormState])

  // Check if equipment form has been modified
  useEffect(() => {
    const hasChanged = JSON.stringify(echipamentFormData) !== JSON.stringify(initialEchipamentState)
    const hasContent = echipamentFormData.nume || echipamentFormData.cod || echipamentFormData.model || echipamentFormData.serie || echipamentFormData.dataInstalare || echipamentFormData.observatii

    setEchipamentFormModified(Boolean(hasChanged && hasContent))
  }, [echipamentFormData, initialEchipamentState])

  // Reset form modified state after successful submission
  useEffect(() => {
    if (!isSubmitting && !error && formModified) {
      setFormModified(false)
    }
  }, [isSubmitting, error, formModified])

  // Add useImperativeHandle to expose methods to parent
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => formModified,
  }))

  // Log when showCloseAlert changes
  useEffect(() => {
    console.log("showCloseAlert changed to:", showCloseAlert)
  }, [showCloseAlert])

  // Verificăm CUI-ul când se schimbă (doar în modul add)
  useEffect(() => {
    if (mode === "add") {
    // Curățăm timeout-ul anterior dacă există
    if (cuiTimeoutRef.current) {
      clearTimeout(cuiTimeoutRef.current)
    }

    // Dacă CUI-ul este gol, resetăm starea
    if (!formData.cif || formData.cif.trim() === "") {
      setCuiExists(false)
      setIsCuiChecking(false)
      return
    }

    // Verificăm CUI-ul doar dacă a fost modificat și nu este gol
    if (cuiTouched && formData.cif.trim() !== "") {
      setIsCuiChecking(true)

      // Folosim debounce pentru a nu face prea multe cereri
      cuiTimeoutRef.current = setTimeout(async () => {
        try {
          const exists = await checkCuiExists(formData.cif)
          setCuiExists(exists)

          if (exists) {
            toast({
              title: "CUI/CIF duplicat",
              description: "Există deja un client cu acest CUI/CIF în baza de date.",
              variant: "destructive",
            })
          }
        } catch (error) {
          console.error("Eroare la verificarea CUI:", error)
        } finally {
          setIsCuiChecking(false)
        }
      }, 500) // Verificăm după 500ms de la ultima modificare
    }

    // Cleanup la unmount
    return () => {
      if (cuiTimeoutRef.current) {
        clearTimeout(cuiTimeoutRef.current)
      }
    }
    }
  }, [formData.cif, cuiTouched, mode])



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    console.log(`Input changed: ${id} = ${value}`)

    // Dacă se modifică CUI-ul în modul add, marcăm că a fost atins
    if (id === "cif" && mode === "add") {
      setCuiTouched(true)
    }

    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleAddClientContact = () => {
    setClientContacts((prev) => [...prev, createEmptyContact()])
  }

  const handleRemoveClientContact = (contactIndex: number) => {
    setClientContacts((prev) => {
      if (prev.length <= 1) {
        return [createEmptyContact()]
      }

      return prev.filter((_, index) => index !== contactIndex)
    })
  }

  const handleClientContactChange = (contactIndex: number, field: keyof PersoanaContact, value: string) => {
    setClientContacts((prev) =>
      prev.map((contact, index) =>
        index === contactIndex
          ? {
              ...contact,
              [field]: value,
            }
          : contact
      )
    )
  }

  // Adăugăm funcție pentru adăugarea unei noi locații
  const handleAddLocatie = () => {
    setLocatii([
      ...locatii,
      createEmptyLocation(),
    ])
  }

  // Adăugăm funcție pentru ștergerea unei locații
  const handleRemoveLocatie = (index: number) => {
    if (locatii.length > 1) {
      const updatedLocatii = [...locatii]
      updatedLocatii.splice(index, 1)
      setLocatii(updatedLocatii)
    }
  }

  // Adăugăm funcție pentru modificarea unei locații
  const handleLocatieChange = (index: number, field: keyof Locatie, value: any) => {
    const updatedLocatii = [...locatii]
    updatedLocatii[index] = { ...updatedLocatii[index], [field]: value }
    setLocatii(updatedLocatii)
  }

  // Adăugăm funcție pentru adăugarea unei persoane de contact la o locație
  const handleAddContactToLocatie = (locatieIndex: number) => {
    const updatedLocatii = [...locatii]
    updatedLocatii[locatieIndex].persoaneContact.push(createEmptyContact())
    setLocatii(updatedLocatii)
  }

  // Adăugăm funcție pentru ștergerea unei persoane de contact de la o locație
  const handleRemoveContactFromLocatie = (locatieIndex: number, contactIndex: number) => {
    if (locatii[locatieIndex].persoaneContact.length > 1) {
      const updatedLocatii = [...locatii]
      updatedLocatii[locatieIndex].persoaneContact.splice(contactIndex, 1)
      setLocatii(updatedLocatii)
    }
  }

  // Adăugăm funcție pentru modificarea unei persoane de contact la o locație
  const handleLocatieContactChange = (
    locatieIndex: number,
    contactIndex: number,
    field: keyof PersoanaContact,
    value: string,
  ) => {
    const updatedLocatii = [...locatii]
    updatedLocatii[locatieIndex].persoaneContact[contactIndex] = {
      ...updatedLocatii[locatieIndex].persoaneContact[contactIndex],
      [field]: value,
    }
    setLocatii(updatedLocatii)
  }

  const resetEchipamentPhotoState = (existing?: { fotoUrl?: string }) => {
    setEchipamentPhotoFile(null)
    setEchipamentPhotoRemoved(false)
    setEchipamentPhotoUploading(false)
    setEchipamentPhotoPreview(existing?.fotoUrl || "")
    if (echipamentPhotoInputRef.current) echipamentPhotoInputRef.current.value = ""
  }

  // Funcție pentru deschiderea dialogului de adăugare echipament
  const handleOpenAddEchipamentDialog = (locatieIndex: number) => {
    setSelectedLocatieIndex(locatieIndex)
    setSelectedEchipamentIndex(null)
    setEchipamentFormData({
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
      fotoUrl: "",
      fotoPath: "",
      documentationFolderId: "",
      documentationSubfolderId: "",
      documentationFileIds: [],
      documentationLabel: "",
      dynamicSettings: {} as any,
    })
    resetEchipamentPhotoState()
    setEchipamentFormErrors([])
    setIsCodeUnique(true)
    setIsEchipamentDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de editare echipament
  const handleOpenEditEchipamentDialog = (locatieIndex: number, echipamentIndex: number, e?: React.MouseEvent) => {
    // Stop propagation to prevent the click from affecting parent components
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }

    setSelectedLocatieIndex(locatieIndex)
    setSelectedEchipamentIndex(echipamentIndex)

    const echipament = locatii[locatieIndex].echipamente?.[echipamentIndex] || {
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
    }

    setEchipamentFormData({ ...echipament, dynamicSettings: (echipament as any).dynamicSettings || {} })
    resetEchipamentPhotoState({ fotoUrl: (echipament as any).fotoUrl || "" })
    setEchipamentFormErrors([])
    setIsCodeUnique(true)
    setIsEchipamentDialogOpen(true)
  }

  // Update the handleEchipamentInputChange function to use the new validation rule
  // Funcție pentru modificarea datelor echipamentului
  const handleEchipamentInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setEchipamentFormData((prev) => ({ ...prev, [id]: value }))

    // Verificăm codul dacă acesta se schimbă
    if (id === "cod") {
      // Validăm formatul codului (maxim 10 caractere, conține cifre și litere)
      if (value !== "" && (!(/[a-zA-Z]/.test(value) && /[0-9]/.test(value)) || value.length > 10)) {
        setEchipamentFormErrors((prev) => (prev.includes("cod") ? prev : [...prev, "cod"]))
      } else {
        setEchipamentFormErrors((prev) => prev.filter((error) => error !== "cod"))
      }
    }
  }

  // Update the handleSaveEchipament function to use the new validation rule
  // Funcție pentru salvarea echipamentului
  const handleSaveEchipament = async () => {
    // Validăm datele echipamentului
    const errors: string[] = []
    const selectedChecklistParentId = String(
      (echipamentFormData as any)?.dynamicSettings?.["revision.checklistParentId"] || "",
    ).trim()

    if (!echipamentFormData.nume) errors.push("nume")
    if (!echipamentFormData.cod) errors.push("cod")

    // Validăm formatul codului (maxim 10 caractere, conține litere și cifre)
    if (
      !(/[a-zA-Z]/.test(echipamentFormData.cod) && /[0-9]/.test(echipamentFormData.cod)) ||
      echipamentFormData.cod.length > 10
    ) {
      errors.push("cod")
    }

    if (!selectedChecklistParentId) {
      errors.push(REVISION_CHECKLIST_PARENT_ERROR)
    }

    const normalizedErrors = Array.from(new Set(errors))
    setEchipamentFormErrors(normalizedErrors)

    if (normalizedErrors.includes(REVISION_CHECKLIST_PARENT_ERROR)) {
      toast({
        title: "Checklist revizie lipsă",
        description: "Selectați „Fișa de operațiuni” pentru acest echipament înainte de salvare.",
        variant: "destructive",
      })
      return
    }

    if (normalizedErrors.length > 0 || !isCodeUnique) {
      return
    }

    if (selectedLocatieIndex === null) return

    const updatedLocatii = [...locatii]

    // Ne asigurăm că locația are array-ul de echipamente inițializat
    if (!updatedLocatii[selectedLocatieIndex].echipamente) {
      updatedLocatii[selectedLocatieIndex].echipamente = []
    }

    const location = updatedLocatii[selectedLocatieIndex]
    const locationId = String((location as any)?.id || `loc_${selectedLocatieIndex}`)
    const existingId =
      selectedEchipamentIndex !== null
        ? updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex].id
        : undefined
    const equipmentId = String(existingId || uuidv4())

    const equipmentToSave: any = {
      ...echipamentFormData,
      id: equipmentId,
    }

    if (echipamentPhotoRemoved) {
      delete equipmentToSave.fotoUrl
      delete equipmentToSave.fotoPath
    } else {
      if (echipamentFormData.fotoUrl) equipmentToSave.fotoUrl = echipamentFormData.fotoUrl
      else delete equipmentToSave.fotoUrl
      if (echipamentFormData.fotoPath) equipmentToSave.fotoPath = echipamentFormData.fotoPath
      else delete equipmentToSave.fotoPath
    }

    try {
      setEchipamentPhotoUploading(true)

      const clientId = client?.id ? String(client.id) : ""
      const previousPath = String((echipamentFormData as any).fotoPath || "").trim()

      if (echipamentPhotoRemoved && previousPath) {
        try {
          await deleteFile(previousPath)
        } catch (err) {
          console.warn("Nu s-a putut șterge fotografia veche a echipamentului:", err)
        }
        pendingEquipmentPhotosRef.current.delete(equipmentId)
      }

      if (echipamentPhotoFile) {
        if (clientId) {
          if (previousPath) {
            try {
              await deleteFile(previousPath)
            } catch (err) {
              console.warn("Nu s-a putut șterge fotografia anterioară:", err)
            }
          }
          const ext = (echipamentPhotoFile.name.split(".").pop() || "jpg").toLowerCase()
          const path = `clients/${clientId}/locations/${locationId}/equipment/${equipmentId}/photo-${Date.now()}.${ext}`
          const uploaded = await uploadFile(echipamentPhotoFile, path)
          equipmentToSave.fotoUrl = uploaded.url
          equipmentToSave.fotoPath = path
          pendingEquipmentPhotosRef.current.delete(equipmentId)
        } else {
          // Client not yet created — keep file until client save.
          pendingEquipmentPhotosRef.current.set(equipmentId, echipamentPhotoFile)
          equipmentToSave.fotoUrl = echipamentPhotoPreview || undefined
          equipmentToSave.fotoPath = undefined
        }
      }

      if (selectedEchipamentIndex !== null) {
        updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex] = equipmentToSave
      } else {
        updatedLocatii[selectedLocatieIndex].echipamente!.push(equipmentToSave)
      }

      setLocatii(updatedLocatii)
      setIsEchipamentDialogOpen(false)
      resetEchipamentPhotoState()
    } catch (err) {
      console.error("Eroare la salvarea fotografiei echipamentului:", err)
      toast({
        title: "Eroare fotografie",
        description: err instanceof Error ? err.message : "Nu s-a putut încărca fotografia echipamentului.",
        variant: "destructive",
      })
    } finally {
      setEchipamentPhotoUploading(false)
    }
  }

  // Funcție pentru ștergerea unui echipament
  const handleDeleteEchipament = (locatieIndex: number, echipamentIndex: number, e: React.MouseEvent) => {
    // Stop propagation to prevent the click from affecting parent components
    e.stopPropagation()
    e.preventDefault()

    // În modul edit, verificăm dacă utilizatorul este admin
    if (mode === "edit" && !isAdmin) {
      alert("Doar administratorii pot șterge echipamente.")
      return
    }

    if (window.confirm("Sunteți sigur că doriți să ștergeți acest echipament?")) {
      const updatedLocatii = [...locatii]
      updatedLocatii[locatieIndex].echipamente!.splice(echipamentIndex, 1)
      setLocatii(updatedLocatii)
    }
  }

  // Funcție pentru gestionarea închiderii dialog-ului de echipament
  const handleCloseEchipamentDialog = () => {
    if (echipamentFormModified) {
      setShowEchipamentCloseAlert(true)
    } else {
      setIsEchipamentDialogOpen(false)
      resetEchipamentForm()
    }
  }

  // Funcție pentru confirmarea închiderii dialog-ului de echipament
  const confirmCloseEchipamentDialog = () => {
    setShowEchipamentCloseAlert(false)
    setIsEchipamentDialogOpen(false)
    resetEchipamentForm()
  }

  // Funcție pentru anularea închiderii dialog-ului de echipament
  const cancelCloseEchipamentDialog = () => {
    setShowEchipamentCloseAlert(false)
  }

  // Funcție pentru resetarea formularului de echipament
  const resetEchipamentForm = () => {
    setEchipamentFormData({
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
      documentationFolderId: "",
      documentationSubfolderId: "",
      documentationFileIds: [],
      documentationLabel: "",
      dynamicSettings: {} as any,
    })
    setInitialEchipamentState({
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
      documentationFolderId: "",
      documentationSubfolderId: "",
      documentationFileIds: [],
      documentationLabel: "",
      dynamicSettings: {} as any,
    })
    setEchipamentFormModified(false)
    setEchipamentFormErrors([])
    setSelectedLocatieIndex(null)
    setSelectedEchipamentIndex(null)
  }

  // Update the checkCodeUniqueness function to use the new validation rule
  // Verificăm unicitatea codului de echipament
  useEffect(() => {
    const checkCodeUniqueness = async () => {
      if (
        echipamentFormData.cod &&
        /[a-zA-Z]/.test(echipamentFormData.cod) &&
        /[0-9]/.test(echipamentFormData.cod) &&
        echipamentFormData.cod.length <= 10
      ) {
        setIsCheckingCode(true)

        // Verificăm dacă codul este unic în cadrul locațiilor clientului
        let isUnique = true

        // Verificăm toate locațiile
        for (let i = 0; i < locatii.length; i++) {
          // Sărim peste locația curentă dacă verificăm un echipament existent
          if (i === selectedLocatieIndex && selectedEchipamentIndex !== null) continue

          const echipamente = locatii[i].echipamente || []

          // Verificăm toate echipamentele din locație
          for (let j = 0; j < echipamente.length; j++) {
            // Sărim peste echipamentul curent dacă îl edităm
            if (i === selectedLocatieIndex && j === selectedEchipamentIndex) continue

            if (echipamente[j].cod === echipamentFormData.cod) {
              isUnique = false
              break
            }
          }

          if (!isUnique) break
        }

        setIsCodeUnique(isUnique)
        setIsCheckingCode(false)
      }
    }

    checkCodeUniqueness()
  }, [echipamentFormData.cod, locatii, selectedLocatieIndex, selectedEchipamentIndex])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)

      // Verificăm dacă CUI-ul există deja (doar în modul add)
      if (mode === "add" && formData.cif && formData.cif.trim() !== "") {
        const exists = await checkCuiExists(formData.cif)
        if (exists) {
          setError("Există deja un client cu acest CUI/CIF în baza de date.")
          setIsSubmitting(false)
          return
        }
      }

      // Resetăm erorile de câmp
      const errors: string[] = []

      // Verificăm câmpurile obligatorii
      if (!formData.nume) errors.push("nume")
      if (!formData.telefon) errors.push("telefon")
      if (!formData.reprezentantFirma) errors.push("reprezentantFirma")

      clientContacts.forEach((contact, index) => {
        if (hasAnyContactContent(contact) && (!contact.nume || !contact.telefon)) {
          errors.push(`clientContacts[${index}]`)
        }
      })

      setFieldErrors(errors)

      if (errors.length > 0) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      const filteredClientContacts = clientContacts
        .filter((contact) => contact.nume && contact.telefon)
        .map((contact) => ({
          ...contact,
          email: contact.email || "",
          functie: contact.functie || "",
        }))

      // Filtrăm locațiile și persoanele de contact goale din locații
      let filteredLocatii = locatii
        .filter((locatie) => hasAnyLocationContent(locatie))
        .map((locatie) => ({
          ...locatie,
          persoaneContact: (locatie.persoaneContact || []).filter((contact) => hasAnyContactContent(contact)),
          // Backfill: ne asigurăm că fiecare echipament are un ID stabil (fără a modifica ID-urile existente).
          echipamente: (locatie.echipamente || [])
            .filter((e) => e.nume && e.cod)
            .map((e) => ({
              ...e,
              id: e.id || uuidv4(),
            })),
        }))

      const primaryClientContact = filteredClientContacts.length > 0 ? filteredClientContacts[0] : null
      const legacyPrimaryContactName =
        primaryClientContact?.nume || formData.reprezentantFirma || (client as any)?.persoanaContact || ""

      const uploadPendingEquipmentPhotos = async (clientId: string, locations: Locatie[]) => {
        const resolved: Locatie[] = []
        for (let locIdx = 0; locIdx < locations.length; locIdx++) {
          const locatie = locations[locIdx]
          const locationId = String((locatie as any)?.id || `loc_${locIdx}`)
          const echipamente: Echipament[] = []
          for (const eq of locatie.echipamente || []) {
            const equipmentId = String(eq.id || uuidv4())
            const pendingFile = pendingEquipmentPhotosRef.current.get(equipmentId)
            let fotoUrl = eq.fotoUrl
            let fotoPath = eq.fotoPath
            if (pendingFile) {
              const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase()
              const path = `clients/${clientId}/locations/${locationId}/equipment/${equipmentId}/photo-${Date.now()}.${ext}`
              const uploaded = await uploadFile(pendingFile, path)
              fotoUrl = uploaded.url
              fotoPath = path
              pendingEquipmentPhotosRef.current.delete(equipmentId)
            } else if (typeof fotoUrl === "string" && fotoUrl.startsWith("blob:")) {
              fotoUrl = undefined
              fotoPath = undefined
            }
            const rest = { ...eq, id: equipmentId } as Echipament
            delete (rest as any).fotoUrl
            delete (rest as any).fotoPath
            echipamente.push({
              ...rest,
              ...(fotoUrl ? { fotoUrl } : {}),
              ...(fotoPath ? { fotoPath } : {}),
            })
          }
          resolved.push({ ...locatie, echipamente })
        }
        return resolved
      }

      if (mode === "add") {
        // MODE: ADD - Create new client
      const newClient = {
        ...formData,
        cui: formData.cif,
        regCom: formData.regCom || "",
        contBancar: "",
        banca: "",
        persoaneContact: filteredClientContacts,
        persoanaContact: legacyPrimaryContactName,
        numarLucrari: 0,
        locatii: filteredLocatii,
      }

      // 1) Creăm clientul minimal pentru a obține ID
      const created = await addClient(newClient as any)
      const clientId = (created as any)?.id
      console.log("Client adăugat cu ID:", clientId)

      // 2) Upload fotografii echipament pending + update locatii dacă e nevoie
      if (clientId && pendingEquipmentPhotosRef.current.size > 0) {
        filteredLocatii = await uploadPendingEquipmentPhotos(String(clientId), filteredLocatii)
        await updateClient(String(clientId), { locatii: filteredLocatii })
      }

        setFormModified(false)
      if (clientId) {
        onCreatedClient?.({
          clientId: String(clientId),
          clientName: formData.nume,
        })
      }
      if (onSuccess) onSuccess(formData.nume)
      } else {
        // MODE: EDIT - Update existing client
        if (!client?.id) {
          throw new Error("ID-ul clientului lipsește")
        }

        if (pendingEquipmentPhotosRef.current.size > 0) {
          filteredLocatii = await uploadPendingEquipmentPhotos(String(client.id), filteredLocatii)
        }

        await updateClient(client.id, {
          ...formData,
          cui: formData.cif,
          regCom: formData.regCom || (client as any).regCom || "",
          persoaneContact: filteredClientContacts,
          persoanaContact: legacyPrimaryContactName,
          locatii: filteredLocatii,
        })

        // Update the initial state to match current state after successful save
        setInitialFormState({
          formData,
          clientContacts: JSON.stringify(filteredClientContacts.length > 0 ? filteredClientContacts : [createEmptyContact()]),
          locatii: JSON.stringify(locatii),
        })
        setFormModified(false)
        if (onSuccess) onSuccess()
      }
    } catch (err) {
      console.error(`Eroare la ${mode === "add" ? "adăugarea" : "actualizarea"} clientului:`, err)
      setError(`A apărut o eroare la ${mode === "add" ? "adăugarea" : "actualizarea"} clientului. Încercați din nou.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // New function to handle close attempt - delegate to parent dialog only
  const handleCloseAttempt = () => {
    console.log("handleCloseAttempt called (delegated to parent), formModified:", formModified)
    if (onCancel) onCancel()
  }

  // Functions to handle alert dialog responses
  const confirmClose = () => {
    console.log("confirmClose called")
    setShowCloseAlert(false)
    if (onCancel) {
      onCancel()
    }
  }

  const cancelClose = () => {
    console.log("cancelClose called")
    setShowCloseAlert(false)
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"
  const checklistParentHasError = echipamentFormErrors.includes(REVISION_CHECKLIST_PARENT_ERROR)

  // Test function to show the dialog directly
  const showAlertDialogDirectly = () => {
    console.log("Showing alert dialog directly")
    setShowCloseAlert(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <label htmlFor="nume" className="text-sm font-medium">
          Nume Companie *
        </label>
        <Input
          id="nume"
          placeholder="Introduceți numele companiei"
          value={formData.nume}
          onChange={handleInputChange}
          className={hasError("nume") ? errorStyle : ""}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="cif" className="text-sm font-medium">
          CIF / CUI
        </label>
        <div className="relative">
          <Input
            id="cif"
            placeholder="Introduceți CIF/CUI"
            value={formData.cif}
            onChange={handleInputChange}
            className={cuiExists ? errorStyle : ""}
          />
          {isCuiChecking && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </div>
          )}
          {cuiExists && (
            <div className="flex items-center mt-1 text-red-500 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              <span>Există deja un client cu acest CUI/CIF</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="regCom" className="text-sm font-medium">
          Nr. ordine ONRC (J-…)
        </label>
        <Input
          id="regCom"
          placeholder="Ex: J40/12345/2020"
          value={formData.regCom}
          onChange={handleInputChange}
        />
        <p className="text-xs text-muted-foreground">Opțional. Se poate completa ulterior.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="adresa" className="text-sm font-medium">
          Adresă Sediu
        </label>
        <Input
          id="adresa"
          placeholder="Introduceți adresa sediului"
          value={formData.adresa}
          onChange={handleInputChange}
        />
      </div>

      {/* Setări dinamice (legate la dialogul Client Nou) */}
      <div className="pt-2">
        <DynamicDialogFields
          targetId="dialogs.client.new"
          values={(formData as any)?.customFields}
          onChange={(fieldKey, value) =>
            setFormData((prev: any) => ({
              ...prev,
              customFields: { ...(prev?.customFields || {}), [fieldKey]: value },
            }))
          }
        />
      </div>

      {/* Rand 1: Reprezentant firmă — Telefon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="reprezentantFirma" className="text-sm font-medium">
            Nume Reprezentant Firmă *
          </label>
          <Input
            id="reprezentantFirma"
            placeholder="Numele reprezentantului firmei"
            value={formData.reprezentantFirma}
            onChange={handleInputChange}
            className={hasError("reprezentantFirma") ? errorStyle : ""}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="telefon" className="text-sm font-medium">
            Număr de telefon principal *
          </label>
          <Input
            id="telefon"
            type="tel"
            placeholder="Număr de telefon principal al companiei"
            value={formData.telefon}
            onChange={handleInputChange}
            className={hasError("telefon") ? errorStyle : ""}
          />
          <p className="text-xs text-muted-foreground">
            Numărul de telefon principal al companiei (diferit de telefoanele persoanelor de contact din locații)
          </p>
        </div>
      </div>

      {/* Rand 2: Email — Funcție reprezentant */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="Adresă de email"
            value={formData.email}
            onChange={handleInputChange}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="functieReprezentant" className="text-sm font-medium">
            Funcție Reprezentant
          </label>
          <Input
            id="functieReprezentant"
            placeholder="Ex: Administrator, Director, Manager"
            value={formData.functieReprezentant}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-md font-medium">Persoane de contact client</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Aceste contacte sunt folosite în dialogul „Creează oportunitate”.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddClientContact} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" /> Adaugă
          </Button>
        </div>

        <div className="space-y-3">
          {clientContacts.map((contact, contactIndex) => (
            <div key={contact.id || `client-contact-${contactIndex}`} className="p-4 border rounded-md space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium">Contact client #{contactIndex + 1}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveClientContact(contactIndex)}
                  className="h-8 w-8 p-0 text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nume</label>
                  <Input
                    placeholder="Nume persoană contact"
                    value={contact.nume}
                    onChange={(e) => handleClientContactChange(contactIndex, "nume", e.target.value)}
                    className={hasError(`clientContacts[${contactIndex}]`) && !contact.nume ? errorStyle : ""}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Telefon</label>
                  <Input
                    placeholder="Număr de telefon"
                    value={contact.telefon}
                    onChange={(e) => handleClientContactChange(contactIndex, "telefon", e.target.value)}
                    className={hasError(`clientContacts[${contactIndex}]`) && !contact.telefon ? errorStyle : ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="Adresă de email"
                    value={contact.email || ""}
                    onChange={(e) => handleClientContactChange(contactIndex, "email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Funcție</label>
                  <Input
                    placeholder="Funcție"
                    value={contact.functie || ""}
                    onChange={(e) => handleClientContactChange(contactIndex, "functie", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secțiunea pentru locații */}
      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium">Locații</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddLocatie} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" /> Adaugă Locație
          </Button>
        </div>

        {locatii.map((locatie, locatieIndex) => (
          <Accordion key={locatieIndex} type="single" collapsible className="border rounded-md">
            <AccordionItem value={`locatie-${locatieIndex}`} className="border-none">
              <div className="flex items-center justify-between p-4">
                <AccordionTrigger className="flex-1 hover:no-underline py-0">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{locatie.nume || `Locație #${locatieIndex + 1}`}</span>
                  </div>
                </AccordionTrigger>
                {locatii.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveLocatie(locatieIndex)
                    }}
                    className="h-8 w-8 p-0 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nume Locație</label>
                      <Input
                        placeholder="Ex: Sediu Central, Punct de Lucru, etc."
                        value={locatie.nume}
                        onChange={(e) => handleLocatieChange(locatieIndex, "nume", e.target.value)}
                        className={hasError(`locatii[${locatieIndex}].nume`) ? errorStyle : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Adresă Locație</label>
                      <Input
                        placeholder="Adresa locației"
                        value={locatie.adresa}
                        onChange={(e) => handleLocatieChange(locatieIndex, "adresa", e.target.value)}
                        className={hasError(`locatii[${locatieIndex}].adresa`) ? errorStyle : ""}
                      />
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Persoane de contact pentru locație */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-medium">Persoane de Contact pentru Locație</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddContactToLocatie(locatieIndex)}
                        className="flex items-center"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adaugă
                      </Button>
                    </div>

                    {locatie.persoaneContact.map((contact, contactIndex) => (
                      <div key={contactIndex} className="p-4 border rounded-md space-y-4">
                        <div className="flex justify-between items-center">
                          <h5 className="text-sm font-medium">Persoana de contact #{contactIndex + 1}</h5>
                          {locatie.persoaneContact.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveContactFromLocatie(locatieIndex, contactIndex)}
                              className="h-8 w-8 p-0 text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Nume</label>
                            <Input
                              placeholder="Nume persoană contact"
                              value={contact.nume}
                              onChange={(e) =>
                                handleLocatieContactChange(locatieIndex, contactIndex, "nume", e.target.value)
                              }
                              className={
                                hasError(`locatii[${locatieIndex}].persoaneContact`) && !contact.nume ? errorStyle : ""
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Telefon</label>
                            <Input
                              placeholder="Număr de telefon"
                              value={contact.telefon}
                              onChange={(e) =>
                                handleLocatieContactChange(locatieIndex, contactIndex, "telefon", e.target.value)
                              }
                              className={
                                hasError(`locatii[${locatieIndex}].persoaneContact`) && !contact.telefon
                                  ? errorStyle
                                  : ""
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input
                              type="email"
                              placeholder="Adresă de email"
                              value={contact.email || ""}
                              onChange={(e) =>
                                handleLocatieContactChange(locatieIndex, contactIndex, "email", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Funcție</label>
                            <Input
                              placeholder="Funcție"
                              value={contact.functie || ""}
                              onChange={(e) =>
                                handleLocatieContactChange(locatieIndex, contactIndex, "functie", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  {/* Echipamente pentru locație */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-medium">Echipamente</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAddEchipamentDialog(locatieIndex)}
                        className="flex items-center"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adaugă Echipament
                      </Button>
                    </div>

                    {locatie.echipamente && locatie.echipamente.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {locatie.echipamente.map((echipament, echipamentIndex) => (
                          <div key={echipamentIndex} className="p-4 border rounded-md bg-gray-50 relative">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-grow">
                                <h5 className="font-medium">{echipament.nume}</h5>
                                <Badge variant="outline" className="mt-1">
                                  Cod: {echipament.cod}
                                </Badge>
                              </div>
                              <div className="flex items-center space-x-1">
                                <EquipmentQRCode
                                  equipment={echipament}
                                  clientName={formData.nume}
                                  locationName={locatie.nume}
                                  clientId={mode === "edit" ? (client?.id || undefined) : undefined}
                                  locationId={String((locatie as any)?.id || "").trim() || undefined}
                                  onPrintRecorded={({ printedAt, printedBy, printedById }) => {
                                    setLocatii((prev) =>
                                      prev.map((loc, li) => {
                                        if (li !== locatieIndex) return loc
                                        const nextEchipamente = (Array.isArray(loc.echipamente) ? loc.echipamente : []).map((eq, ei) => {
                                          if (ei !== echipamentIndex) return eq
                                          return {
                                            ...eq,
                                            lastQrPrintedAt: printedAt,
                                            lastQrPrintedBy: printedBy,
                                            lastQrPrintedById: printedById,
                                          }
                                        })
                                        return { ...loc, echipamente: nextEchipamente }
                                      }),
                                    )
                                  }}
                                  useSimpleFormat={true} // Format simplu pentru echipamente noi - mai ușor de scanat
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handleOpenEditEchipamentDialog(locatieIndex, echipamentIndex, e)}
                                  className="h-8 w-8"
                                >
                                  <Wrench className="h-4 w-4" />
                                </Button>
                                {(mode === "add" || isAdmin) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handleDeleteEchipament(locatieIndex, echipamentIndex, e)}
                                  className="h-8 w-8 text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                )}
                              </div>
                            </div>

                            {(echipament.model || echipament.serie) && (
                              <div className="text-sm mt-2">
                                {echipament.model && <p>Model: {echipament.model}</p>}
                                {echipament.serie && <p>Serie: {echipament.serie}</p>}
                              </div>
                            )}

                            {(echipament.dataInstalare || echipament.ultimaInterventie) && (
                              <div className="text-xs text-gray-500 mt-2">
                                {echipament.dataInstalare && <p>Instalat: {(() => { try { const { formatUiDate, toDateSafe } = require("@/lib/utils/time-format"); return formatUiDate(toDateSafe(echipament.dataInstalare)) } catch { return String(echipament.dataInstalare) } })()}</p>}
                                {echipament.ultimaInterventie && (
                                  <p>Ultima intervenție: {formatDate(echipament.ultimaInterventie)}</p>
                                )}
                              </div>
                            )}

                            {echipament.observatii && (
                              <div className="mt-2 text-sm">
                                <p className="text-gray-600">{echipament.observatii}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground border rounded-md">
                        Nu există echipamente pentru această locație
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>

      {/* Dialog pentru adăugare/editare echipament */}
      <Dialog 
        open={isEchipamentDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEchipamentDialog()
          } else {
            setIsEchipamentDialogOpen(open)
          }
        }}
      >
        <DialogContent className="sm:max-w-[900px] w-[95%] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEchipamentIndex !== null ? "Editare Echipament" : "Adăugare Echipament Nou"}
            </DialogTitle>
            {/* Update the dialog description and label */}
            <DialogDescription>
              Completați detaliile echipamentului. Codul trebuie să fie unic, să conțină maxim 10 caractere și să
              includă atât litere cât și cifre.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3 overflow-y-auto">
            {selectedEchipamentIndex !== null && mode === "edit" && !isAdmin && (
              <Alert variant="default" className="mt-2 bg-yellow-50 border-yellow-200 text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Notă: Doar administratorii pot șterge echipamente. Puteți edita detaliile, dar nu puteți șterge
                  echipamentul.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="nume" className="text-sm font-medium">
                  Nume Echipament *
                </label>
                <Input
                  id="nume"
                  placeholder="Nume echipament"
                  value={echipamentFormData.nume}
                  onChange={handleEchipamentInputChange}
                  className={echipamentFormErrors.includes("nume") ? errorStyle : ""}
                />
              </div>

              <div className="space-y-1">
                {/* Update the label for the code field */}
                <label htmlFor="cod" className="text-sm font-medium">
                  Cod Unic (maxim 10 caractere, conține litere și cifre) *
                </label>
                {/* Update the placeholder for the code field */}
                <Input
                  id="cod"
                  placeholder="Ex: ABC123"
                  value={echipamentFormData.cod}
                  onChange={handleEchipamentInputChange}
                  className={echipamentFormErrors.includes("cod") || !isCodeUnique ? errorStyle : ""}
                  maxLength={10}
                />
                {/* Update the error message for the code field */}
                {echipamentFormErrors.includes("cod") && (
                  <p className="text-xs text-red-500">
                    Codul trebuie să conțină maxim 10 caractere și să includă atât litere cât și cifre
                  </p>
                )}
                {!isCodeUnique && (
                  <div className="flex items-center text-xs text-red-500 mt-1">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    <span>Acest cod este deja utilizat</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="model" className="text-sm font-medium">
                  Model
                </label>
                <Input
                  id="model"
                  placeholder="Model echipament"
                  value={echipamentFormData.model || ""}
                  onChange={handleEchipamentInputChange}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="serie" className="text-sm font-medium">
                  Serie
                </label>
                <Input
                  id="serie"
                  placeholder="Număr serie"
                  value={echipamentFormData.serie || ""}
                  onChange={handleEchipamentInputChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="dataInstalare" className="text-sm font-medium">
                  Data Instalării
                </label>
                {/* Permitem atât selecția din calendar, cât și introducerea manuală */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="dataInstalare_display"
                      value={echipamentDataInstalareInput}
                      onChange={(e) => setEchipamentDataInstalareInput(e.target.value)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) {
                          setEchipamentFormData((prev) => ({ ...prev, dataInstalare: "" }))
                          setEchipamentDataInstalareInput("")
                          return
                        }
                        // Acceptăm formate de tip dd.MM.yyyy / dd-MM-yyyy / dd/MM/yyyy
                        const m = raw.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/)
                        let d: Date | null = null
                        if (m) {
                          const day = parseInt(m[1], 10)
                          const month = parseInt(m[2], 10)
                          const year = parseInt(m[3], 10)
                          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                            d = new Date(year, month - 1, day)
                          }
                        } else {
                          const parsed = new Date(raw)
                          if (!isNaN(parsed.getTime())) d = parsed
                        }
                        if (!d || isNaN(d.getTime())) {
                          toast({
                            title: "Dată invalidă",
                            description: "Folosiți formatul zz.ll.aaaa, de exemplu 05.06.2020",
                            variant: "destructive",
                          })
                          // Revenim la valoarea anterioară validă
                          if (echipamentFormData.dataInstalare) {
                            const prevDate = toDateSafe(echipamentFormData.dataInstalare)
                            setEchipamentDataInstalareInput(prevDate ? formatUiDate(prevDate) : "")
                          } else {
                            setEchipamentDataInstalareInput("")
                          }
                          return
                        }
                        const y = d.getFullYear()
                        const m2 = String(d.getMonth() + 1).padStart(2, "0")
                        const da = String(d.getDate()).padStart(2, "0")
                        const iso = `${y}-${m2}-${da}`
                        setEchipamentFormData((prev) => ({ ...prev, dataInstalare: iso }))
                        setEchipamentDataInstalareInput(formatUiDate(d))
                      }}
                      placeholder="dd mmm yyyy"
                      className="text-left"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto">
                    <CustomDatePicker
                      selectedDate={toDateSafe(echipamentFormData.dataInstalare) || new Date()}
                      onDateChange={(date) => {
                        if (!date) {
                          setEchipamentFormData((prev) => ({ ...prev, dataInstalare: "" }))
                          setEchipamentDataInstalareInput("")
                          return
                        }
                        const y = date.getFullYear()
                        const m = String(date.getMonth() + 1).padStart(2, "0")
                        const da = String(date.getDate()).padStart(2, "0")
                        const iso = `${y}-${m}-${da}`
                        setEchipamentFormData((prev) => ({ ...prev, dataInstalare: iso }))
                        setEchipamentDataInstalareInput(formatUiDate(date))
                      }}
                      onClose={() => {}}
                    />
                  </PopoverContent>
                </Popover>
              </div>

           
            </div>

            <div className="space-y-1">
              <label htmlFor="garantieLuni" className="text-sm font-medium">
                Garanție (luni)
              </label>
              <Input
                id="garantieLuni"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="12"
                value={echipamentFormData.garantieLuni || ""}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D+/g, "")
                  handleEchipamentInputChange({ ...e, target: { ...e.target, value: onlyDigits, id: "garantieLuni" } } as any)
                }}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              />
              <p className="text-xs text-muted-foreground">
                Perioada de garanție în luni (implicit 12 luni dacă nu se completează)
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="observatii" className="text-sm font-medium">
                Observații
              </label>
              <Textarea
                id="observatii"
                placeholder="Observații despre echipament"
                value={echipamentFormData.observatii || ""}
                onChange={handleEchipamentInputChange}
                rows={6}
                className="resize-none"
              />
              <div className="pt-2 space-y-2">
                <input
                  ref={echipamentPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    if (!file) return
                    if (echipamentPhotoPreview.startsWith("blob:")) {
                      try {
                        URL.revokeObjectURL(echipamentPhotoPreview)
                      } catch {}
                    }
                    const previewUrl = URL.createObjectURL(file)
                    setEchipamentPhotoFile(file)
                    setEchipamentPhotoPreview(previewUrl)
                    setEchipamentPhotoRemoved(false)
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={echipamentPhotoUploading}
                    onClick={() => echipamentPhotoInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {echipamentPhotoPreview && !echipamentPhotoRemoved ? "Schimbă fotografia" : "Încarcă fotografie"}
                  </Button>
                  {echipamentPhotoPreview && !echipamentPhotoRemoved ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={echipamentPhotoUploading}
                      onClick={() => {
                        if (echipamentPhotoPreview.startsWith("blob:")) {
                          try {
                            URL.revokeObjectURL(echipamentPhotoPreview)
                          } catch {}
                        }
                        setEchipamentPhotoFile(null)
                        setEchipamentPhotoPreview("")
                        setEchipamentPhotoRemoved(true)
                        if (echipamentPhotoInputRef.current) echipamentPhotoInputRef.current.value = ""
                      }}
                    >
                      <X className="h-4 w-4" />
                      Șterge poza
                    </Button>
                  ) : null}
                  <span className="text-xs text-muted-foreground">Opțional</span>
                </div>
                {echipamentPhotoPreview && !echipamentPhotoRemoved ? (
                  <div className="relative w-28 h-28 rounded-md border overflow-hidden bg-muted">
                    <img
                      src={echipamentPhotoPreview}
                      alt="Previzualizare echipament"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                {echipamentPhotoUploading ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Se încarcă fotografia…
                  </p>
                ) : null}
              </div>
            </div>

            {/* Documentații (nou) – selectare dosar / subdosar */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Documentații – vizibil tehnicienilor</label>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Dosar</label>
                <button
                  type="button"
                  onClick={openDocsPicker}
                  className="w-full border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2 hover:border-gray-400"
                >
                  <span className="truncate">
                    {(echipamentFormData as any)?.documentationLabel || "Selectați dosarul"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {(echipamentFormData as any)?.documentationLabel ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Selectat: <span className="font-medium">{(echipamentFormData as any).documentationLabel}</span>
                    </span>
                    {Array.isArray((echipamentFormData as any)?.documentationFileIds) &&
                      (echipamentFormData as any).documentationFileIds.length > 0 && (
                        <span>
                          • {(echipamentFormData as any).documentationFileIds.length} fișier(e)
                        </span>
                      )}
                   
              </div>
                  {Array.isArray((echipamentFormData as any)?.documentationFileIds) &&
                    (echipamentFormData as any).documentationFileIds.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(echipamentFormData as any).documentationFileIds.map((id: string) => {
                          const match = docFiles.find((f) => f.id === id)
                          const label = match?.name || id
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] bg-muted"
                            >
                              <span className="max-w-[220px] truncate">{label}</span>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-red-600"
                                onClick={() =>
                    setEchipamentFormData((prev: any) => ({
                      ...prev,
                                    documentationFileIds: (prev?.documentationFileIds || []).filter((fid: string) => fid !== id),
                                  }))
                                }
                              >
                                ✕
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nu a fost selectată documentație.</p>
              )}
              </div>

            <Dialog open={docsPickerOpen} onOpenChange={setDocsPickerOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Selectează documentația</DialogTitle>
                  <DialogDescription>Alege un dosar, un subdosar (opțional) și fișierele dorite.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex gap-4 overflow-hidden pt-2">
                  <div className="w-64 flex-shrink-0 border rounded-md bg-muted/40 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/60 flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5" />
                      Dosare
                    </div>
                    <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
                      {docFolders.length === 0 && (
                        <div className="text-xs text-muted-foreground px-2 py-4">Nu există dosare.</div>
                      )}
                      {docFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setDocsPickerFolderId(f.id)
                            setDocsPickerSubfolderId("")
                            setDocsPickerFileIds([])
                          }}
                          className={cn(
                            "w-full text-left text-xs px-2 py-2 rounded-md flex items-center gap-2 transition-colors hover:bg-muted",
                            docsPickerFolderId === f.id && "bg-muted font-semibold"
                          )}
                        >
                          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 border rounded-md bg-muted/20 flex flex-col overflow-hidden">
                    <div className="px-3 py-2 flex items-center justify-between border-b bg-muted/40">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Subdosare & fișiere</span>
                      </div>
                    </div>
                    <div className="px-3 py-2 border-b bg-background/60 text-[11px] text-muted-foreground flex items-center gap-1">
                      <span>Documentații</span>
                      {docsPickerFolderId ? (
                        <>
                          <ChevronRight className="h-3 w-3" />
                          <span className="font-medium text-foreground">
                            {docFolders.find((f) => f.id === docsPickerFolderId)?.name || "Dosar"}
                          </span>
                          {docsPickerSubfolderId && (
                            <>
                              <ChevronRight className="h-3 w-3" />
                              <span className="font-medium text-foreground">
                                {docSubfolders.find((s) => s.id === docsPickerSubfolderId)?.name || "Subdosar"}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-3 w-3" />
                          <span>—</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {!docsPickerFolderId && (
                        <div className="text-xs text-muted-foreground">Selectează un dosar din stânga.</div>
                      )}
                      {docsPickerFolderId && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDocsPickerSubfolderId("")
                              setDocsPickerFileIds([])
                            }}
                            className={cn(
                              "w-full text-left text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted",
                              docsPickerSubfolderId === "" && "border-blue-500 ring-2 ring-blue-200"
                            )}
                          >
                            Fără subdosar
                          </button>
                    {docSubfolders.length === 0 ? (
                            <div className="text-xs text-muted-foreground">Nu există subdosare.</div>
                    ) : (
                      docSubfolders.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setDocsPickerSubfolderId(s.id)
                                  setDocsPickerFileIds([])
                                }}
                                className={cn(
                                  "w-full text-left text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted",
                                  docsPickerSubfolderId === s.id && "border-blue-500 ring-2 ring-blue-200"
                                )}
                              >
                          {s.name}
                              </button>
                            ))
                          )}
                          <div className="pt-2 border-t">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Fișiere</div>
                            {docFiles.length === 0 ? (
                              <div className="text-xs text-muted-foreground">Nu există fișiere în această locație.</div>
                            ) : (
                              <div className="space-y-1">
                            {docFiles.map((f) => {
                              const isSelected = docsPickerFileIds.includes(f.id)
                              return (
                                <div
                                  key={f.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() =>
                                    setDocsPickerFileIds((prev) =>
                                      prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault()
                                      setDocsPickerFileIds((prev) =>
                                        prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                                      )
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left text-xs px-2 py-1 rounded-md flex items-center gap-2 hover:bg-muted border focus:outline-none focus:ring-2 focus:ring-blue-200",
                                    isSelected ? "border-blue-500 bg-white" : "border-transparent"
                                  )}
                                >
                                  <span
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center"
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) =>
                                        setDocsPickerFileIds((prev) =>
                                          checked ? [...new Set([...prev, f.id])] : prev.filter((id) => id !== f.id)
                                        )
                                      }
                                    />
                                  </span>
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="truncate flex-1">{f.name}</span>
                                  <a
                                    href={f.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] text-blue-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Deschide
                                  </a>
                                </div>
                              )
                            })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
            </div>

                <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setDocsPickerOpen(false)} className="w-full sm:w-auto">
                    Anulează
                  </Button>
                  <Button
                    onClick={handleDocsPickerConfirm}
                    disabled={!docsPickerFolderId || docsPickerFileIds.length === 0}
                    className="w-full sm:w-auto"
                  >
                    Selectează
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Câmpuri din setări (legate de acest dialog) */}
            <div className="pt-1">
              <label className="text-sm font-medium">Câmpuri din setări (legate de acest dialog)</label>
              <DynamicDialogFields
                targetId="dialogs.equipment.new"
                values={(((echipamentFormData as any) || {})?.dynamicSettings) || {}}
                onChange={(fieldKey, value) =>
                  setEchipamentFormData((prev: any) => ({
                    ...prev,
                    dynamicSettings: { ...(prev?.dynamicSettings || {}), [fieldKey]: value },
                  }))
                }
              />
            </div>

            {/* Check-list revizie per echipament */}
            <div className="pt-1">
              <div className={cn("space-y-2 rounded-md border p-3", checklistParentHasError && "border-red-500 ring-1 ring-red-200")}>
                <label className="text-sm font-medium">Checklist revizie (șablon din Setări)</label>
                <TemplateSelector
                  valueId={(((echipamentFormData as any)?.dynamicSettings) || {})["revision.checklistTemplateId"] || ""}
                  useForSheet={!!((((echipamentFormData as any)?.dynamicSettings) || {})["revision.useChecklistForSheet"])}
                  parentId={(((echipamentFormData as any)?.dynamicSettings) || {})["revision.checklistParentId"] || ""}
                  hasParentError={checklistParentHasError}
                  onChange={(payload) => {
                    setEchipamentFormData((prev: any) => ({
                      ...prev,
                      dynamicSettings: {
                        ...(prev?.dynamicSettings || {}),
                        "revision.checklistTemplateId": payload.templateId,
                        "revision.checklistTemplateName": payload.templateName,
                        "revision.useChecklistForSheet": payload.useForSheet,
                      },
                    }))
                  }}
                />
                {checklistParentHasError && (
                  <p className="text-xs text-red-500">
                    Selectați fișa de operațiuni pentru revizie.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseEchipamentDialog}
              className="w-full sm:w-auto"
            >
              Anulează
            </Button>
            <Button
              type="button"
              onClick={handleSaveEchipament}
              disabled={
                echipamentFormErrors.length > 0 ||
                !echipamentFormData.nume ||
                !echipamentFormData.cod ||
                !isCodeUnique ||
                isCheckingCode ||
                echipamentPhotoUploading
              }
              className="w-full sm:w-auto"
            >
              {isCheckingCode || echipamentPhotoUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                  {echipamentPhotoUploading ? "Se încarcă poza..." : "Verificare..."}
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleCloseAttempt}>
          Anulează
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          type="submit"
          disabled={isSubmitting || (mode === "add" && (cuiExists || isCuiChecking))}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            "Salvează"
          )}
        </Button>
      </div>

      {/* Documentațiile se gestionează în tab-ul Documentații */}

      {/* Internal AlertDialog removed in favor of parent-level confirmation */}

      {/* UnsavedChangesDialog for navigation attempts */}
      <UnsavedChangesDialog
        open={showDialog}
        onConfirm={pendingUrl === "#cancel" ? confirmClose : confirmNavigation}
        onCancel={cancelNavigation}
      />

      {/* Alert Dialog for equipment form unsaved changes */}
      <AlertDialog open={showEchipamentCloseAlert} onOpenChange={setShowEchipamentCloseAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate în formularul de echipament. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelCloseEchipamentDialog}>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseEchipamentDialog} className="bg-red-600 hover:bg-red-700">
              Închide fără salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
})

// Make sure to export the component
export { ClientForm }

// Subcomponent pentru selectarea șablonului de checklist (reutilizabil pentru add/edit)
function TemplateSelector({
  valueId,
  useForSheet,
  parentId,
  hasParentError = false,
  onChange,
  hideTemplateSelect = true,
}: {
  valueId: string
  useForSheet: boolean
  parentId?: string
  hasParentError?: boolean
  onChange: (payload: { templateId: string; templateName: string; useForSheet: boolean }) => void
  /** Dacă este true, nu afișăm dropdown-ul „Șablon checklist”, doar lista de fișe de operațiuni. */
  hideTemplateSelect?: boolean
}) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [selectedId, setSelectedId] = useState<string>(valueId || "")
  // Always true and implicit; checkbox removed from UI
  const [useFlag] = useState<boolean>(true)
  const [childOpts, setChildOpts] = useState<Array<{ id: string; name: string }>>([])
  const [selectedChild, setSelectedChild] = useState<string>(parentId || "")
  const [childOpen, setChildOpen] = useState(false)

  useEffect(() => {
    const unsub = subscribeRevisionChecklistTemplates((settings: any[]) => {
      const opts = (settings || []).map((s: any) => ({ id: s.id, name: s.name || s.path || s.id }))
      setTemplates(opts)
      // Keep display name in sync if current selection is present
      const sel = opts.find((o) => o.id === (valueId || selectedId))
      if (sel) {
        onChange({ templateId: sel.id, templateName: sel.name, useForSheet: true })
      } else if (opts.length > 0 && !selectedId && !valueId) {
        const first = opts[0]
        setSelectedId(first.id)
        onChange({ templateId: first.id, templateName: first.name, useForSheet: true })
      }
    })
    return () => {
      try { unsub?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (Removed) Any code-level validations must live in the parent, not here

  useEffect(() => {
    setSelectedId(valueId || "")
  }, [valueId])

  // Sync selected child with prop if provided (for edit flows)
  useEffect(() => {
    if (parentId && parentId !== selectedChild) {
      setSelectedChild(parentId)
    }
  }, [parentId])

  // Load first-level children for the currently selected template
  useEffect(() => {
    if (!selectedId) {
      setChildOpts([])
      setSelectedChild("")
      return
    }
    const unsub = subscribeToSettings(selectedId, (children: any[]) => {
      const opts = (children || [])
        .slice()
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((c: any) => ({ id: c.id, name: c.name || c.path || c.id }))
      setChildOpts(opts)
      if (parentId && opts.find((o) => o.id === parentId)) {
        setSelectedChild(parentId)
      } else if (selectedChild && !opts.find((o) => o.id === selectedChild)) {
        setSelectedChild("")
      }
    })
    return () => {
      try { (unsub as any)?.() } catch {}
    }
  }, [selectedId, selectedChild, parentId])

  return (
    <div className="grid gap-2">
      {!hideTemplateSelect && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Șablon checklist</label>
            <Select
              value={selectedId}
              onValueChange={(id) => {
                setSelectedId(id)
                const name = templates.find((t) => t.id === id)?.name || ""
                onChange({ templateId: id, templateName: name, useForSheet: true })
                setSelectedChild("")
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectați șablonul" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Checkbox eliminat: “Folosește pentru fișa de operațiuni” este implicit activ */}
        </div>
      )}
      {/* First-level category under selected template */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Fisa de operatiuni</label>
          {(() => {
            const disabled = !selectedId || childOpts.length === 0
            const selectedName = childOpts.find((o) => o.id === selectedChild)?.name || ""
            const placeholder = selectedId ? "Selectați secțiunea" : "Alegeți întâi șablonul"
            return (
              <Popover open={childOpen} onOpenChange={(o) => !disabled && setChildOpen(o)}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={childOpen}
                    disabled={disabled}
                    className={cn(
                      "w-full justify-between",
                      disabled && "opacity-50 cursor-not-allowed",
                      hasParentError && "border-red-500 focus-visible:ring-red-500",
                    )}
                  >
                    <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
                      {selectedName || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[90vw]">
                  <Command shouldFilter={true}>
                    <CommandInput placeholder="Căutați secțiunea..." />
                    <CommandEmpty>Nu s-au găsit rezultate.</CommandEmpty>
                    <CommandList className="max-h-[240px] overflow-auto">
                      <CommandGroup>
                        {childOpts.map((t) => (
                          <CommandItem
                            key={t.id}
                            value={`${t.name} ${t.id}`}
                            onSelect={() => {
                              const id = t.id
                              setSelectedChild(id)
                              try {
                                const name = childOpts.find((o) => o.id === id)?.name || ""
                                window.dispatchEvent(
                                  new CustomEvent(
                                    "revision-template-child-change",
                                    { detail: { parentId: id, parentName: name } } as any,
                                  ),
                                )
                              } catch {}
                              setChildOpen(false)
                            }}
                            className="whitespace-nowrap"
                          >
                            <Check className={cn("mr-2 h-4 w-4", t.id === selectedChild ? "opacity-100" : "opacity-0")} />
                            <span className="inline-block min-w-max">{t.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )
          })()}
          <p className="text-xs text-muted-foreground">
            În funcție de selecție, fișa va porni din această secțiune.
          </p>
        </div>
      </div>
    
    </div>
  )
}
