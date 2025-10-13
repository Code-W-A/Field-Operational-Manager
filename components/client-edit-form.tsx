"use client"

import { DialogFooter } from "@/components/ui/dialog"

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
import { formatDate } from "@/lib/utils/time-format"
// Import the unsaved changes hook and dialog
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
import { useAuth } from "@/contexts/AuthContext"
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
  })
  const [echipamentFormErrors, setEchipamentFormErrors] = useState<string[]>([])
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [isCodeUnique, setIsCodeUnique] = useState(true)
  
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
    // Verificăm dacă se încearcă să se introducă telefonul principal la o persoană de contact
    if (field === "telefon" && value.trim() && formData.telefon.trim() && value.trim() === formData.telefon.trim()) {
      toast({
        title: "Telefon duplicat",
        description: "Acest număr de telefon este deja folosit ca telefon principal al clientului.",
        variant: "destructive",
      })
      return
    }

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

    setEchipamentFormData({ ...echipament })
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
  const handleSaveEchipament = () => {
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

    const updatedLocatii = [...locatii]

    // Ne asigurăm că locația are array-ul de echipamente inițializat
    if (!updatedLocatii[selectedLocatieIndex].echipamente) {
      updatedLocatii[selectedLocatieIndex].echipamente = []
    }

    // Adăugăm sau actualizăm echipamentul
    if (selectedEchipamentIndex !== null) {
      // Editare echipament existent
      updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex] = {
        ...echipamentFormData,
        id: updatedLocatii[selectedLocatieIndex].echipamente![selectedEchipamentIndex].id,
      }
    } else {
      // Adăugare echipament nou
      updatedLocatii[selectedLocatieIndex].echipamente!.push({
        ...echipamentFormData,
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })
    }

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
    } as any)
    setInitialEchipamentState({
      nume: "",
      cod: "",
      model: "",
      serie: "",
      dataInstalare: "",
      ultimaInterventie: "",
      observatii: "",
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
    <form className="space-y-4" onSubmit={handleSubmit}>
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

      {/* Rand 1: Reprezentant firmă — Telefon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                <p className="text-xs text-gray-500">Instalat: {formatDate(echipament.dataInstalare)}</p>
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
        <DialogContent className="sm:max-w-[500px] w-[95%] max-h-[90vh] overflow-y-auto">
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

          <div className="grid gap-3 py-3 overflow-y-auto">
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
                <Input
                  id="dataInstalare"
                  type="date"
                  value={echipamentFormData.dataInstalare || ""}
                  onChange={handleEchipamentInputChange}
                  lang="ro"
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="ultimaInterventie" className="text-sm font-medium">
                  Ultima Intervenție
                </label>
                <Input
                  id="ultimaInterventie"
                  type="date"
                  value={echipamentFormData.ultimaInterventie || ""}
                  onChange={handleEchipamentInputChange}
                  lang="ro"
                  placeholder="dd/mm/yyyy"
                />
              </div>
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
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="garantieLuni" className="text-sm font-medium">
                Garanție (luni)
              </label>
              <Input
                id="garantieLuni"
                type="number"
                min="1"
                placeholder="12"
                value={echipamentFormData.garantieLuni || ""}
                onChange={handleEchipamentInputChange}
              />
              <p className="text-xs text-muted-foreground">
                Perioada de garanție în luni (implicit 12 luni dacă nu se completează)
              </p>
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
                isCheckingCode
              }
              className="w-full sm:w-auto"
            >
              {isCheckingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificare...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
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
    </form>
  )
})

// Make sure to export the component
export { ClientEditForm }
