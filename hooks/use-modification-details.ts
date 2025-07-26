"use client"

import { useState, useEffect } from "react"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import type { WorkModification } from "@/components/work-modifications-dialog"

export function useModificationDetails(modificationId: string | null) {
  const [modification, setModification] = useState<WorkModification | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!modificationId) {
      setModification(null)
      return
    }

    const fetchModification = async () => {
      setLoading(true)
      try {
        const modificationDoc = await getDoc(doc(db, "work_modifications", modificationId))
        
        if (modificationDoc.exists()) {
          const data = modificationDoc.data()
          setModification({
            id: modificationDoc.id,
            lucrareId: data.lucrareId,
            lucrareTitle: data.lucrareTitle,
            modificationType: data.modificationType,
            modifiedBy: data.modifiedBy,
            modifiedByName: data.modifiedByName,
            modifiedAt: data.modifiedAt?.toDate ? data.modifiedAt.toDate() : new Date(data.modifiedAt),
            oldValue: data.oldValue,
            newValue: data.newValue,
            description: data.description,
            read: true, // Considerăm că este citită când este afișată
            priority: data.priority || 'medium',
            tipLucrare: data.tipLucrare,
            statusLucrare: data.statusLucrare,
            tehnicieni: data.tehnicieni,
            dataInterventie: data.dataInterventie
          } as WorkModification)
        } else {
          setModification(null)
        }
      } catch (error) {
        console.error("Eroare la încărcarea detaliilor modificării:", error)
        setModification(null)
      } finally {
        setLoading(false)
      }
    }

    fetchModification()
  }, [modificationId])

  return { modification, loading }
} 