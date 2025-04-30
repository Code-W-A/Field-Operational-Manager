export interface ContactPerson {
  id: string
  name: string
  position: string
  phone: string
  email?: string
}

export interface ClientLocation {
  id: string
  name: string
  address: string
  city: string
  county?: string
  contactPersons: ContactPerson[]
}

export interface Client {
  id?: string
  name: string
  cif: string
  email: string
  phone: string
  address: string
  locations: ClientLocation[]
  createdAt?: any
  updatedAt?: any
}
