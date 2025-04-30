"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CustomDatePicker } from "@/components/custom-date-picker"
import { TimeSelector } from "@/components/time-selector"
import { Checkbox } from "@/components/ui/checkbox"
import { ContractSelect } from "@/components/contract-select"
import { getAllClients, getClientLocations, getLocationContactPersons } from "@/lib/firebase/clients"
import { getEquipmentsByLocation } from "@/lib/firebase/equipment"
import { getUsersByRole } from "@/lib/firebase/auth"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import type { Equipment } from "@/types/equipment"
import { toast } from "@/components/ui/use-toast"

interface LucrareFormProps {
  dataEmiterii: Date | undefined
  setDataEmiterii: (date: Date | undefined) => void
  dataInterventie: Date | undefined
  setDataInterventie: (date: Date | undefined) => void
  formData: {
    tipLucrare: string
    tehnicieni: string[]
    client: string
    locatie: string
    descriere: string
    persoanaContact: string
    telefon: string
    statusLucrare: string
    statusFacturare: string
    contract?: string
    contractNumber?: string
    defectReclamat?: string
  }
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleSelectChange: (id: string, value: string) => void
  handleTehnicieniChange: (value: string) => void
  fieldErrors: string[]
  onSubmit: () => void
  onCancel: () => void
  isEdit?: boolean
  initialData?: any
}

