"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { clearCache, getCacheStats } from "@/hooks/use-firebase-collection"

interface CacheContextType {
  clearAllCache: () => void
  clearCollectionCache: (collection: string) => void
  cacheStats: any
  refreshStats: () => void
}

const CacheContext = createContext<CacheContextType | undefined>(undefined)

export function CacheProvider({ children }: { children: React.ReactNode }) {
  const [cacheStats, setCacheStats] = useState<any>(null)

  const refreshStats = useCallback(() => {
    setCacheStats(getCacheStats())
  }, [])

  const clearAllCache = useCallback(() => {
    clearCache()
    refreshStats()
  }, [refreshStats])

  const clearCollectionCache = useCallback(
    (collection: string) => {
      clearCache(collection)
      refreshStats()
    },
    [refreshStats],
  )

  // Actualizăm statisticile la fiecare 30 de secunde
  useEffect(() => {
    refreshStats()
    const interval = setInterval(refreshStats, 30000)
    return () => clearInterval(interval)
  }, [refreshStats])

  return (
    <CacheContext.Provider
      value={{
        clearAllCache,
        clearCollectionCache,
        cacheStats,
        refreshStats,
      }}
    >
      {children}
    </CacheContext.Provider>
  )
}

export function useCache() {
  const context = useContext(CacheContext)
  if (context === undefined) {
    throw new Error("useCache must be used within a CacheProvider")
  }
  return context
}
