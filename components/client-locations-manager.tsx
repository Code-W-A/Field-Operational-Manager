"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, Users } from "lucide-react"
import { ContactPersonsManager } from "./contact-persons-manager"
import type { ClientLocation, ContactPerson } from "@/types/client"

interface ClientLocationsManagerProps {
  locations: ClientLocation[]
  onChange: (locations: ClientLocation[]) => void
}

export function ClientLocationsManager({ locations, onChange }: ClientLocationsManagerProps) {
  const [activeLocationIndex, setActiveLocationIndex] = useState<number | null>(null)

  const addLocation = () => {
    const newLocation: ClientLocation = {
      id: crypto.randomUUID(),
      name: "",
      address: "",
      city: "",
      contactPersons: [],
    }
    onChange([...locations, newLocation])
    setActiveLocationIndex(locations.length)
  }

  const updateLocation = (index: number, field: keyof ClientLocation, value: string) => {
    const updatedLocations = [...locations]
    updatedLocations[index] = {
      ...updatedLocations[index],
      [field]: value,
    }
    onChange(updatedLocations)
  }

  const removeLocation = (index: number) => {
    const updatedLocations = locations.filter((_, i) => i !== index)
    onChange(updatedLocations)
    if (activeLocationIndex === index) {
      setActiveLocationIndex(null)
    } else if (activeLocationIndex !== null && activeLocationIndex > index) {
      setActiveLocationIndex(activeLocationIndex - 1)
    }
  }

  const updateContactPersons = (index: number, contactPersons: ContactPerson[]) => {
    const updatedLocations = [...locations]
    updatedLocations[index] = {
      ...updatedLocations[index],
      contactPersons,
    }
    onChange(updatedLocations)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Locații</h3>
        <Button onClick={addLocation} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Adaugă locație
        </Button>
      </div>

      {locations.length === 0 ? (
        <div className="text-center p-4 border border-dashed rounded-md">
          <p className="text-muted-foreground">Nu există locații. Adăugați prima locație.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {locations.map((location, index) => (
            <Card key={location.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base">{location.name || `Locație ${index + 1}`}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLocation(index)}
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`location-name-${index}`}>Nume locație</Label>
                    <Input
                      id={`location-name-${index}`}
                      value={location.name}
                      onChange={(e) => updateLocation(index, "name", e.target.value)}
                      placeholder="Sediu central, Punct de lucru, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`location-city-${index}`}>Oraș</Label>
                    <Input
                      id={`location-city-${index}`}
                      value={location.city}
                      onChange={(e) => updateLocation(index, "city", e.target.value)}
                      placeholder="București, Cluj, etc."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`location-address-${index}`}>Adresă</Label>
                  <Input
                    id={`location-address-${index}`}
                    value={location.address}
                    onChange={(e) => updateLocation(index, "address", e.target.value)}
                    placeholder="Strada, număr, bloc, etc."
                  />
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setActiveLocationIndex(activeLocationIndex === index ? null : index)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  {activeLocationIndex === index ? "Ascunde persoane de contact" : "Gestionează persoane de contact"}
                </Button>
              </CardFooter>
              {activeLocationIndex === index && (
                <div className="px-6 pb-4">
                  <ContactPersonsManager
                    contactPersons={location.contactPersons}
                    onChange={(contactPersons) => updateContactPersons(index, contactPersons)}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
