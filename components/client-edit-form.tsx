"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react"
import { updateClient, type Client, type PersoanaContact } from "@/lib/firebase/firestore"

interface ClientEditFormProps {
  client: Client
  onSuccess?: () => void
  onCancel?: () => void
}

export function ClientEditForm({ client, onSuccess, onCancel }: ClientEditFormProps) {
  const [formData, setFormData] = useState({
    nume: client.nume || "",
    adresa: client.adresa || "",
    email: client.email || "",
  })

  // Adăugăm state pentru persoanele de contact
  const [persoaneContact, setPersoaneContact] = useState<PersoanaContact[]>(
    client.persoaneContact && client.persoaneContact.length > 0
      ? client.persoaneContact
      : [{ nume: client.persoanaContact || "", telefon: client.telefon || "", email: "", functie: "" }],
  )

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

      setFieldErrors(errors)

      if (errors.length > 0) {
        setError("Vă rugăm să completați toate câmpurile obligatorii")
        setIsSubmitting(false)
        return
      }

      if (!client.id) {
        throw new Error("ID-ul clientului lipsește")
      }

      // Filtrăm persoanele de contact goale
      const filteredContacts = persoaneContact.filter((contact) => contact.nume && contact.telefon)

      // Folosim prima persoană de contact ca persoană de contact principală pentru compatibilitate
      const primaryContact = filteredContacts.length > 0 ? filteredContacts[0] : null

      await updateClient(client.id, {
        ...formData,
        persoanaContact: primaryContact ? primaryContact.nume : "",
        telefon: primaryContact ? primaryContact.telefon : "",
        persoaneContact: filteredContacts,
      })

      // Notificăm componenta părinte despre succesul actualizării
      if (onSuccess) {
        onSuccess()
      }
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
        <label htmlFor="adresa" className="text-sm font-medium">
          Adresă
        </label>
        <Input id="adresa" placeholder="Introduceți adresa" value={formData.adresa} onChange={handleInputChange} />
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

      {/* Secțiunea pentru persoane de contact */}
      <div className="space-y-4 mt-6 border-t pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium">Persoane de Contact *</h3>
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
