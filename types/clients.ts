export interface Equipment {
  id?: string
  cod: string
  nume: string
  model: string
  serie: string
  an: string
  observatii: string
  locatie: string
}

export interface Location {
  id?: string
  nume: string
  adresa: string
  oras: string
  judet: string
  codPostal: string
  tara: string
  echipamente: Equipment[]
}

export interface Client {
  id?: string
  numeCompanie: string
  cui: string
  regCom: string
  adresaSediu: string
  oras: string
  judet: string
  codPostal: string
  tara: string
  email: string
  telefon: string
  persoanaContact: string
  functiePersoanaContact: string
  telefonPersoanaContact: string
  emailPersoanaContact: string
  observatii: string
  locatii: Location[]
  createdAt?: any
  updatedAt?: any
}
