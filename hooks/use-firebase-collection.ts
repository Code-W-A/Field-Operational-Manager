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

  console.log("🔥📊 useFirebaseCollection HOOK STARTED:", {
    collectionName,
    constraintsCount: constraints.length,
    hasCustomQuery: !!customQuery,
    isPreview
  })

  useEffect(() => {
    console.log("🔥🔄 useFirebaseCollection EFFECT TRIGGERED:", {
      collectionName,
      isPreview,
      constraintsStr: JSON.stringify(constraints),
      timestamp: new Date().toISOString()
    })

    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
      console.log("🔥🎭 PREVIEW MODE - using mock data for:", collectionName)
      // Simulăm un timp de încărcare
      const timer = setTimeout(() => {
        switch (collectionName) {
          case "lucrari":
            console.log("🔥✅ Mock lucrari data loaded, count:", lucrari.length)
            setData(lucrari as unknown as T[])
            break
          case "clienti":
            console.log("🔥✅ Mock clienti data loaded, count:", clienti.length)
            setData(clienti as unknown as T[])
            break
          case "users":
            console.log("🔥✅ Mock users data loaded, count:", users.length)
            setData(users as unknown as T[])
            break
          case "logs":
            console.log("🔥✅ Mock logs data loaded, count:", logs.length)
            setData(logs as unknown as T[])
            break
          default:
            console.log("🔥⚠️ Unknown collection in preview mode:", collectionName)
            setData([])
        }
        setLoading(false)
      }, 1000)

      return () => {
        console.log("🔥🧹 Preview timer cleanup for:", collectionName)
        clearTimeout(timer)
      }
    }

    // Altfel, utilizăm Firestore
    console.log("🔥🚀 STARTING Firestore subscription for:", collectionName)
    setLoading(true)

    try {
      // Folosim query-ul personalizat dacă este furnizat, altfel construim unul cu constrângerile date
      const q = customQuery || query(collection(db, collectionName), ...constraints)
      
      console.log("🔥📝 Query created for:", collectionName, "with constraints:", constraints.length)

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          console.log("🔥📦 Firestore snapshot received for:", collectionName, {
            docsCount: querySnapshot.docs.length,
            fromCache: querySnapshot.metadata.fromCache,
            hasPendingWrites: querySnapshot.metadata.hasPendingWrites,
            timestamp: new Date().toISOString()
          })

          const documents = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as unknown as T[]

          console.log("🔥✅ Documents processed for:", collectionName, "count:", documents.length)
          setData(documents)
          setLoading(false)
        },
        (err) => {
          console.error(`❌🔥 CRITICAL Firebase collection error (${collectionName}):`, {
            error: err,
            code: err.code,
            message: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
          })
          
          // Verificăm dacă este o eroare de autentificare
          if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
            console.warn("🔒🔥 AUTH PROBLEM detected în useFirebaseCollection for:", collectionName)
            console.warn("🔒🔥 This might cause automatic logout!")
            // Nu setăm eroarea pentru a evita crash-ul componentei
            // Doar logăm problema
          } else {
            console.error("🔥💥 Setting error state for:", collectionName)
            setError(err)
          }
          setLoading(false)
        },
      )

      console.log("🔥👂 Firestore listener attached for:", collectionName)
      return () => {
        console.log("🔥🧹 Firestore listener cleanup for:", collectionName)
        unsubscribe()
      }
    } catch (err) {
      console.error(`❌🔥 CRITICAL Firebase collection setup error (${collectionName}):`, {
        error: err,
        code: (err as any).code,
        message: (err as any).message,
        stack: (err as any).stack,
        timestamp: new Date().toISOString()
      })
      
      // Verificăm dacă este o eroare de autentificare
      if ((err as any).code === 'permission-denied' || (err as any).code === 'unauthenticated') {
        console.warn("🔒🔥 AUTH PROBLEM detected în setup collection for:", collectionName)
        console.warn("🔒🔥 This might cause automatic logout!")
      }
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [collectionName, JSON.stringify(constraints), isPreview, lucrari, clienti, users, logs, customQuery])

  return { data, loading, error }
}
