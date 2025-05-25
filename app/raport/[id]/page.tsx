"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { db } from "@/firebase"
import { collection, addDoc, doc, getDoc, updateDoc } from "firebase/firestore"
import { format } from "date-fns"
import { ro } from "date-fns/locale"

interface Raport {
  id?: string
  nume: string
  prenume: string
  telefon: string
  email: string
  departament: string
  problema: string
  status: string
  timpCreare?: string
  dataCreare?: string
  timpPlecare?: string
  dataPlecare?: string
  observatii?: string
}

const RaportPage = ({ params }: { params: { id: string } }) => {
  const [raport, setRaport] = useState<Raport>({
    nume: "",
    prenume: "",
    telefon: "",
    email: "",
    departament: "",
    problema: "",
    status: "Nou",
  })
  const [isEditing, setIsEditing] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loadRaport = async () => {
      if (params.id === "new") {
        setIsEditing(true)
        return
      }

      try {
        const raportDoc = await getDoc(doc(db, "rapoarte", params.id))

        if (raportDoc.exists()) {
          setRaport({ id: raportDoc.id, ...raportDoc.data() } as Raport)
        } else {
          console.log("Raportul nu a fost gasit")
        }
      } catch (error) {
        console.error("Eroare la incarcarea raportului:", error)
      }
    }

    loadRaport()
  }, [params.id])

  const handleChange = (e: any) => {
    setRaport({ ...raport, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()

    try {
      if (params.id === "new") {
        // Înregistrăm timpul și data creării
        const now = new Date()
        const dataCreare = format(now, "yyyy-MM-dd", { locale: ro })
        const timpCreare = format(now, "HH:mm:ss", { locale: ro })

        // Înregistrăm timpul de plecare
        const timpPlecare = format(now, "yyyy-MM-dd", { locale: ro })
        const oraPlecare = format(now, "HH:mm:ss", { locale: ro })

        await addDoc(collection(db, "rapoarte"), {
          ...raport,
          dataCreare,
          timpCreare,
          timpPlecare: timpPlecare,
          dataPlecare: oraPlecare,
        })
      } else {
        // Actualizăm raportul existent
        const raportRef = doc(db, "rapoarte", params.id)
        await updateDoc(raportRef, raport)
      }

      router.push("/")
    } catch (error) {
      console.error("Eroare la salvarea raportului:", error)
    }
  }

  return (
    <div className="container mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">{isEditing ? "Creare Raport Nou" : "Vizualizare/Editare Raport"}</h1>
      <form onSubmit={handleSubmit} className="max-w-lg">
        <div className="mb-4">
          <label htmlFor="nume" className="block text-gray-700 text-sm font-bold mb-2">
            Nume:
          </label>
          <input
            type="text"
            id="nume"
            name="nume"
            value={raport.nume}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="prenume" className="block text-gray-700 text-sm font-bold mb-2">
            Prenume:
          </label>
          <input
            type="text"
            id="prenume"
            name="prenume"
            value={raport.prenume}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="telefon" className="block text-gray-700 text-sm font-bold mb-2">
            Telefon:
          </label>
          <input
            type="text"
            id="telefon"
            name="telefon"
            value={raport.telefon}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
            Email:
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={raport.email}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="departament" className="block text-gray-700 text-sm font-bold mb-2">
            Departament:
          </label>
          <input
            type="text"
            id="departament"
            name="departament"
            value={raport.departament}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="problema" className="block text-gray-700 text-sm font-bold mb-2">
            Problema:
          </label>
          <textarea
            id="problema"
            name="problema"
            value={raport.problema}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="status" className="block text-gray-700 text-sm font-bold mb-2">
            Status:
          </label>
          <select
            id="status"
            name="status"
            value={raport.status}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={!isEditing}
          >
            <option>Nou</option>
            <option>In lucru</option>
            <option>Finalizat</option>
          </select>
        </div>
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          type="submit"
          disabled={!isEditing}
        >
          Salveaza
        </button>
        {params.id !== "new" && (
          <button
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ml-4"
            type="button"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Anuleaza" : "Editeaza"}
          </button>
        )}
      </form>
    </div>
  )
}

export default RaportPage