export function LucrareForm({
  dataEmiterii,
  setDataEmiterii,
  dataInterventie,
  setDataInterventie,
  formData,
  handleInputChange,
  handleSelectChange,
  handleTehnicieniChange,
  fieldErrors,
  onSubmit,
  onCancel,
  isEdit = false,
  initialData,
}: LucrareFormProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [tehnicians, setTehnicians] = useState<{ id: string; name: string }[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)
  const [isLoadingContactPersons, setIsLoadingContactPersons] = useState(false)
  const [isLoadingEquipment, setIsLoadingEquipment] = useState(false)
  const [isLoadingTehnicians, setIsLoadingTehnicians] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")

  // Încărcăm clienții la montarea componentei
  useEffect(() => {
    const loadClients = async () => {
      setIsLoadingClients(true)
      try {
        const clientsData = await getAllClients()
        setClients(clientsData)
      } catch (error) {
        console.error("Error loading clients:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca clienții",
          variant: "destructive",
        })
      } finally {
        setIsLoadingClients(false)
      }
    }

    loadClients()
  }, [])

  // Încărcăm tehnicienii la montarea componentei
  useEffect(() => {
    const loadTehnicians = async () => {
      setIsLoadingTehnicians(true)
      try {
        const tehnicianUsers = await getUsersByRole("tehnician")
        setTehnicians(
          tehnicianUsers.map((user) => ({
            id: user.displayName || "",
            name: user.displayName || "",
          })),
        )
      } catch (error) {
        console.error("Error loading tehnicians:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca tehnicienii",
          variant: "destructive",
        })
      } finally {
        setIsLoadingTehnicians(false)
      }
    }

    loadTehnicians()
  }, [])

  // Încărcăm locațiile când se schimbă clientul
  useEffect(() => {
    if (!formData.client) {
      setLocations([])
      setContactPersons([])
      setEquipment([])
      return
    }

    const loadLocations = async () => {
      setIsLoadingLocations(true)
      try {
        setSelectedClientId(formData.client)
        const locationsData = await getClientLocations(formData.client)
        setLocations(locationsData)
      } catch (error) {
        console.error("Error loading locations:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca locațiile",
          variant: "destructive",
        })
      } finally {
        setIsLoadingLocations(false)
      }
    }

    loadLocations()
  }, [formData.client])

  // Încărcăm persoanele de contact și echipamentele când se schimbă locația
  useEffect(() => {
    if (!formData.client || !formData.locatie) {
      setContactPersons([])
      setEquipment([])
      return
    }

    const loadContactPersons = async () => {
      setIsLoadingContactPersons(true)
      try {
        setSelectedLocationId(formData.locatie)
        const contactPersonsData = await getLocationContactPersons(formData.client, formData.locatie)
        setContactPersons(contactPersonsData)
      } catch (error) {
        console.error("Error loading contact persons:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca persoanele de contact",
          variant: "destructive",
        })
      } finally {
        setIsLoadingContactPersons(false)
      }
    }

    const loadEquipment = async () => {
      setIsLoadingEquipment(true)
      try {
        const equipmentData = await getEquipmentsByLocation(formData.locatie)
        setEquipment(equipmentData)
      } catch (error) {
        console.error("Error loading equipment:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca echipamentele",
          variant: "destructive",
        })
      } finally {
        setIsLoadingEquipment(false)
      }
    }

    loadContactPersons()
    loadEquipment()
  }, [formData.client, formData.locatie])

  // Actualizăm telefonul când se schimbă persoana de contact
  useEffect(() => {
    if (formData.persoanaContact && contactPersons.length > 0) {
      const selectedPerson = contactPersons.find((person) => person.id === formData.persoanaContact)
      if (selectedPerson) {
        handleInputChange({
          target: { id: "telefon", value: selectedPerson.phone },
        } as React.ChangeEvent<HTMLInputElement>)
      }
    }
  }, [formData.persoanaContact, contactPersons, handleInputChange])

  // Funcție pentru a gestiona schimbarea clientului
  const handleClientChange = (value: string) => {
    handleSelectChange("client", value)
    handleSelectChange("locatie", "")
    handleSelectChange("persoanaContact", "")
  }

  // Funcție pentru a gestiona schimbarea locației
  const handleLocationChange = (value: string) => {
    handleSelectChange("locatie", value)
    handleSelectChange("persoanaContact", "")
  }

  // Funcție pentru a gestiona schimbarea persoanei de contact
  const handleContactPersonChange = (value: string) => {
    handleSelectChange("persoanaContact", value)
  }

  // Funcție pentru a gestiona schimbarea echipamentului
  const handleEquipmentChange = (value: string) => {
    // Aici puteți adăuga logica pentru a actualiza câmpul de echipament
    // De exemplu, puteți adăuga un câmp nou în formData pentru echipament
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataEmiterii">Data emiterii</Label>
          <CustomDatePicker date={dataEmiterii} setDate={setDataEmiterii} />
          {fieldErrors.includes("dataEmiterii") && (
            <p className="text-sm text-destructive">Data emiterii este obligatorie</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataInterventie">Data intervenție</Label>
          <div className="flex space-x-2">
            <div className="flex-1">
              <CustomDatePicker date={dataInterventie} setDate={setDataInterventie} />
            </div>
            <div className="w-24">
              <TimeSelector
                value={
                  dataInterventie
                    ? `${dataInterventie.getHours().toString().padStart(2, "0")}:${dataInterventie.getMinutes().toString().padStart(2, "0")}`
                    : "09:00"
                }
                onChange={(time) => {
                  if (dataInterventie) {
                    const [hours, minutes] = time.split(":").map(Number)
                    const newDate = new Date(dataInterventie)
                    newDate.setHours(hours, minutes)
                    setDataInterventie(newDate)
                  }
                }}
              />
            </div>
          </div>
          {fieldErrors.includes("dataInterventie") && (
            <p className="text-sm text-destructive">Data intervenției este obligatorie</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tipLucrare">Tip lucrare</Label>
        <Select value={formData.tipLucrare} onValueChange={(value) => handleSelectChange("tipLucrare", value)}>
          <SelectTrigger id="tipLucrare">
            <SelectValue placeholder="Selectează tipul lucrării" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Intervenție în contract">Intervenție în contract</SelectItem>
            <SelectItem value="Intervenție contra cost">Intervenție contra cost</SelectItem>
            <SelectItem value="Instalare">Instalare</SelectItem>
            <SelectItem value="Mentenanță">Mentenanță</SelectItem>
            <SelectItem value="Verificare">Verificare</SelectItem>
          </SelectContent>
        </Select>
        {fieldErrors.includes("tipLucrare") && (
          <p className="text-sm text-destructive">Tipul lucrării este obligatoriu</p>
        )}
      </div>

      {formData.tipLucrare === "Intervenție în contract" && (
        <div className="space-y-2">
          <Label htmlFor="contract">Contract</Label>
          <ContractSelect
            value={formData.contract}
            onChange={(value) => handleSelectChange("contract", value)}
            clientId={formData.client}
            contractNumber={formData.contractNumber}
            onContractNumberChange={(value) => handleSelectChange("contractNumber", value)}
          />
          {fieldErrors.includes("contract") && (
            <p className="text-sm text-destructive">Contractul este obligatoriu pentru acest tip de lucrare</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="client">Client</Label>
        <Select value={formData.client} onValueChange={handleClientChange} disabled={isLoadingClients}>
          <SelectTrigger id="client">
            <SelectValue placeholder="Selectează clientul" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id || ""}>
                {client.name} {client.cif ? `(CIF: ${client.cif})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.includes("client") && <p className="text-sm text-destructive">Clientul este obligatoriu</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="locatie">Locație</Label>
        <Select
          value={formData.locatie}
          onValueChange={handleLocationChange}
          disabled={isLoadingLocations || !formData.client || locations.length === 0}
        >
          <SelectTrigger id="locatie">
            <SelectValue placeholder="Selectează locația" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name} ({location.address}, {location.city})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="persoanaContact">Persoană contact</Label>
        <Select
          value={formData.persoanaContact}
          onValueChange={handleContactPersonChange}
          disabled={isLoadingContactPersons || !formData.locatie || contactPersons.length === 0}
        >
          <SelectTrigger id="persoanaContact">
            <SelectValue placeholder="Selectează persoana de contact" />
          </SelectTrigger>
          <SelectContent>
            {contactPersons.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name} ({person.position}) - {person.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.includes("persoanaContact") && (
          <p className="text-sm text-destructive">Persoana de contact este obligatorie</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefon">Telefon</Label>
        <Input
          id="telefon"
          value={formData.telefon}
          onChange={handleInputChange}
          placeholder="Telefon persoană contact"
        />
        {fieldErrors.includes("telefon") && <p className="text-sm text-destructive">Telefonul este obligatoriu</p>}
      </div>

      {equipment.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="echipament">Echipament</Label>
          <Select onValueChange={handleEquipmentChange} disabled={isLoadingEquipment || equipment.length === 0}>
            <SelectTrigger id="echipament">
              <SelectValue placeholder="Selectează echipamentul" />
            </SelectTrigger>
            <SelectContent>
              {equipment.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} (Cod: {item.code}) - {item.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="descriere">Descriere</Label>
        <Textarea
          id="descriere"
          value={formData.descriere}
          onChange={handleInputChange}
          placeholder="Descriere lucrare"
        />
      </div>

      {formData.tipLucrare === "Intervenție în contract" && (
        <div className="space-y-2">
          <Label htmlFor="defectReclamat">Defect reclamat</Label>
          <Textarea
            id="defectReclamat"
            value={formData.defectReclamat}
            onChange={handleInputChange}
            placeholder="Descriere defect reclamat"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Tehnicieni</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {tehnicians.map((tehnician) => (
            <div key={tehnician.id} className="flex items-center space-x-2">
              <Checkbox
                id={`tehnician-${tehnician.id}`}
                checked={formData.tehnicieni.includes(tehnician.id)}
                onCheckedChange={() => handleTehnicieniChange(tehnician.id)}
              />
              <Label htmlFor={`tehnician-${tehnician.id}`} className="text-sm">
                {tehnician.name}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="statusLucrare">Status lucrare</Label>
          <Select value={formData.statusLucrare} onValueChange={(value) => handleSelectChange("statusLucrare", value)}>
            <SelectTrigger id="statusLucrare">
              <SelectValue placeholder="Selectează statusul lucrării" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="În așteptare">În așteptare</SelectItem>
              <SelectItem value="În curs">În curs</SelectItem>
              <SelectItem value="Finalizată">Finalizată</SelectItem>
              <SelectItem value="Anulată">Anulată</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="statusFacturare">Status facturare</Label>
          <Select
            value={formData.statusFacturare}
            onValueChange={(value) => handleSelectChange("statusFacturare", value)}
          >
            <SelectTrigger id="statusFacturare">
              <SelectValue placeholder="Selectează statusul facturării" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Nefacturat">Nefacturat</SelectItem>
              <SelectItem value="Facturat">Facturat</SelectItem>
              <SelectItem value="Plătit">Plătit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Anulare
        </Button>
        <Button onClick={onSubmit}>{isEdit ? "Actualizare" : "Adăugare"}</Button>
      </div>
    </div>
  )
}
