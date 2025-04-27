"use client"

import { useState, useEffect, useCallback } from "react"
import { getClienti, getLucrari } from "@/lib/firebase/firestore"
import { useMockData } from "@/contexts/MockDataContext"

export function useClientLucrari() {
  const [clienti, setClienti] = useState([])
  const [lucrari, setLucrari] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isPreview, clienti: mockClienti, lucrari: mockLucrari } = useMockData()

  // Adăugăm o funcție de reîmprospătare a datelor
  const refreshData = useCallback(async () => {
    try {
      setLoading(true)

      if (isPreview) {
        // Calculate work counts for mock data
        const clientsWithWorkCount = mockClienti.map((client) => {
          const workCount = mockLucrari.filter((lucrare) => lucrare.client === client.nume).length
          return { ...client, numarLucrari: workCount }
        })

        setClienti(clientsWithWorkCount)
        setLucrari(mockLucrari)
      } else {
        // Get real data from Firestore
        const clientiData = await getClienti()
        const lucrariData = await getLucrari()

        // Calculate the number of works for each client
        const clientsWithWorkCount = clientiData.map((client) => {
          const workCount = lucrariData.filter((lucrare) => lucrare.client === client.nume).length
          return { ...client, numarLucrari: workCount }
        })

        setClienti(clientsWithWorkCount)
        setLucrari(lucrariData)
      }

      setError(null)
    } catch (err) {
      console.error("Eroare la încărcarea datelor:", err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [isPreview, mockClienti, mockLucrari])

  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      try {
        if (isPreview) {
          // For mock data, calculate the number of works for each client
          const clientsWithWorkCount = mockClienti.map((client) => {
            const workCount = mockLucrari.filter((lucrare) => lucrare.client === client.nume).length
            return { ...client, numarLucrari: workCount }
          })

          if (isMounted) {
            setClienti(clientsWithWorkCount)
            setLucrari(mockLucrari)
            setLoading(false)
          }
          return
        }

        // Get real data from Firestore
        const clientiData = await getClienti()
        const lucrariData = await getLucrari()

        // Calculate the number of works for each client
        const clientsWithWorkCount = clientiData.map((client) => {
          const workCount = lucrariData.filter((lucrare) => lucrare.client === client.nume).length
          return { ...client, numarLucrari: workCount }
        })

        if (isMounted) {
          setClienti(clientsWithWorkCount)
          setLucrari(lucrariData)
          setLoading(false)
        }
      } catch (err) {
        console.error("Eroare la încărcarea datelor:", err)
        if (isMounted) {
          setError(err)
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [isPreview, mockClienti, mockLucrari])

  return { clienti, lucrari, loading, error, refreshData }
}
