"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Pencil, Trash2, Plus } from "lucide-react"
import type { Client, ClientLocation } from "@/types/client"
import { ContactPersonsManager } from "./contact-persons-manager"
import { toast } from "@/components/ui/use-toast"
import { updateClient } from "@/lib/firebase/clients"

interface ClientLocationsManagerProps {
  client: Client
  onUpdate: (updatedClient: Client) => void
}

export function ClientLocationsManager({ client, onUpdate }: ClientLocationsManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<ClientLocation | null>(null)
  const [activeTab, setActiveTab] = useState<string>(client.locations[0]?.id || "general")
  const [formData, setFormData] = useState<Omit<ClientLocation, "id" | "contactPersons">>({
    name: "",
    address: "",
    city: "",
    county: "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleAddLocation = () => {
    if (!formData.name || !formData.address || !formData.city) {
      toast({
        title: "Eroare",
        description: "Numele, adresa și orașul sunt obligatorii",
        variant: "destructive",
      })
      return
    }

    const newLocation: ClientLocation = {
      id: `loc_${Date.now()}`,
      ...formData,
      contactPersons: [],
    }

    const updatedClient = {
      ...client,
      locations: [...client.locations, newLocation],
    }

    updateClient(client.id!, updatedClient)
      .then(() => {
        onUpdate(updatedClient)
        setActiveTab(newLocation.id)
        toast({
          title: "Succes",
          description: "Locația a fost adăugată cu succes",
        })
      })
      .catch((error) => {
        console.error("Error adding location:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la adăugarea locației",
          variant: "destructive",
        })
      })

    setFormData({
      name: "",
      address: "",
      city: "",
      county: "",
    })
    setIsAddDialogOpen(false)
  }

  const handleEditLocation = () => {
    if (!currentLocation) return
    if (!formData.name || !formData.address || !formData.city) {
      toast({
        title: "Eroare",
        description: "Numele, adresa și orașul sunt obligatorii",
        variant: "destructive",
      })
      return
    }

    const updatedLocations = client.locations.map((loc) =>
      loc.id === currentLocation.id
        ? {
            ...loc,
            name: formData.name,
            address: formData.address,
            city: formData.city,
            county: formData.county,
          }
        : loc,
    )

    const updatedClient = {
      ...client,
      locations: updatedLocations,
    }

    updateClient(client.id!, updatedClient)
      .then(() => {
        onUpdate(updatedClient)
        toast({
          title: "Succes",
          description: "Locația a fost actualizată cu succes",
        })
      })
      .catch((error) => {
        console.error("Error updating location:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la actualizarea locației",
          variant: "destructive",
        })
      })

    setIsEditDialogOpen(false)
  }

  const handleDeleteLocation = (locationId: string) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți această locație?")) {
      const updatedLocations = client.locations.filter((loc) => loc.id !== locationId)
      const updatedClient = {
        ...client,
        locations: updatedLocations,
      }

      updateClient(client.id!, updatedClient)
        .then(() => {
          onUpdate(updatedClient)
          setActiveTab(updatedLocations[0]?.id || "general")
          toast({
            title: "Succes",
            description: "Locația a fost ștearsă cu succes",
          })
        })
        .catch((error) => {
          console.error("Error deleting location:", error)
          toast({
            title: "Eroare",
            description: "A apărut o eroare la ștergerea locației",
            variant: "destructive",
          })
        })
    }
  }

  const openEditDialog = (location: ClientLocation) => {
    setCurrentLocation(location)
    setFormData({
      name: location.name,
      address: location.address,
      city: location.city,
      county: location.county || "",
    })
    setIsEditDialogOpen(true)
  }

  const handleAddContactPerson = (locationId: string, person: any) => {
    const updatedLocations = client.locations.map((loc) => {
      if (loc.id === locationId) {
        return {
          ...loc,
          contactPersons: [...loc.contactPersons, { id: `person_${Date.now()}`, ...person }],
        }
      }
      return loc
    })

    const updatedClient = {
      ...client,
      locations: updatedLocations,
    }

    updateClient(client.id!, updatedClient)
      .then(() => {
        onUpdate(updatedClient)
        toast({
          title: "Succes",
          description: "Persoana de contact a fost adăugată cu succes",
        })
      })
      .catch((error) => {
        console.error("Error adding contact person:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la adăugarea persoanei de contact",
          variant: "destructive",
        })
      })
  }

  const handleUpdateContactPerson = (locationId: string, personId: string, personData: any) => {
    const updatedLocations = client.locations.map((loc) => {
      if (loc.id === locationId) {
        return {
          ...loc,
          contactPersons: loc.contactPersons.map((person) =>
            person.id === personId ? { ...person, ...personData } : person,
          ),
        }
      }
      return loc
    })

    const updatedClient = {
      ...client,
      locations: updatedLocations,
    }

    updateClient(client.id!, updatedClient)
      .then(() => {
        onUpdate(updatedClient)
        toast({
          title: "Succes",
          description: "Persoana de contact a fost actualizată cu succes",
        })
      })
      .catch((error) => {
        console.error("Error updating contact person:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la actualizarea persoanei de contact",
          variant: "destructive",
        })
      })
  }

  const handleDeleteContactPerson = (locationId: string, personId: string) => {
    const updatedLocations = client.locations.map((loc) => {
      if (loc.id === locationId) {
        return {
          ...loc,
          contactPersons: loc.contactPersons.filter((person) => person.id !== personId),
        }
      }
      return loc
    })

    const updatedClient = {
      ...client,
      locations: updatedLocations,
    }

    updateClient(client.id!, updatedClient)
      .then(() => {
        onUpdate(updatedClient)
        toast({
          title: "Succes",
          description: "Persoana de contact a fost ștearsă cu succes",
        })
      })
      .catch((error) => {
        console.error("Error deleting contact person:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la ștergerea persoanei de contact",
          variant: "destructive",
        })
      })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Locații și persoane de contact</CardTitle>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adaugă locație
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {client.locations.length === 0 ? (
          <div className="text-center p-4 border rounded-md bg-muted/50">
            <p className="text-muted-foreground">Nu există locații adăugate</p>
            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adaugă prima locație
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              {client.locations.map((location) => (
                <TabsTrigger key={location.id} value={location.id}>
                  {location.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {client.locations.map((location) => (
              <TabsContent key={location.id} value={location.id} className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-medium">{location.name}</h3>
                    <p className="text-muted-foreground">
                      {location.address}, {location.city}
                      {location.county && `, ${location.county}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEditDialog(location)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleDeleteLocation(location.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <ContactPersonsManager
                  contactPersons={location.contactPersons}
                  onAdd={(person) => handleAddContactPerson(location.id, person)}
                  onUpdate={(personId, personData) => handleUpdateContactPerson(location.id, personId, personData)}
                  onDelete={(personId) => handleDeleteContactPerson(location.id, personId)}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>

      {/* Dialog pentru adăugare locație */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă locație nouă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume locație *</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} placeholder="Nume locație" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresă *</Label>
              <Input id="address" value={formData.address} onChange={handleInputChange} placeholder="Adresă" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Oraș *</Label>
              <Input id="city" value={formData.city} onChange={handleInputChange} placeholder="Oraș" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">Județ</Label>
              <Input id="county" value={formData.county} onChange={handleInputChange} placeholder="Județ" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleAddLocation}>Adaugă</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru editare locație */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează locație</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume locație *</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} placeholder="Nume locație" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresă *</Label>
              <Input id="address" value={formData.address} onChange={handleInputChange} placeholder="Adresă" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Oraș *</Label>
              <Input id="city" value={formData.city} onChange={handleInputChange} placeholder="Oraș" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">Județ</Label>
              <Input id="county" value={formData.county} onChange={handleInputChange} placeholder="Județ" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleEditLocation}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
