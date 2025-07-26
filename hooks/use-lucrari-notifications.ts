"use client"

import { useMemo, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"

interface LucrareNotification {
  id: string
  lucrareId: string
  lucrareTitle: string
  modificationType: 'status' | 'tehnician' | 'data_interventie' | 'other'
  modifiedAt: Date
  description: string
  read: boolean
  priority: 'low' | 'medium' | 'high'
}

export function useLucrariNotifications(lucrari: Lucrare[]) {
  const { userData } = useAuth()

  // Cheia pentru localStorage
  const lastSeenKey = `lucrari_last_seen_${userData?.uid || 'guest'}`
  
  // Obține timestamp-ul ultimei vizualizări
  const getLastSeenTimestamp = useCallback(() => {
    if (typeof window === 'undefined') return Date.now()
    const saved = localStorage.getItem(lastSeenKey)
    return saved ? parseInt(saved) : Date.now() - (24 * 60 * 60 * 1000) // Default: acum 24h
  }, [lastSeenKey])

  // Calculează notificările pe baza lucrărilor care nu au fost citite
  // NOTA: lucrari param conține deja doar lucrările non-arhivate (filtrate în query)
  const notifications = useMemo(() => {
    if (!lucrari || !userData?.uid) return []
    
    // DATA DE START pentru sistemul de notificări - 26 iulie 2025, ora 16:20
    const notificationSystemStartDate = new Date('2025-07-26T16:20:00.000Z').getTime()
    
    const notifications: LucrareNotification[] = []

    // Iterăm prin lucrările non-arhivate (deja filtrate în pagina lucrări)
    lucrari.forEach(lucrare => {
      // Verifică dacă lucrarea nu a fost citită de utilizatorul curent
      const isNotificationRead = lucrare.notificationRead === true || 
                                  (Array.isArray(lucrare.notificationReadBy) && 
                                   lucrare.notificationReadBy.includes(userData.uid))
      
      // Doar lucrările necitite și create/modificate după 26 iulie sunt notificări
      if (!isNotificationRead) {
        const updatedAtTimestamp = lucrare.updatedAt?.toMillis ? lucrare.updatedAt.toMillis() : 0
        const createdAtTimestamp = lucrare.createdAt?.toMillis ? lucrare.createdAt.toMillis() : 0
        
        // LOGICĂ STRICTĂ: Doar lucrările modificate după 26 iulie 2025, ora 16:20
        // Verificăm DOAR updatedAt (data modificării), nu createdAt
        const isModifiedAfterStart = updatedAtTimestamp >= notificationSystemStartDate
        
        // DEBUG: Log pentru a înțelege ce lucrări sunt incluse/excluse
        console.log('🔍 Verificare notificare:', {
          title: `${lucrare.client} - ${lucrare.locatie}`,
          updatedAt: new Date(updatedAtTimestamp).toLocaleString('ro-RO'),
          startDate: new Date(notificationSystemStartDate).toLocaleString('ro-RO'),
          isModifiedAfterStart,
          shouldInclude: isModifiedAfterStart
        })
        
        if (isModifiedAfterStart) { // Doar lucrările modificate după 26 iulie 2025, 16:20
          // Determină tipul modificării pe baza statusului și datelor
          let modificationType: LucrareNotification['modificationType'] = 'other'
          let description = ''
          let priority: LucrareNotification['priority'] = 'medium'

          // Analiză pe baza statusului și datelor lucrării
          if (!lucrare.tehnicieni || lucrare.tehnicieni.length === 0) {
            modificationType = 'tehnician'
            description = `Lucrare neatribuită: ${lucrare.client || ''} - ${lucrare.locatie || ''}`
            priority = 'high'
          } else if (lucrare.statusLucrare === 'Finalizat' && !lucrare.facturaDocument) {
            modificationType = 'other'
            description = `Lucrare finalizată fără factură: ${lucrare.client || ''}`
            priority = 'high'
          } else if (lucrare.statusLucrare === 'Amânată') {
            modificationType = 'other'
            description = `Lucrare amânată: ${lucrare.client || ''} - ${lucrare.locatie || ''}`
            priority = 'high'
          } else if (lucrare.statusLucrare) {
            modificationType = 'status'
            description = `${lucrare.statusLucrare}: ${lucrare.client || ''} - ${lucrare.locatie || ''}`
            priority = lucrare.statusLucrare === 'Finalizat' ? 'high' : 'medium'
          } else {
            description = `Lucrare nouă: ${lucrare.client || ''} - ${lucrare.locatie || ''}`
          }

          notifications.push({
            id: lucrare.id || `temp_${Math.random()}`,
            lucrareId: lucrare.id || '',
            lucrareTitle: `${lucrare.client || ''} - ${lucrare.locatie || ''}`.trim(),
            modificationType,
            modifiedAt: lucrare.updatedAt?.toDate ? lucrare.updatedAt.toDate() : new Date(),
            description,
            read: false, // Toate notificările aici sunt necitite
            priority
          })
        }
      }
    })

    // Sortează după dată (cele mai recente primul)
    return notifications.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  }, [lucrari, userData?.uid])

  // Numărul de notificări necitite
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Marchează toate notificările (lucrările) ca citite în Firestore
  const markAllAsRead = useCallback(async () => {
    if (!userData?.uid) return
    
    try {
      // Obținem toate lucrările necitite din lista curentă
      const unreadLucrari = lucrari.filter(lucrare => {
        const isNotificationRead = lucrare.notificationRead === true || 
                                    (Array.isArray(lucrare.notificationReadBy) && 
                                     lucrare.notificationReadBy.includes(userData.uid))
        return !isNotificationRead
      })

      // Actualizăm fiecare lucrare necitită
      const { updateLucrare } = await import('@/lib/firebase/firestore')
      
      for (const lucrare of unreadLucrari) {
        if (lucrare.id) {
          // Adăugăm user-ul la lista celor care au citit notificarea
          const currentReadBy = Array.isArray(lucrare.notificationReadBy) ? lucrare.notificationReadBy : []
          const updatedReadBy = [...new Set([...currentReadBy, userData.uid])]
          
          // Folosim parametrul silent pentru a nu modifica data ultimei modificări
          await updateLucrare(lucrare.id, {
            notificationReadBy: updatedReadBy,
            notificationRead: true // Pentru compatibilitate
          }, undefined, undefined, true) // silent = true
        }
      }
      
      console.log(`✅ ${unreadLucrari.length} notificări marcate ca citite`)
    } catch (error) {
      console.error("❌ Eroare la marcarea în masă ca citite:", error)
    }
  }, [lucrari, userData?.uid])

  // Marchează o notificare specifică (lucrare) ca citită
  const markAsRead = useCallback(async (lucrareId: string) => {
    if (!userData?.uid) return
    
    try {
      const lucrare = lucrari.find(l => l.id === lucrareId)
      if (!lucrare) return

      const { updateLucrare } = await import('@/lib/firebase/firestore')
      
      // Adăugăm user-ul la lista celor care au citit notificarea
      const currentReadBy = Array.isArray(lucrare.notificationReadBy) ? lucrare.notificationReadBy : []
      const updatedReadBy = [...new Set([...currentReadBy, userData.uid])]
      
      // Folosim parametrul silent pentru a nu modifica data ultimei modificări
      await updateLucrare(lucrareId, {
        notificationReadBy: updatedReadBy,
        notificationRead: true // Pentru compatibilitate
      }, undefined, undefined, true) // silent = true
      
      console.log(`✅ Notificare marcată ca citită pentru lucrarea: ${lucrareId}`)
    } catch (error) {
      console.error("❌ Eroare la marcarea ca citită:", error)
    }
  }, [lucrari, userData?.uid])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    loading: false // Folosim datele deja încărcate
  }
} 