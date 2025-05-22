"use client"

import { useState, useEffect, useRef } from "react"
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  type QueryConstraint,
  type DocumentData,
  type Query,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useMockData } from "@/contexts/MockDataContext"

// Structura cache-ului
interface CacheItem<T> {
  data: T[]
  timestamp: number
  lastUpdated: number
}

// Cache la nivel de modul
const cache: Record<string, CacheItem<any>> = {}

// Durata de viață a cache-ului (30 secunde pentru colecții frecvent actualizate, 5 minute pentru restul)
const CACHE_TTL_DEFAULT = 5 * 60 * 1000 // 5 minute
const CACHE_TTL_REALTIME = 30 * 1000 // 30 secunde

// Colecții care necesită actualizări frecvente
const REALTIME_COLLECTIONS = ["lucrari", "logs"]

// Funcție pentru a genera cheia de cache
const generateCacheKey = (
  collectionName: string,
  constraints: QueryConstraint[],
  customQuery?: Query<DocumentData>,
) => {
  return `${collectionName}_${JSON.stringify(constraints)}`
}

export function useFirebaseCollection<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  customQuery?: Query<DocumentData>,
  options: {
    realtime?: boolean // Forțează modul realtime indiferent de colecție
    bypassCache?: boolean // Ignoră complet cache-ul
    refreshInterval?: number // Interval de reîmprospătare în ms (0 = dezactivat)
  } = {},
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { isPreview, lucrari, clienti, users, logs } = useMockData()

  // Referință pentru a stoca unsubscribe function
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Determinăm dacă colecția necesită actualizări în timp real
  const isRealtimeCollection = options.realtime || REALTIME_COLLECTIONS.includes(collectionName)

  // Alegem TTL-ul corespunzător
  const cacheTTL = isRealtimeCollection ? CACHE_TTL_REALTIME : CACHE_TTL_DEFAULT

  // Generăm cheia de cache
  const cacheKey = generateCacheKey(collectionName, constraints, customQuery)

  // Funcție pentru a încărca date din Firestore
  const fetchFromFirestore = async () => {
    try {
      const q = customQuery || query(collection(db, collectionName), ...constraints)
      const querySnapshot = await getDocs(q)

      const documents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[]

      // Actualizăm cache-ul
      cache[cacheKey] = {
        data: documents,
        timestamp: Date.now(),
        lastUpdated: Date.now(),
      }

      setData(documents)
      setLoading(false)

      return documents
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
      throw err
    }
  }

  // Funcție pentru a configura listener-ul în timp real
  const setupRealtimeListener = () => {
    try {
      const q = customQuery || query(collection(db, collectionName), ...constraints)

      // Curățăm listener-ul anterior dacă există
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const documents = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[]

          // Actualizăm cache-ul
          cache[cacheKey] = {
            data: documents,
            timestamp: Date.now(),
            lastUpdated: Date.now(),
          }

          setData(documents)
          setLoading(false)
        },
        (err) => {
          console.error(`Error in realtime listener for ${collectionName}:`, err)
          setError(err)
          setLoading(false)
        },
      )

      unsubscribeRef.current = unsubscribe
      return unsubscribe
    } catch (err) {
      console.error(`Error setting up realtime listener for ${collectionName}:`, err)
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
      return () => {}
    }
  }

  useEffect(() => {
    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
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

    // Verificăm dacă avem date în cache și dacă sunt încă valide
    const cachedData = cache[cacheKey]
    const now = Date.now()
    const isCacheValid = cachedData && now - cachedData.timestamp < cacheTTL

    // Dacă avem cache valid și nu se cere bypass, folosim datele din cache
    if (isCacheValid && !options.bypassCache) {
      console.log(`[Cache] Using cached data for ${collectionName}`)
      setData(cachedData.data as T[])
      setLoading(false)

      // Chiar dacă folosim cache, setăm un listener pentru colecțiile realtime
      // pentru a primi actualizări în timp real
      if (isRealtimeCollection) {
        const unsubscribe = setupRealtimeListener()
        return () => unsubscribe()
      }

      // Pentru colecțiile non-realtime, verificăm periodic dacă există actualizări
      if (options.refreshInterval && options.refreshInterval > 0) {
        const intervalId = setInterval(() => {
          console.log(`[Cache] Refreshing data for ${collectionName}`)
          fetchFromFirestore().catch(console.error)
        }, options.refreshInterval)

        return () => clearInterval(intervalId)
      }

      return
    }

    // Dacă nu avem cache valid sau se cere bypass, încărcăm datele
    setLoading(true)

    // Pentru colecțiile realtime, setăm un listener
    if (isRealtimeCollection) {
      const unsubscribe = setupRealtimeListener()
      return () => unsubscribe()
    }

    // Pentru colecțiile non-realtime, facem o singură cerere
    fetchFromFirestore().catch(console.error)

    // Dacă se cere refresh periodic, setăm un interval
    if (options.refreshInterval && options.refreshInterval > 0) {
      const intervalId = setInterval(() => {
        console.log(`[Cache] Refreshing data for ${collectionName}`)
        fetchFromFirestore().catch(console.error)
      }, options.refreshInterval)

      return () => clearInterval(intervalId)
    }
  }, [
    collectionName,
    JSON.stringify(constraints),
    isPreview,
    customQuery,
    options.bypassCache,
    options.refreshInterval,
  ])

  // Funcție pentru a forța reîncărcarea datelor
  const refresh = async () => {
    setLoading(true)
    try {
      await fetchFromFirestore()
      return true
    } catch (err) {
      console.error(`Error refreshing data for ${collectionName}:`, err)
      return false
    }
  }

  return { data, loading, error, refresh }
}

// Funcții utilitare pentru gestionarea cache-ului (pot fi exportate pentru a fi folosite în alte părți ale aplicației)
export const clearCache = (collectionName?: string) => {
  if (collectionName) {
    // Șterge cache-ul doar pentru o anumită colecție
    Object.keys(cache).forEach((key) => {
      if (key.startsWith(`${collectionName}_`)) {
        delete cache[key]
      }
    })
    console.log(`[Cache] Cleared cache for ${collectionName}`)
  } else {
    // Șterge tot cache-ul
    Object.keys(cache).forEach((key) => {
      delete cache[key]
    })
    console.log(`[Cache] Cleared all cache`)
  }
}

export const getCacheStats = () => {
  return {
    size: Object.keys(cache).length,
    collections: Object.keys(cache).map((key) => key.split("_")[0]),
    items: Object.entries(cache).map(([key, value]) => ({
      key,
      size: JSON.stringify(value.data).length,
      age: Date.now() - value.timestamp,
      lastUpdated: new Date(value.lastUpdated).toLocaleString(),
    })),
  }
}
