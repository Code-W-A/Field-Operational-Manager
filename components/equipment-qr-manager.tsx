"use client"

import type React from "react"
import { useState } from "react"

interface Equipment {
  id: string
  name: string
  // ... other properties
}

interface Client {
  id: string
  name: string
  // ... other properties
}

interface EquipmentQrManagerProps {
  findEquipmentByCode: (code: string) => Promise<{ equipment: Equipment; client: Client } | null>
}

const EquipmentQrManager: React.FC<EquipmentQrManagerProps> = ({ findEquipmentByCode }) => {
  const [searchCode, setSearchCode] = useState("")
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [searchError, setSearchError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSearchCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchCode(event.target.value)
  }

  const searchEquipmentByCode = async () => {
    if (!searchCode.trim()) {
      setSearchError("Introduceți un cod de echipament")
      return
    }

    setLoading(true)
    setSearchError("")

    try {
      const result = await findEquipmentByCode(searchCode.trim())

      if (result) {
        setEquipment(result.equipment)
        setClient(result.client)
      } else {
        setSearchError("Echipamentul nu a fost găsit. Verificați codul și încercați din nou.")
      }
    } catch (error) {
      console.error("Eroare la căutarea echipamentului:", error)
      setSearchError("A apărut o eroare la căutarea echipamentului")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Introduceți codul echipamentului"
        value={searchCode}
        onChange={handleSearchCodeChange}
      />
      <button onClick={searchEquipmentByCode} disabled={loading}>
        {loading ? "Se caută..." : "Caută"}
      </button>

      {searchError && <p style={{ color: "red" }}>{searchError}</p>}

      {equipment && client && (
        <div>
          <h3>Echipament găsit:</h3>
          <p>Nume: {equipment.name}</p>
          {/* ... other equipment details */}

          <h3>Client:</h3>
          <p>Nume: {client.name}</p>
          {/* ... other client details */}
        </div>
      )}
    </div>
  )
}

export default EquipmentQrManager
