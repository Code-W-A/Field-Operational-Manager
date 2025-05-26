"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface Raport {
  id: string
  nume: string
  prenume: string
  telefon: string
  email: string
  data: string
  ora: string
  serviciu: string
  observatii: string
  raportGenerat: boolean
  oraPlecare: string
}

const RaportPage = ({ params }: { params: { id: string } }) => {
  const [raport, setRaport] = useState<Raport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchRaport = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/raport/${params.id}`)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setRaport(data)
      } catch (error) {
        console.error("Could not fetch raport:", error)
        // Handle error appropriately, maybe redirect to an error page
      } finally {
        setIsLoading(false)
      }
    }

    fetchRaport()
  }, [params.id])

  const handleFinalizare = async () => {
    if (!raport) return

    try {
      const response = await fetch(`/api/raport/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...raport,
          raportGenerat: true,
          oraPlecare: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Update the local state
      setRaport({
        ...raport,
        raportGenerat: true,
        oraPlecare: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
      })
      router.push("/") // Redirect to home page or another appropriate route
    } catch (error) {
      console.error("Could not update raport:", error)
      // Handle error appropriately
    }
  }

  const handleGenerateAndSend = async () => {
    if (!raport) return

    try {
      const response = await fetch(`/api/raport/generate-and-send/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...raport,
          raportGenerat: true,
          oraPlecare: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Update the local state
      setRaport({
        ...raport,
        raportGenerat: true,
        oraPlecare: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
      })
      router.push("/") // Redirect to home page or another appropriate route
    } catch (error) {
      console.error("Could not generate and send raport:", error)
      // Handle error appropriately
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!raport) {
    return <div>Raport not found</div>
  }

  return (
    <div>
      <h1>Raport Details</h1>
      <p>Nume: {raport.nume}</p>
      <p>Prenume: {raport.prenume}</p>
      <p>Telefon: {raport.telefon}</p>
      <p>Email: {raport.email}</p>
      <p>Data: {raport.data}</p>
      <p>Ora: {raport.ora}</p>
      <p>Serviciu: {raport.serviciu}</p>
      <p>Observatii: {raport.observatii}</p>
      <p>Raport Generat: {raport.raportGenerat ? "Yes" : "No"}</p>
      {raport.raportGenerat && <p>Ora Plecare: {raport.oraPlecare}</p>}

      <button onClick={handleFinalizare} disabled={raport.raportGenerat}>
        Finalizare Raport
      </button>
      <button onClick={handleGenerateAndSend} disabled={raport.raportGenerat}>
        Genereaza si Trimite Raport
      </button>
    </div>
  )
}

export default RaportPage
