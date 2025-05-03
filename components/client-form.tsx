"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Plus, Trash2, MapPin, Wrench, AlertTriangle } from "lucide-react"
import { addClient, type PersoanaContact, type Locatie, type Echipament } from "@/lib/firebase/firestore"
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
// Import the unsaved changes hook and dialog
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
// Adăugați aceste importuri la începutul fișierului
import { DirectUnsavedChangesDialog } from "@/components/direct-unsaved-changes-dialog"

interface ClientFormProps {
  onSuccess?: (clientName: string) => void
  onCancel?: () => void
}

export function ClientForm({ onSuccess, onCancel }: ClientFormProps) {
  const [formData, setFormData] = useState({
    nume: "",
    cif: "", // Adăugăm CIF
    adresa: "",
    email: "",
  })

  // Adăugăm state pentru locații
  const [locatii, setLocatii] = useState<Locatie[]>([
    { nume: "", adresa: "", persoaneContact: [{ nume: "", telefon: "", email: "", functie: "" }], echipamente: [] },
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  // În componenta ClientForm, adăugați aceste state-uri:
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
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

  // Use the unsaved changes hook
  const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
    useUnsavedChanges(formModified)

  // Mark form as modified when any input changes
  // Adăugați acest efect pentru a detecta modificările formularului
  useEffect(() => {
    if (
      formData.nume ||
      formData.cif ||
      formData.adresa ||
      formData.email ||
      locatii.some((loc) => loc.nume || loc.adresa || loc.persoaneContact.some((p) => p.nume || p.telefon))
    ) {
      setFormModified(true)
    }
  }, [formData, locatii])

  // Reset form modified state after successful submission
  useEffect(() => {
    if (!isSubmitting && !error && formModified) {
      setFormModified(false)
    }
  }, [isSubmitting, error, formModified])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
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
    })
    setEchipamentFormErrors([])
    setIsCodeUnique(true)
    setIsEchipamentDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de editare echipament
  const handleOpenEditEchipamentDialog = (locatieIndex: number, echipamentIndex: number) => {
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

    setEchipamentFormData({ ...echipament })
    setEchipamentFormErrors([])
    setIsCodeUnique(true)
    setIsEchipamentDialogOpen(true)
  }

  // Funcție pentru modificarea datelor echipamentului
  const handleEchipamentInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setEchipamentFormData((prev) => ({ ...prev, [id]: value }))

    // Verificăm codul dacă acesta se schimbă
    if (id === "cod") {
      // Validăm formatul codului (4 litere + 4 cifre)
      if (!/^[A-Za-z]{4}\d{4}$/.test(value) && value !== "") {
        setEchipamentFormErrors((prev) => (prev.includes("cod") ? prev : [...prev, "cod"]))
      } else {
        setEchipamentFormErrors((prev) => prev.filter((error) => error !== "cod"))
      }
    }
  }

  // Funcție pentru salvarea echipamentului
  const handleSaveEchipament = () => {
    // Validăm datele echipamentului
    const errors: string[] = []

    if (!echipamentFormData.nume) errors.push("nume")
    if (!echipamentFormData.cod) errors.push("cod")

    // Validăm formatul codului (4 litere + 4 cifre)
    if (!/^[A-Za-z]{4}\d{4}$/.test(echipamentFormData.cod)) {
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
  const handleDeleteEchipament = (locatieIndex: number, echipamentIndex: number) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest echipament?")) {
      const updatedLocatii = [...locatii]
      updatedLocatii[locatieIndex].echipamente!.splice(echipamentIndex, 1)
      setLocatii(updatedLocatii)
    }
  }

  // Verificăm unicitatea codului de echipament
  useEffect(() => {
    const checkCodeUniqueness = async () => {
      if (echipamentFormData.cod && /^[A-Za-z]{4}\d{4}$/.test(echipamentFormData.cod)) {
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

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      // Resetăm erorile de câmp
      const errors: string[] = []

      // Verificăm câmpurile obligatorii
      if (!formData.nume) errors.push("nume")

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

      const newClient = {
        ...formData,
        persoanaContact: primaryContact ? primaryContact.nume : "",
        telefon: primaryContact ? primaryContact.telefon : "",
        numarLucrari: 0,
        locatii: filteredLocatii,
      }

      const clientId = await addClient(newClient)
      console.log("Client adăugat cu ID:", clientId)

      // Reset form modified state after successful submission
      setFormModified(false)

      // Notificăm componenta părinte despre succesul adăugării
      if (onSuccess) {
        onSuccess(formData.nume)
      }
    } catch (err) {
      console.error("Eroare la adăugarea clientului:", err)
      setError("A apărut o eroare la adăugarea clientului. Încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle cancel with confirmation if form is modified
  // Înlocuiți funcția handleCancel cu aceasta:
  const handleCancel = () => {
    if (formModified) {
      setShowUnsavedDialog(true)
    } else if (onCancel) {
      onCancel()
    }
  }

  // Adăugați aceste funcții:
  const confirmCancel = () => {
    setShowUnsavedDialog(false)
    if (onCancel) {
      onCancel()
    }
  }

  const handleDialogCancel = () => {
    setShowUnsavedDialog(false)
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"

  return (
    <div className="space-y-4">
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
                        {locatie.echipamente.map((echipament, echipamentIndex) => (
                          <div
                            key={echipamentIndex}
                            className="p-4 border rounded-md bg-gray-50 relative overflow-hidden"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h5 className="font-medium">{echipament.nume}</h5>
                                <Badge variant="outline" className="mt-1">
                                  Cod: {echipament.cod}
                                </Badge>
                              </div>
                              <div className="flex space-x-1 flex-shrink-0">
                                <EquipmentQRCode
                                  equipment={echipament}
                                  clientName={formData.nume}
                                  locationName={locatie.nume}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditEchipamentDialog(locatieIndex, echipamentIndex)}
                                  className="h-8 w-8 p-0 flex-shrink-0"
                                >
                                  <Wrench className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteEchipament(locatieIndex, echipamentIndex)}
                                  className="h-8 w-8 p-0 text-red-500 flex-shrink-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                                {echipament.dataInstalare && <p>Instalat: {echipament.dataInstalare}</p>}
                                {echipament.ultimaInterventie && (
                                  <p>Ultima intervenție: {echipament.ultimaInterventie}</p>
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
      <Dialog open={isEchipamentDialogOpen} onOpenChange={setIsEchipamentDialogOpen}>
        <DialogContent className="sm:max-w-[500px] w-[95%] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEchipamentIndex !== null ? "Editare Echipament" : "Adăugare Echipament Nou"}
            </DialogTitle>
            <DialogDescription>
              Completați detaliile echipamentului. Codul trebuie să fie unic și format din 4 litere + 4 cifre.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-3 overflow-y-auto">
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
                <label htmlFor="cod" className="text-sm font-medium">
                  Cod Unic (4 litere + 4 cifre) *
                </label>
                <Input
                  id="cod"
                  placeholder="Ex: ABCD1234"
                  value={echipamentFormData.cod}
                  onChange={handleEchipamentInputChange}
                  className={echipamentFormErrors.includes("cod") || !isCodeUnique ? errorStyle : ""}
                  maxLength={8}
                />
                {echipamentFormErrors.includes("cod") && (
                  <p className="text-xs text-red-500">Codul trebuie să conțină exact 4 litere urmate de 4 cifre</p>
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
          </div>

          <DialogFooter className="pt-2 flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsEchipamentDialogOpen(false)} className="w-full sm:w-auto">
              Anulează
            </Button>
            <Button
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

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={handleCancel}>
          Anulează
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            "Salvează"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowUnsavedDialog(true)}
          className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
        >
          Test Dialog
        </Button>
      </div>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        open={showDialog}
        onConfirm={pendingUrl === "#cancel" ? confirmCancel : confirmNavigation}
        onCancel={cancelNavigation}
      />
      {/* La sfârșitul componentei, înainte de ultimul </div>, adăugați: */}
      <DirectUnsavedChangesDialog open={showUnsavedDialog} onConfirm={confirmCancel} onCancel={handleDialogCancel} />
    </div>
  )
}
