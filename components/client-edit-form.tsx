"use client"

import type React from "react"
import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Plus, Trash2, Wrench, MapPin, AlertTriangle } from "lucide-react"
import {
  updateClient,
  type Client,
  type PersoanaContact,
  type Locatie,
  type Echipament,
  isEchipamentCodeUnique,
} from "@/lib/firebase/firestore"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
// Adăugăm importul pentru componenta EquipmentQRCode
import { EquipmentQRCode } from "@/components/equipment-qr-code"
import { formatDate, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { CustomDatePicker } from "@/components/custom-date-picker"
// Import the unsaved changes hook and dialog
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
import { DynamicDialogFields } from "@/components/DynamicDialogFields"
import { useAuth } from "@/contexts/AuthContext"
import { uploadFile } from "@/lib/firebase/storage"
import { toast } from "@/components/ui/use-toast"
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { subscribeRevisionChecklistTemplates, subscribeToSettings } from "@/lib/firebase/settings"
import { EquipmentDocsTemplateDialog } from "@/components/equipment-docs-template-dialog"

interface ClientEditFormProps {
  client: Client
  onSuccess?: () => void
  onCancel?: () => void
}

const ClientEditForm = forwardRef(({ client, onSuccess, onCancel }: ClientEditFormProps, ref) => {
  const { userData } = useAuth()
  const isAdmin = userData?.role === "admin"

  const [formData, setFormData] = useState({
    nume: client.nume || "",
    cif: (client as any).cif || client.cui || "",
    regCom: (client as any).regCom || "",
    adresa: client.adresa || "",
    email: client.email || "",
    telefon: client.telefon || "",
    reprezentantFirma: client.reprezentantFirma || "",
    functieReprezentant: (client as any).functieReprezentant || "",
    customFields: (client as any).customFields || {},
  })

  // Add state for close alert dialog - IMPORTANT: default to true for testing
  const [showCloseAlert, setShowCloseAlert] = useState(false)

  // Inițializăm locațiile din client sau creăm una goală dacă nu există
  const [locatii, setLocatii] = useState<Locatie[]>(
    client.locatii && client.locatii.length > 0
      ? client.locatii.map((loc) => ({
          ...loc,
          echipamente: loc.echipamente || [],
        }))
      : [
          {
            nume: "",
            adresa: "",
            persoaneContact:
              client.persoaneContact && client.persoaneContact.length > 0
                ? client.persoaneContact
                : [{ nume: (client as any).persoanaContact || "", telefon: client.telefon || "", email: "", functie: "" }],
            echipamente: [],
          },
        ],
  )
  const [echipamentDataInstalareInput, setEchipamentDataInstalareInput] = useState<string>("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [formModified, setFormModified] = useState(false)

  // State pentru gestionarea dialogului de adăugare/editare echipament
  const [isEchipamentDialogOpen, setIsEchipamentDialogOpen] = useState(false)
  const [selectedLocatieIndex, setSelectedLocatieIndex] = useState<number | null>(null)
  const [selectedEchipamentIndex, setSelectedEchipamentIndex] = useState<number | null>(null)
  const [echipamentFormData, setEchipamentFormData] = useState<Echipament>({
    nume: "",
    cod: "",
    model: "",
    serie: "",
    dataInstalare: "",
    ultimaInterventie: "",
    observatii: "",
    documentatie: [],
    dynamicSettings: {},
  })
  const [echipamentFormErrors, setEchipamentFormErrors] = useState<string[]>([])
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [isCodeUnique, setIsCodeUnique] = useState(true)
  // State pentru documente template din variabile
  const [templateDocuments, setTemplateDocuments] = useState<Array<{ id: string; name: string; url: string; documentType?: string }>>([])
  // State pentru documentul template selectat (dropdown rapid)
  const [selectedTemplateDocument, setSelectedTemplateDocument] = useState<string>("")
  // Dialog selectare multiplă documente template (icon-uri)
  const [isDocsTemplateDialogOpen, setIsDocsTemplateDialogOpen] = useState(false)
  
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
  })

  // Use the useUnsavedChanges hook
  const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
    useUnsavedChanges(formModified)

  // Track initial form state to detect changes
  const [initialFormState, setInitialFormState] = useState({
    formData,
    locatii: JSON.stringify(locatii),
  })

  // Log when showCloseAlert changes
  useEffect(() => {
    console.log("showCloseAlert changed to:", showCloseAlert)
  }, [showCloseAlert])

  // Încărcare documente template din variabile
  useEffect(() => {
    const unsub = subscribeToSettings("equipment.templateDocuments", (settings: any[]) => {
      const docs = ((settings || []) as any[])
        .map((s) => {
          const name = (s.name || s.path || "").toString().trim()
          const url = (s.url || s.value || "").toString().trim()
          const documentType = (s.documentType || "").toString().trim()
          if (!name || !url) return null
          return { 
            id: String(s.id), 
            name, 
            url,
            ...(documentType ? { documentType } : {})
          }
        })
        .filter((t): t is { id: string; name: string; url: string; documentType?: string } => t !== null)
      setTemplateDocuments(docs)
    })
    return () => unsub()
  }, [])

  // Check if form has been modified
  useEffect(() => {
    const currentState = {
      formData,
      locatii: JSON.stringify(locatii),
    }

    const hasChanged =
      JSON.stringify(currentState.formData) !== JSON.stringify(initialFormState.formData) ||
      currentState.locatii !== initialFormState.locatii

    setFormModified(hasChanged)
    console.log("Form modified:", hasChanged)
  }, [formData, locatii, initialFormState])

  // Check if equipment form has been modified
  useEffect(() => {
    const hasChanged = JSON.stringify(echipamentFormData) !== JSON.stringify(initialEchipamentState)
    const hasContent = echipamentFormData.nume || echipamentFormData.cod || echipamentFormData.model || echipamentFormData.serie || (echipamentFormData as any).dataInstalare || (echipamentFormData as any).observatii

    setEchipamentFormModified(hasChanged && hasContent)
  }, [echipamentFormData, initialEchipamentState])

  // Sincronizăm câmpul de input text pentru data instalării cu valoarea salvată
  useEffect(() => {
    const raw = (echipamentFormData as any)?.dataInstalare
    if (raw) {
      const d = toDateSafe(raw)
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
  }, [(echipamentFormData as any)?.dataInstalare])
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
    }
    try { window.addEventListener("revision-template-child-change", handler as any) } catch {}
    return () => {
      try { window.removeEventListener("revision-template-child-change", handler as any) } catch {}
    }
  }, [])

  // Reset form modified state after successful submission
  useEffect(() => {
    if (!isSubmitting && !error && formModified) {
      // Update the initial state to match current state after successful save
      setInitialFormState({
        formData,
        locatii: JSON.stringify(locatii),
      })
      setFormModified(false)
    }
  }, [isSubmitting, error, formModified, formData, locatii])

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => formModified,
  }))



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    console.log(`Input changed: ${id} = ${value}`)



    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  // Adăugăm funcție pentru adăugarea unei noi locații
  const handleAddLocatie = () => {
    setLocatii([
      ...locatii,
      { nume: "", adresa: "", persoaneContact: [{ nume: "", telefon: "", email: "", functie: "" }], echipamente: [] },
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
    updatedLocatii[locatieIndex].persoaneContact.push({ nume: "", telefon: "", email: "", functie: "" })
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
      documentatie: [],
      dynamicSettings: {},
    })
    setEchipamentFormErrors([])
    setIsCodeUnique(true)
    setIsEchipamentDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de editare echipament
  const handleOpenEditEchipamentDialog = (locatieIndex: number, echipamentIndex: number, e: React.MouseEvent) => {
    // Stop propagation to prevent the click from affecting parent components
    e.stopPropagation()
    e.preventDefault()

    setSelectedLocatieIndex(locatieIndex)
    setSelectedEchipamentIndex(echipamentIndex)

    const echipament = locatii[locatieIndex].echipamente?.[echipamentIndex] || {
      nume: "",
      cod: "",
      model: "",
      serie: "",
    }

    setEchipamentFormData({ 
      ...echipament,
      documentatie: echipament.documentatie || [],
      dynamicSettings: (echipament as any).dynamicSettings || {}
    })
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
      // Validăm formatul codului (maxim 10 caractere, conține litere și cifre)
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

    if (!echipamentFormData.nume) errors.push("nume")
    if (!echipamentFormData.cod) errors.push("cod")

    // Validăm formatul codului (maxim 10 caractere, conține litere și cifre)
    if (
      !(/[a-zA-Z]/.test(echipamentFormData.cod) && /[0-9]/.test(echipamentFormData.cod)) ||
      echipamentFormData.cod.length > 10
    ) {
      errors.push("cod")
    }

    setEchipamentFormErrors(errors)

    if (errors.length > 0 || !isCodeUnique) {
      return
    }

    if (selectedLocatieIndex === null) return

    // Pregătim documentația finală (existentă + nouă)
    const finalDocumentatie = [...((echipamentFormData as any).documentatie || [])]
    const updatedLocatii = [...locatii]

    // Ne asigurăm că locația are array-ul de echipamente inițializat
    if (!updatedLocatii[selectedLocatieIndex].echipamente) {
      updatedLocatii[selectedLocatieIndex].echipamente = []
    }

    // Pregătim datele echipamentului cu documentația finală
    const echipamentData = {
      ...echipamentFormData,
      documentatie: finalDocumentatie,
    }

    // Adăugăm sau actualizăm echipamentul
    if (selectedEchipamentIndex !== null) {
      // Editare echipament existent
      updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex] = {
        ...echipamentData,
        id: updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex].id,
      }
    } else {
      // Adăugare echipament nou
      updatedLocatii[selectedLocatieIndex].echipamente!.push({
        ...echipamentData,
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })
    }

    console.log("📦 Salvare echipament cu documentație:", {
      cod: echipamentFormData.cod,
      documentatieCount: finalDocumentatie.length,
      documentatie: finalDocumentatie
    })

    setLocatii(updatedLocatii)
    setIsEchipamentDialogOpen(false)
  }

  // Funcție pentru ștergerea unui echipament
  const handleDeleteEchipament = (locatieIndex: number, echipamentIndex: number, e: React.MouseEvent) => {
    // Stop propagation to prevent the click from affecting parent components
    e.stopPropagation()
    e.preventDefault()

    if (!isAdmin) {
      // Dacă nu este admin, afișăm un mesaj și nu permitem ștergerea
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
      documentatie: [],
      dynamicSettings: {},
    } as any)
    setInitialEchipamentState({
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
      documentatie: [],
    } as any)
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

        // Verificăm și în baza de date dacă codul este unic pentru alți clienți
        if (isUnique && client.id) {
          try {
            const excludeEchipamentId =
              selectedEchipamentIndex !== null &&
              selectedLocatieIndex !== null &&
              locatii[selectedLocatieIndex].echipamente?.[selectedEchipamentIndex]?.id

            // În prezent API-ul suportă doar (code, clientId). Excluderea by ID nu este suportată aici.
            isUnique = await isEchipamentCodeUnique(echipamentFormData.cod, client.id)
          } catch (error) {
            console.error("Eroare la verificarea unicității codului:", error)
          }
        }

        setIsCodeUnique(isUnique)
        setIsCheckingCode(false)
      }
    }

    checkCodeUniqueness()
  }, [echipamentFormData.cod, locatii, selectedLocatieIndex, selectedEchipamentIndex, client.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)

      // Resetăm erorile de câmp
      const errors: string[] = []

      // Verificăm câmpurile obligatorii
      if (!formData.nume) errors.push("nume")
      if (!formData.telefon) errors.push("telefon")
      if (!formData.reprezentantFirma) errors.push("reprezentantFirma")



      // Verificăm dacă toate locațiile au nume și adresă
      locatii.forEach((locatie, index) => {
        if (!locatie.nume) errors.push(`locatii[${index}].nume`)
        if (!locatie.adresa) errors.push(`locatii[${index}].adresa`)

        // Verificăm dacă fiecare locație are cel puțin o persoană de contact validă
        const hasValidLocatieContact = locatie.persoaneContact.some((contact) => contact.nume && contact.telefon)
        if (!hasValidLocatieContact) errors.push(`locatii[${index}].persoaneContact`)
      })

      setFieldErrors(errors)

      if (errors.length > 0) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      if (!client.id) {
        throw new Error("ID-ul clientului lipsește")
      }

      // Filtrăm locațiile și persoanele de contact goale din locații
      const filteredLocatii = locatii
        .filter((locatie) => locatie.nume && locatie.adresa)
        .map((locatie) => ({
          ...locatie,
          persoaneContact: locatie.persoaneContact.filter((contact) => contact.nume && contact.telefon),
          echipamente: (locatie.echipamente || []).filter((e) => e.nume && e.cod),
        }))

      console.log("💾 Salvare client cu locații și echipamente:", {
        locatiiCount: filteredLocatii.length,
        echipamente: filteredLocatii.flatMap(l => l.echipamente || []).map(e => ({
          cod: e.cod,
          nume: e.nume,
          documentatieCount: (e as any).documentatie?.length || 0,
          documentatie: (e as any).documentatie
        }))
      })

      // Folosim prima persoană de contact din prima locație ca persoană de contact principală pentru compatibilitate
      const primaryContact =
        filteredLocatii.length > 0 && filteredLocatii[0].persoaneContact.length > 0
          ? filteredLocatii[0].persoaneContact[0]
          : null

      await updateClient(client.id, {
        ...formData,
        cui: formData.cif, // Mapăm cif → cui pentru consistență cu interfața
        regCom: formData.regCom || (client as any).regCom || "",
        // Nu setăm persoanaContact la nivel de client (schema folosește persoaneContact/locatii)
        locatii: filteredLocatii,
        ...(formData?.customFields ? { customFields: (formData as any).customFields } : {}),
      })

      // Update the initial state to match current state after successful save
      setInitialFormState({
        formData,
        locatii: JSON.stringify(locatii),
      })
      setFormModified(false) // Reset form modified state after successful submission
      if (onSuccess) onSuccess()
    } catch (err) {
      console.error("Eroare la actualizarea clientului:", err)
      setError("A apărut o eroare la actualizarea clientului. Încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"

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

  // Test function to show the dialog directly
  const showAlertDialogDirectly = () => {
    console.log("Showing alert dialog directly")
    setShowCloseAlert(true)
  }

  // Add the UnsavedChangesDialog at the end of the component
  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Informații Generale - 2 coloane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coloana 1 */}
        <div className="space-y-4">
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
            <Input id="cif" placeholder="Introduceți CIF/CUI" value={formData.cif} onChange={handleInputChange} />
          </div>

          <div className="space-y-2">
            <label htmlFor="regCom" className="text-sm font-medium">
              Nr. ordine ONRC (J-…)
            </label>
            <Input id="regCom" placeholder="Ex: J40/12345/2020" value={formData.regCom} onChange={handleInputChange} />
            <p className="text-xs text-muted-foreground">Vizibil doar pentru admin/dispecer.</p>
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
        </div>

        {/* Coloana 2 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="reprezentantFirma" className="text-sm font-medium">
              Reprezentant Firmă *
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
        </div>
      </div>

      {/* Setări dinamice (legate la Dialog: Client Nou) */}
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
          hideNumericDisplay={true}
        />
      </div>

      {/* Secțiunea pentru locații */}
      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium">Locații *</h3>
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
                      <label className="text-sm font-medium">Nume Locație *</label>
                      <Input
                        placeholder="Ex: Sediu Central, Punct de Lucru, etc."
                        value={locatie.nume}
                        onChange={(e) => handleLocatieChange(locatieIndex, "nume", e.target.value)}
                        className={hasError(`locatii[${locatieIndex}].nume`) ? errorStyle : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Adresă Locație *</label>
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
                      <h4 className="text-sm font-medium">Persoane de Contact pentru Locație *</h4>
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
                            <label className="text-sm font-medium">Nume *</label>
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
                            <label className="text-sm font-medium">Telefon *</label>
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
                        {/* …înlocuiește DOAR interiorul map-ului echipamente */}
                        {locatie.echipamente.map((echipament, echipamentIndex) => (
                          <div /* 1️⃣ devine flex-col & h-full */
                            key={echipamentIndex}
                            className="p-4 border rounded-md bg-gray-50 flex flex-col h-full"
                          >
                            {/* HEADER – nume + cod */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h5 className="font-medium truncate">{echipament.nume}</h5>
                                <Badge variant="outline" className="mt-1">
                                  Cod: {echipament.cod}
                                </Badge>
                              </div>
                            </div>

                            {/* DETALII – model / serie / date / observaţii */}
                            <div className="text-sm mt-2 space-y-1">
                              {echipament.model && <p>Model: {echipament.model}</p>}
                              {echipament.serie && <p>Serie: {echipament.serie}</p>}
                              {echipament.dataInstalare && (
                                <p className="text-xs text-gray-500">
                                  Instalat: {(() => { try { const { formatUiDate, toDateSafe } = require("@/lib/utils/time-format"); return formatUiDate(toDateSafe(echipament.dataInstalare)) } catch { return String(echipament.dataInstalare) } })()}
                                </p>
                              )}
                              {echipament.ultimaInterventie && (
                                <p className="text-xs text-gray-500">
                                  Ultima intervenție: {formatDate(echipament.ultimaInterventie)}
                                </p>
                              )}
                              {echipament.observatii && <p className="text-gray-600">{echipament.observatii}</p>}
                            </div>

                            {/* 2️⃣ ACTIUNI LA BAZĂ – mt-auto le împinge jos */}
                            <div className="flex items-center gap-2 pt-3 mt-auto">
                              <EquipmentQRCode
                                equipment={echipament}
                                clientName={formData.nume}
                                locationName={locatie.nume}
                                useSimpleFormat={true} // Format simplu pentru scanare mai ușoară
                              />

                             
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleOpenEditEchipamentDialog(locatieIndex, echipamentIndex, e)}
                                  className="h-8 w-8 p-0 shrink-0"
                                >
                                  <Wrench className="h-4 w-4" />
                                </Button>
                           

                              {isAdmin ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleDeleteEchipament(locatieIndex, echipamentIndex, e)}
                                  className="h-8 w-8 p-0 shrink-0 text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
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
            {selectedEchipamentIndex !== null && !isAdmin && (
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

            {/* Rând 1: Model și Serie */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

            {/* Rând 2: Data Instalare și Ultima Intervenție */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="dataInstalare" className="text-sm font-medium">
                  Data Instalării
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Input
                      id="dataInstalare_display"
                      value={echipamentDataInstalareInput}
                      onChange={(e) => setEchipamentDataInstalareInput(e.target.value)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) {
                          setEchipamentFormData((prev: any) => ({ ...prev, dataInstalare: "" }))
                          setEchipamentDataInstalareInput("")
                          return
                        }
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
                          const prevRaw = (echipamentFormData as any).dataInstalare
                          if (prevRaw) {
                            const prevDate = toDateSafe(prevRaw)
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
                        setEchipamentFormData((prev: any) => ({ ...prev, dataInstalare: iso }))
                        setEchipamentDataInstalareInput(formatUiDate(d))
                      }}
                      placeholder="dd mmm yyyy"
                      className="text-left"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto">
                    <CustomDatePicker
                      selectedDate={toDateSafe((echipamentFormData as any).dataInstalare) || new Date()}
                      onDateChange={(date) => {
                        if (!date) {
                          setEchipamentFormData((prev: any) => ({ ...prev, dataInstalare: "" }))
                          setEchipamentDataInstalareInput("")
                          return
                        }
                        const y = date.getFullYear()
                        const m = String(date.getMonth() + 1).padStart(2, "0")
                        const da = String(date.getDate()).padStart(2, "0")
                        const iso = `${y}-${m}-${da}`
                        setEchipamentFormData((prev: any) => ({ ...prev, dataInstalare: iso }))
                        setEchipamentDataInstalareInput(formatUiDate(date))
                      }}
                      onClose={() => {}}
                    />
                  </PopoverContent>
                </Popover>
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
              </div>
            </div>

            {/* Rând 3: Observații și Documentație pe 2 coloane */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Coloana 1: Observații */}
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
              </div>

              {/* Coloana 2: Documentație */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium mb-0">Documentație (PDF) – vizibil tehnicienilor</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDocsTemplateDialogOpen(true)}
                  >
                    Adaugă documentație
                  </Button>
                </div>
                
                {/* Selectare rapidă din documente template (dropdown simplu) */}
                <div className="space-y-2 p-3 border rounded-lg bg-blue-50 border-blue-200">
                  <label className="text-xs font-semibold text-blue-900">📋 Selectați Document din Template (Setări)</label>
                  <div className="flex gap-2">
                    <Select 
                      value={selectedTemplateDocument} 
                      onValueChange={setSelectedTemplateDocument}
                    >
                      <SelectTrigger className="flex-1 bg-white">
                        <SelectValue placeholder="Selectați un document template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templateDocuments.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nu există documente template în setări
                          </SelectItem>
                        ) : (
                          templateDocuments.map((doc) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.name} {doc.documentType && `(${doc.documentType})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!selectedTemplateDocument}
                      onClick={() => {
                        const doc = templateDocuments.find(d => d.id === selectedTemplateDocument)
                        if (!doc) return
                        
                        // Adaugă documentul template în lista de documentație
                        setEchipamentFormData((prev: any) => ({
                          ...prev,
                          documentatie: [
                            ...(prev.documentatie || []),
                            {
                              url: doc.url,
                              fileName: doc.name,
                              documentType: doc.documentType || "Template",
                              uploadedAt: new Date().toISOString(),
                              uploadedBy: userData?.displayName || "sistem"
                            }
                          ]
                        }))
                        setSelectedTemplateDocument("")
                        toast({ 
                          title: "Document adăugat", 
                          description: `"${doc.name}" a fost adăugat la documentație`
                        })
                      }}
                      className="shrink-0"
                    >
                      Adaugă
                    </Button>
                  </div>
                  <p className="text-xs text-blue-700">
                    Documentele template sunt definite în Setări → Variables → equipment.templateDocuments
                  </p>
                </div>
                
                {/* Afișare fișiere deja încărcate (din DB) */}
                {(echipamentFormData as any)?.documentatie?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-700">Documentație existentă:</p>
                    <div className="rounded-md border p-3 max-h-[120px] overflow-y-auto bg-green-50 border-green-200">
                      <ul className="text-sm space-y-2">
                        {(echipamentFormData as any).documentatie.map((d: any, idx: number) => (
                          <li key={idx} className="flex items-center justify-between gap-2 p-2 bg-white rounded border">
                            <div className="flex-1 min-w-0">
                              <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block font-medium">
                                {d.fileName}
                              </a>
                              {d.documentType && <p className="text-xs text-gray-500">Tip: {d.documentType}</p>}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEchipamentFormData((prev: any) => ({
                                  ...prev,
                                  documentatie: (prev.documentatie || []).filter((_: any, i: number) => i !== idx),
                                }))
                                toast({ title: "Document șters", description: "Documentul a fost șters din listă." })
                              }}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Mesaj când nu există nimic */}
                {!(echipamentFormData as any)?.documentatie?.length && (
                  <div className="text-xs text-muted-foreground text-center py-6 border rounded-md bg-gray-50">
                    Nu există documentație
                  </div>
                )}
              </div>
            </div>

            {/* Setări dinamice (legate la dialog) */}
            <div className="pt-2">
              <DynamicDialogFields
                targetId="dialogs.equipment.new"
                values={(echipamentFormData as any)?.dynamicSettings}
                onChange={(fieldKey, value) =>
                  setEchipamentFormData((prev: any) => ({
                    ...prev,
                    dynamicSettings: { ...(prev?.dynamicSettings || {}), [fieldKey]: value },
                  }))
                }
                hideNumericDisplay={true}
              />
            </div>

            {/* Check-list revizie per echipament */}
            <div className="pt-2">
              <div className="space-y-2 rounded-md border p-3">
                <label className="text-sm font-medium">Checklist revizie (șablon din Setări)</label>
                <TemplateSelector
                  valueId={(echipamentFormData as any)?.dynamicSettings?.["revision.checklistTemplateId"] || ""}
                  useForSheet={!!(echipamentFormData as any)?.dynamicSettings?.["revision.useChecklistForSheet"]}
                  parentId={(echipamentFormData as any)?.dynamicSettings?.["revision.checklistParentId"] || ""}
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
              </div>
            </div>
          </div>

          <div className="pt-2 flex-col gap-2 sm:flex-row flex">
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
                isCheckingCode
              }
              className="w-full sm:w-auto"
            >
              {isCheckingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificare cod...
                </>
              ) : isCheckingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificare...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

        {/* Alert Dialog for unsaved changes when clicking Cancel */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleCloseAttempt}>
          Anulează
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            "Salvează"
          )}
        </Button>
      </div>

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

      {/* Dialog selectare multiplă documente template (icon-uri) */}
      <EquipmentDocsTemplateDialog
        open={isDocsTemplateDialogOpen}
        onOpenChange={setIsDocsTemplateDialogOpen}
        onConfirm={(docs) => {
          if (!docs || docs.length === 0) return
          setEchipamentFormData((prev: any) => {
            const existing = prev.documentatie || []
            const existingKeys = new Set(
              existing.map((d: any) => `${String(d.url || "")}::${String(d.fileName || "")}`)
            )

            const now = new Date().toISOString()
            const additions = docs
              .filter((s) => s.documentUrl)
              .map((s) => ({
                url: s.documentUrl!,
                fileName: s.fileName || s.name,
                documentType: (s as any).parentName || "Template",
                uploadedAt: now,
                uploadedBy: userData?.displayName || userData?.email || "sistem",
              }))
              .filter((d) => {
                const key = `${d.url}::${d.fileName}`
                if (existingKeys.has(key)) return false
                existingKeys.add(key)
                return true
              })

          return {
              ...prev,
              documentatie: [...existing, ...additions],
            }
          })
        }}
      />
    </form>
  )
})

// Make sure to export the component
export { ClientEditForm }

// Subcomponent for template selection used in the equipment dialog
function TemplateSelector({
  valueId,
  useForSheet,
  parentId,
  onChange,
}: {
  valueId: string
  useForSheet: boolean
  parentId?: string
  onChange: (payload: { templateId: string; templateName: string; useForSheet: boolean }) => void
}) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [selectedId, setSelectedId] = useState<string>(valueId || "")
  // Always true and implicit; checkbox removed from UI
  const [useFlag] = useState<boolean>(true)
  const [childOpts, setChildOpts] = useState<Array<{ id: string; name: string }>>([])
  const [selectedChild, setSelectedChild] = useState<string>(parentId || "")

  useEffect(() => {
    const unsub = subscribeRevisionChecklistTemplates((settings: any[]) => {
      const opts = (settings || []).map((s: any) => ({ id: s.id, name: s.name || s.path || s.id }))
      setTemplates(opts)
      // Keep display name in sync if current selection is present
      const current = valueId || selectedId
      const sel = opts.find((o) => o.id === current)
      if (sel) {
        onChange({ templateId: sel.id, templateName: sel.name, useForSheet: true })
      } else if (opts.length > 0) {
        // Auto-select primul șablon dacă nu există o selecție
        setSelectedId(opts[0].id)
        onChange({ templateId: opts[0].id, templateName: opts[0].name, useForSheet: true })
      }
    })
    return () => {
      try { unsub?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedId(valueId || "")
  }, [valueId])

  // Keep selected child in sync with prop from Firestore
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
      // If the current selectedChild is not present and we have a parentId from props, try to select it
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
      {/* Selectorul de șablon este ascuns; se selectează automat primul șablon disponibil */}
      <div className="hidden" aria-hidden />
      {/* First-level category under selected template */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Fisa de operatiuni</label>
          <Select
            value={selectedChild}
            onValueChange={(id) => {
              setSelectedChild(id)
              // fire an app-level event so the parent can store it in dynamic settings alongside template
              try {
                const name = childOpts.find((o) => o.id === id)?.name || ""
                window.dispatchEvent(new CustomEvent("revision-template-child-change", {
                  detail: { parentId: id, parentName: name },
                } as any))
              } catch {}
            }}
            disabled={!selectedId || childOpts.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectedId ? "Selectați secțiunea" : "Alegeți întâi șablonul"} />
            </SelectTrigger>
            <SelectContent>
              {childOpts.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            În funcție de selecție, fișa va porni din această secțiune.
          </p>
        </div>
      </div>
     
    </div>
  )
}
