// Tipuri pentru persoanele de contact
export interface ContactPerson {
  id?: string
  name: string
  phone: string
  email?: string
  position?: string
}

// Tipuri pentru locațiile clientului
export interface ClientLocation {
  id: string
  name: string
  address: string
  city: string
  county?: string
  contactPersons: ContactPerson[]
}

// Tipuri pentru clienți
export interface Client {
  id?: string
  name: string
  cif: string
  address: string
  city: string
  county?: string
  phone: string
  email: string
  locations: ClientLocation[]
  createdAt?: any
  updatedAt?: any
}
