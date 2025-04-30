"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, User } from "lucide-react"
import type { ContactPerson } from "@/types/client"

interface ContactPersonsManagerProps {
  contactPersons: ContactPerson[]
  onChange: (contactPersons: ContactPerson[]) => void
}

export function ContactPersonsManager({ contactPersons, onChange }: ContactPersonsManagerProps) {
  const addContactPerson = () => {
    const newPerson: ContactPerson = {
      id: crypto.randomUUID(),
      name: "",
      position: "",
      phone: "",
      email: "",
    }
    onChange([...contactPersons, newPerson])
  }

  const updateContactPerson = (index: number, field: keyof ContactPerson, value: string) => {
    const updatedPersons = [...contactPersons]
    updatedPersons[index] = {
      ...updatedPersons[index],
      [field]: value,
    }
    onChange(updatedPersons)
  }

  const removeContactPerson = (index: number) => {
    const updatedPersons = contactPersons.filter((_, i) => i !== index)
    onChange(updatedPersons)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">Persoane de contact</h4>
        <Button onClick={addContactPerson} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Adaugă persoană
        </Button>
      </div>

      {contactPersons.length === 0 ? (
        <div className="text-center p-4 border border-dashed rounded-md">
          <p className="text-muted-foreground text-sm">Nu există persoane de contact. Adăugați prima persoană.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contactPersons.map((person, index) => (
            <Card key={person.id} className="overflow-hidden">
              <CardHeader className="py-2 px-4 bg-muted/50 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  {person.name || `Persoană ${index + 1}`}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeContactPerson(index)}
                  className="h-6 w-6 text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`person-name-${index}`} className="text-xs">
                      Nume
                    </Label>
                    <Input
                      id={`person-name-${index}`}
                      value={person.name}
                      onChange={(e) => updateContactPerson(index, "name", e.target.value)}
                      placeholder="Nume și prenume"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`person-position-${index}`} className="text-xs">
                      Funcție
                    </Label>
                    <Input
                      id={`person-position-${index}`}
                      value={person.position}
                      onChange={(e) => updateContactPerson(index, "position", e.target.value)}
                      placeholder="Director, Manager, etc."
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`person-phone-${index}`} className="text-xs">
                      Telefon
                    </Label>
                    <Input
                      id={`person-phone-${index}`}
                      value={person.phone}
                      onChange={(e) => updateContactPerson(index, "phone", e.target.value)}
                      placeholder="Număr de telefon"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`person-email-${index}`} className="text-xs">
                      Email
                    </Label>
                    <Input
                      id={`person-email-${index}`}
                      value={person.email}
                      onChange={(e) => updateContactPerson(index, "email", e.target.value)}
                      placeholder="Adresă de email"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
