"use client"

import { useState, useEffect, useCallback } from "react"
import { getClienti, getLucrari, type Client, type Lucrare } from "@/lib/firebase/firestore"
import { withClientWorkCounts } from "@/lib/client-work-links"
import { useMockData } from "@/contexts/MockDataContext"

export function useClientLucrari() {
  const [clienti, setClienti] = useState<(Client & { numarLucrari: number })[]>([])
  const [lucrari, setLucrari] = useState<Lucrare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const { isPreview, clienti: mockClienti, lucrari: mockLucrari } = useMockData()

  // Adăugăm o funcție de reîmprospătare a datelor
  const refreshData = useCallback(async () => {
    try {
      setLoading(true)

      if (isPreview) {
        // Calculate work counts for mock data
        const clientsWithWorkCount = withClientWorkCounts(mockClienti as unknown as Client[], mockLucrari)

        setClienti(clientsWithWorkCount)
        setLucrari(mockLucrari as unknown as Lucrare[])
      } else {
        // Get real data from Firestore
        const [clientiData, lucrariData] = await Promise.all([getClienti(), getLucrari()])

        // Calculate the number of works for each client
        const clientsWithWorkCount = withClientWorkCounts(clientiData, lucrariData)

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
          const clientsWithWorkCount = withClientWorkCounts(mockClienti as unknown as Client[], mockLucrari)

          if (isMounted) {
            setClienti(clientsWithWorkCount)
            setLucrari(mockLucrari as unknown as Lucrare[])
            setLoading(false)
          }
          return
        }

        // Get real data from Firestore
        const [clientiData, lucrariData] = await Promise.all([getClienti(), getLucrari()])

        // Calculate the number of works for each client
        const clientsWithWorkCount = withClientWorkCounts(clientiData, lucrariData)

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
