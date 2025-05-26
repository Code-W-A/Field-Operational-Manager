import type { Timestamp } from "firebase/firestore"

export interface PersoanaContact {
  nume: string
  telefon: string
  email?: string
}

export interface Lucrare {
  id?: string
  client: string
  persoanaContact: string
  telefon: string
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  locatie: string
  echipament?: string
  echipamentCod?: string
  echipamentModel?: string
  descriere: string
  statusLucrare: string
  statusFacturare: string
  tehnicieni: string[]
  descriereInterventie?: string
  constatareLaLocatie?: string
  contract?: string
  contractNumber?: string
  contractType?: string
  defectReclamat?: string
  // Câmpuri noi pentru verificarea echipamentului
  equipmentVerified?: boolean
  equipmentVerifiedAt?: string
  equipmentVerifiedBy?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  createdBy?: string
  updatedBy?: string
  // Add new field for all contact persons
  persoaneContact?: PersoanaContact[]
  // Add new field for dispatcher pickup status
  preluatDispecer?: boolean
  raportGenerat?: boolean
  // Adăugăm câmpul pentru statusul echipamentului
  statusEchipament?: string
  // Adăugăm câmpul pentru necesitatea unei oferte
  necesitaOferta?: boolean
  // Adăugăm câmpul pentru comentarii legate de ofertă
  comentariiOferta?: string
  // Câmpuri pentru timpul de sosire
  dataSosire?: string // Format: dd-MM-yyyy
  oraSosire?: string // Format: HH:mm
  // Câmp pentru timpul de plecare
  oraPlecare?: string // Format: HH:mm
}
