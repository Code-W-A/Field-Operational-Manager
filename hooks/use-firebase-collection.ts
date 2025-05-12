"use client"

import { useState, useEffect } from "react"
import { collection, query, onSnapshot, type QueryConstraint, type DocumentData, type Query } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useMockData } from "@/contexts/MockDataContext"

export function useFirebaseCollection<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  customQuery?: Query<DocumentData>,
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { isPreview, lucrari, clienti, users, logs } = useMockData()

  useEffect(() => {
    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
      // Simulăm un timp de încărcare
      const timer = setTimeout(() => {
        switch (collectionName) {
          case "lucrari":
            setData(lucrari as unknown as T[])
            break
          case "clienti":
            setData(clienti as unknown as T[])
            break
          case "users":
            setData(users as unknown as T[])
            break
          case "logs":
            setData(logs as unknown as T[])
            break
          default:
            setData([])
        }
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }

    // Altfel, utilizăm Firestore
    setLoading(true)

    try {
      // Folosim query-ul personalizat dacă este furnizat, altfel construim unul cu constrângerile date
      const q = customQuery || query(collection(db, collectionName), ...constraints)

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const documents = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[]

          setData(documents)
          setLoading(false)
        },
        (err) => {
          setError(err)
          setLoading(false)
        },
      )

      return () => unsubscribe()
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [collectionName, JSON.stringify(constraints), isPreview, lucrari, clienti, users, logs, customQuery])

  return { data, loading, error }
}
