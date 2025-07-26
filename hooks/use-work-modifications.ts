"use client"

import { useState, useEffect, useMemo } from "react"
import { useFirebaseCollection } from "./use-firebase-collection"
import { where, orderBy, limit, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { useAuth } from "@/contexts/AuthContext"
import type { WorkModification } from "@/components/work-modifications-dialog"

export function useWorkModifications(shouldLoad: boolean = false) {
  const { userData } = useAuth()

  // Lazy loading - citește doar când este necesar (când dialogul este deschis)
  const constraints = shouldLoad && userData?.uid ? [
    where("modifiedBy", "!=", userData.uid), // Excludem modificările făcute de utilizatorul curent
    orderBy("modifiedAt", "desc"),
    limit(15) // Reduce la 15 modificări pentru optimizare
  ] : []

  const { data: rawModifications, loading } = useFirebaseCollection(
    shouldLoad ? "work_modifications" : "", // Hook-ul nu se execută dacă nu trebuie să încarce
    constraints
  )

  // Citim statusurile de citit pentru utilizatorul curent (doar când shouldLoad este true)
  const { data: readStatuses } = useFirebaseCollection(
    shouldLoad && userData?.uid ? "work_modifications_read" : "",
    shouldLoad && userData?.uid ? [
      where("userId", "==", userData.uid),
      limit(50) // Limită pentru statusuri citite
    ] : []
  )

  // Transformăm datele Firebase în formatul WorkModification
  const modifications = useMemo(() => {
    if (!rawModifications || !userData?.uid) return []
    
    // Creăm un Set cu ID-urile modificărilor citite
    const readModificationIds = new Set(
      readStatuses?.map(status => status.modificationId) || []
    )
    
    return rawModifications
      .filter(mod => mod.modifiedBy !== userData.uid) // Filtrare suplimentară pentru siguranță
      .map(mod => ({
        id: mod.id,
        lucrareId: mod.lucrareId,
        lucrareTitle: mod.lucrareTitle,
        modificationType: mod.modificationType,
        modifiedBy: mod.modifiedBy,
        modifiedByName: mod.modifiedByName,
        modifiedAt: mod.modifiedAt?.toDate ? mod.modifiedAt.toDate() : new Date(mod.modifiedAt),
        oldValue: mod.oldValue,
        newValue: mod.newValue,
        description: mod.description,
        read: readModificationIds.has(mod.id), // Verificăm dacă a fost citită
        priority: mod.priority || 'medium',
        // Detalii suplimentare pentru card-uri îmbunătățite
        tipLucrare: mod.tipLucrare,
        statusLucrare: mod.statusLucrare,
        tehnicieni: mod.tehnicieni,
        dataInterventie: mod.dataInterventie
      } as WorkModification))
  }, [rawModifications, readStatuses, userData?.uid])

  const unreadCount = useMemo(() => {
    return modifications.filter(mod => !mod.read).length
  }, [modifications])

  const markAsRead = async (modificationId: string) => {
    if (!userData?.uid) return
    
    try {
      // Creăm un document pentru tracking că utilizatorul a citit modificarea
      const readStatusDoc = doc(db, "work_modifications_read", `${userData.uid}_${modificationId}`)
      await setDoc(readStatusDoc, {
        userId: userData.uid,
        modificationId,
        readAt: serverTimestamp()
      })
      console.log("✅ Modificare marcată ca citită:", modificationId)
    } catch (error) {
      console.error("❌ Eroare la marcarea ca citită:", error)
    }
  }

  const markAllAsRead = async () => {
    if (!userData?.uid || !modifications.length) return
    
    try {
      // Marchează toate modificările necitite ca citite
      const unreadModifications = modifications.filter(mod => !mod.read)
      const batch = writeBatch(db)
      
      unreadModifications.forEach(mod => {
        const readStatusDoc = doc(db, "work_modifications_read", `${userData.uid}_${mod.id}`)
        batch.set(readStatusDoc, {
          userId: userData.uid,
          modificationId: mod.id,
          readAt: serverTimestamp()
        })
      })
      
      await batch.commit()
      console.log(`✅ ${unreadModifications.length} modificări marcate ca citite`)
    } catch (error) {
      console.error("❌ Eroare la marcarea în masă ca citite:", error)
    }
  }

  return {
    modifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: () => {
      // Hook-ul Firebase se actualizează automat prin real-time listeners
      console.log("Refresh - hook-ul Firebase se actualizează automat")
    }
  }
}

// Hook pentru a crea notificări de modificări (va fi folosit în viitor)
export function useCreateWorkModification() {
  const { userData } = useAuth()

  const createModification = async (
    lucrareId: string,
    lucrareTitle: string,
    modificationType: WorkModification['modificationType'],
    description: string,
    oldValue?: string,
    newValue?: string,
    priority: WorkModification['priority'] = 'medium'
  ) => {
    if (!userData?.uid) return

    const modification: Omit<WorkModification, 'id'> = {
      lucrareId,
      lucrareTitle,
      modificationType,
      modifiedBy: userData.uid,
      modifiedByName: userData.displayName || userData.email || 'Utilizator necunoscut',
      modifiedAt: new Date(),
      oldValue,
      newValue,
      description,
      read: false,
      priority
    }

    // În implementarea finală, aici va fi apelul către Firebase
    console.log('Creare modificare:', modification)
    
    return modification
  }

  return { createModification }
} 