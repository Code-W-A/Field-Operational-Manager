export interface ContactPerson {
  id: string
  name: string
  phone: string
  email: string
  position: string
}

export interface Equipment {
  id: string
  name: string
  description: string
}

export interface ClientLocation {
  id: string
  name: string
  address: string
  city: string
  county: string
  contactPersons: ContactPerson[]
  equipment: Equipment[]
}

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  city: string
  county: string
  cif: string // Adăugat CIF
  locations: ClientLocation[]
  createdAt: string
  updatedAt: string
}
