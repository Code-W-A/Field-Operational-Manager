"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Plus, Trash2, MapPin } from "lucide-react"
import { addClient, type PersoanaContact, type Locatie } from "@/lib/firebase/firestore"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"

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

  // Adăugăm state pentru persoanele de contact
  const [persoaneContact, setPersoaneContact] = useState<PersoanaContact[]>([
    { nume: "", telefon: "", email: "", functie: "" },
  ])

  // Adăugăm state pentru locații
  const [locatii, setLocatii] = useState<Locatie[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  // Adăugăm funcție pentru gestionarea modificărilor în persoanele de contact
  const handleContactChange = (index: number, field: keyof PersoanaContact, value: string) => {
    const updatedContacts = [...persoaneContact]
    updatedContacts[index] = { ...updatedContacts[index], [field]: value }
    setPersoaneContact(updatedContacts)
  }

  // Adăugăm funcție pentru adăugarea unei noi persoane de contact
  const handleAddContact = () => {
    setPersoaneContact([...persoaneContact, { nume: "", telefon: "", email: "", functie: "" }])
  }

  // Adăugăm funcție pentru ștergerea unei persoane de contact
  const handleRemoveContact = (index: number) => {
    if (persoaneContact.length > 1) {
      const updatedContacts = [...persoaneContact]
      updatedContacts.splice(index, 1)
      setPersoaneContact(updatedContacts)
    }
  }

  // Adăugăm funcție pentru adăugarea unei noi locații
  const handleAddLocatie = () => {
    setLocatii([
      ...locatii,
      { nume: "", adresa: "", persoaneContact: [{ nume: "", telefon: "", email: "", functie: "" }] },
    ])
  }

  // Adăugăm funcție pentru ștergerea unei locații
  const handleRemoveLocatie = (index: number) => {
    const updatedLocatii = [...locatii]
    updatedLocatii.splice(index, 1)
    setLocatii(updatedLocatii)
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

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      // Resetăm erorile de câmp
      const errors: string[] = []

      // Verificăm câmpurile obligatorii
      if (!formData.nume) errors.push("nume")

      // Verificăm dacă cel puțin o persoană de contact are nume și telefon
      const hasValidContact = persoaneContact.some((contact) => contact.nume && contact.telefon)
      if (!hasValidContact) {
        errors.push("persoaneContact")
      }

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

      // Filtrăm persoanele de contact goale
      const filteredContacts = persoaneContact.filter((contact) => contact.nume && contact.telefon)

      // Filtrăm locațiile și persoanele de contact goale din locații
      const filteredLocatii = locatii
        .filter((locatie) => locatie.nume && locatie.adresa)
        .map((locatie) => ({
          ...locatie,
          persoaneContact: locatie.persoaneContact.filter((contact) => contact.nume && contact.telefon),
        }))

      // Folosim prima persoană de contact ca persoană de contact principală pentru compatibilitate
      const primaryContact = filteredContacts.length > 0 ? filteredContacts[0] : null

      const newClient = {
        ...formData,
        persoanaContact: primaryContact ? primaryContact.nume : "",
        telefon: primaryContact ? primaryContact.telefon : "",
        numarLucrari: 0,
        persoaneContact: filteredContacts,
        locatii: filteredLocatii,
      }

      const clientId = await addClient(newClient)
      console.log("Client adăugat cu ID:", clientId)

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

      {/* Secțiunea pentru persoane de contact principale */}
      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium">Persoane de Contact Principale *</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddContact} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" /> Adaugă
          </Button>
        </div>

        {persoaneContact.map((contact, index) => (
          <div key={index} className="p-4 border rounded-md space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium">Persoana de contact #{index + 1}</h4>
              {persoaneContact.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveContact(index)}
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
                  onChange={(e) => handleContactChange(index, "nume", e.target.value)}
                  className={hasError("persoaneContact") && !contact.nume ? errorStyle : ""}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon *</label>
                <Input
                  placeholder="Număr de telefon"
                  value={contact.telefon}
                  onChange={(e) => handleContactChange(index, "telefon", e.target.value)}
                  className={hasError("persoaneContact") && !contact.telefon ? errorStyle : ""}
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
                  onChange={(e) => handleContactChange(index, "email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Funcție</label>
                <Input
                  placeholder="Funcție"
                  value={contact.functie || ""}
                  onChange={(e) => handleContactChange(index, "functie", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secțiunea pentru locații */}
      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium">Locații</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddLocatie} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" /> Adaugă Locație
          </Button>
        </div>

        {locatii.length === 0 && (
          <div className="text-center p-4 border border-dashed rounded-md">
            <p className="text-muted-foreground">
              Nu există locații adăugate. Adăugați o locație folosind butonul de mai sus.
            </p>
          </div>
        )}

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
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
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
      </div>
    </div>
  )
}
