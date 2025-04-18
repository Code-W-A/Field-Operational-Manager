"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { isPreviewEnvironment } from "@/lib/utils/environment"

// Date mock pentru utilizatori
const mockUsers = [
  {
    uid: "user1",
    email: "admin@example.com",
    displayName: "Administrator",
    role: "admin",
    telefon: "0722123456",
    createdAt: new Date(),
    lastLogin: new Date(),
  },
  {
    uid: "user2",
    email: "dispecer@example.com",
    displayName: "Dispecer Test",
    role: "dispecer",
    telefon: "0733123456",
    createdAt: new Date(),
    lastLogin: new Date(),
  },
  {
    uid: "user3",
    email: "tehnician@example.com",
    displayName: "Tehnician Test",
    role: "tehnician",
    telefon: "0744123456",
    createdAt: new Date(),
    lastLogin: new Date(),
  },
]

// Date mock pentru lucrări
const mockLucrari = [
  {
    id: "lucrare1",
    dataEmiterii: "01.04.2025",
    dataInterventie: "03.04.2025",
    tipLucrare: "Contra cost",
    tehnicieni: ["Ștefan", "Leo"],
    client: "Mater doors",
    locatie: "S Residence",
    descriere: "Ușă secțională lovită. Necesită intervenție 2 pers",
    persoanaContact: "Ion Popescu",
    telefon: "0722111222",
    statusLucrare: "În așteptare",
    statusFacturare: "Nefacturat",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "lucrare2",
    dataEmiterii: "02.04.2025",
    dataInterventie: "04.04.2025",
    tipLucrare: "În garanție",
    tehnicieni: ["Alin"],
    client: "Total Asset",
    locatie: "Sediu central",
    descriere: "Verificare periodică uși automate",
    persoanaContact: "Maria Ionescu",
    telefon: "0733222333",
    statusLucrare: "În curs",
    statusFacturare: "Nefacturat",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "lucrare3",
    dataEmiterii: "03.04.2025",
    dataInterventie: "05.04.2025",
    tipLucrare: "Instalare",
    tehnicieni: ["Cristi", "Dănuț"],
    client: "Monsanto",
    locatie: "Depozit Otopeni",
    descriere: "Instalare ușă secțională nouă",
    persoanaContact: "Andrei Dumitrescu",
    telefon: "0744333444",
    statusLucrare: "Finalizat",
    statusFacturare: "Facturat",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// Date mock pentru clienți
const mockClienti = [
  {
    id: "client1",
    nume: "Mater doors",
    adresa: "Str. Exemplu nr. 1, București",
    persoanaContact: "Ion Popescu",
    telefon: "0722111222",
    email: "contact@materdoors.ro",
    numarLucrari: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "client2",
    nume: "Total Asset",
    adresa: "Str. Exemplu nr. 2, București",
    persoanaContact: "Maria Ionescu",
    telefon: "0733222333",
    email: "contact@totalasset.ro",
    numarLucrari: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "client3",
    nume: "Monsanto",
    adresa: "Str. Exemplu nr. 3, Otopeni",
    persoanaContact: "Andrei Dumitrescu",
    telefon: "0744333444",
    email: "contact@monsanto.ro",
    numarLucrari: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// Date mock pentru loguri
const mockLogs = [
  {
    id: "log1",
    timestamp: new Date(),
    utilizator: "Administrator",
    utilizatorId: "user1",
    actiune: "Autentificare",
    detalii: "Autentificare reușită",
    ip: "192.168.1.1",
    tip: "Informație",
    categorie: "Autentificare",
  },
  {
    id: "log2",
    timestamp: new Date(Date.now() - 3600000), // 1 oră în urmă
    utilizator: "Administrator",
    utilizatorId: "user1",
    actiune: "Adăugare lucrare",
    detalii: "A fost adăugată o nouă lucrare pentru clientul Mater doors",
    ip: "192.168.1.1",
    tip: "Informație",
    categorie: "Date",
  },
  {
    id: "log3",
    timestamp: new Date(Date.now() - 7200000), // 2 ore în urmă
    utilizator: "Dispecer Test",
    utilizatorId: "user2",
    actiune: "Actualizare client",
    detalii: "Au fost actualizate datele clientului Total Asset",
    ip: "192.168.1.2",
    tip: "Informație",
    categorie: "Date",
  },
]

// Tipul contextului pentru datele mock
interface MockDataContextType {
  isPreview: boolean
  currentUser: (typeof mockUsers)[0] | null
  users: typeof mockUsers
  lucrari: typeof mockLucrari
  clienti: typeof mockClienti
  logs: typeof mockLogs
  setCurrentUser: (user: (typeof mockUsers)[0] | null) => void
}

// Creăm contextul
const MockDataContext = createContext<MockDataContextType>({
  isPreview: false,
  currentUser: null,
  users: [],
  lucrari: [],
  clienti: [],
  logs: [],
  setCurrentUser: () => {},
})

// Hook pentru a utiliza contextul
export const useMockData = () => useContext(MockDataContext)

// Provider pentru datele mock
export function MockDataProvider({ children }: { children: ReactNode }) {
  const [isPreview, setIsPreview] = useState(false)
  const [currentUser, setCurrentUser] = useState<(typeof mockUsers)[0] | null>(null)

  useEffect(() => {
    // Verificăm dacă suntem în mediul de preview
    setIsPreview(isPreviewEnvironment())
  }, [])

  return (
    <MockDataContext.Provider
      value={{
        isPreview,
        currentUser,
        users: mockUsers,
        lucrari: mockLucrari,
        clienti: mockClienti,
        logs: mockLogs,
        setCurrentUser,
      }}
    >
      {children}
    </MockDataContext.Provider>
  )
}
