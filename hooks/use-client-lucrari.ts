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
        // Folosim datele mock
        setClienti(mockClienti)
        setLucrari(mockLucrari)
      } else {
        // Obținem datele reale din Firestore
        const clientiData = await getClienti()
        const lucrariData = await getLucrari()

        setClienti(clientiData)
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
          // Folosim datele mock
          if (isMounted) {
            setClienti(mockClienti)
            setLucrari(mockLucrari)
            setLoading(false)
          }
          return
        }

        // Obținem datele reale din Firestore
        const clientiData = await getClienti()
        const lucrariData = await getLucrari()

        if (isMounted) {
          setClienti(clientiData)
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
