"use client"

import { useMemo, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useFirebaseCollection } from "./use-firebase-collection"
import { where, orderBy, limit } from "firebase/firestore"
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
  // Informații despre cine a făcut modificarea
  modifiedBy?: string
  modifiedByName?: string
  oldValue?: string
  newValue?: string
  // Pentru lucrări întârziate
  isOverdue?: boolean
  // Pentru a distinge sursele
  source: 'work_modifications' | 'legacy_system'
}

export function useLucrariNotifications(lucrari: Lucrare[]) {
  const { userData } = useAuth()

  // Citim modificările din work_modifications pentru a avea detalii exacte
  const { data: workModifications } = useFirebaseCollection(
    "work_modifications",
    userData?.uid ? [
      where("modifiedBy", "!=", userData.uid), // Excludem modificările proprii
      orderBy("modifiedAt", "desc"),
      limit(50) // Limită pentru optimizare
    ] : []
  )

  // Citim statusurile de citit pentru work_modifications
  const { data: readStatuses } = useFirebaseCollection(
    "work_modifications_read",
    userData?.uid ? [
      where("userId", "==", userData.uid),
      limit(100)
    ] : []
  )

  // Calculează notificările pe baza modificărilor reale + sistem vechi + lucrări întârziate
  const notifications = useMemo(() => {
    if (!userData?.uid) return []
    
    const notifications: LucrareNotification[] = []
    const notificationSystemStartDate = new Date('2025-07-26T16:20:00.000Z').getTime()
    
    // Creăm un Set cu ID-urile modificărilor citite din work_modifications
    const readModificationIds = new Set(
      readStatuses?.map(status => status.modificationId) || []
    )

    // Creăm un Set cu ID-urile lucrărilor care au work_modifications pentru a evita duplicatele
    const lucrariWithWorkModifications = new Set<string>()

    // 1. NOTIFICĂRI DIN WORK_MODIFICATIONS (modificări exact + cine le-a făcut)
    if (workModifications) {
      workModifications.forEach(modification => {
        const modifiedAtTimestamp = modification.modifiedAt?.toMillis ? 
          modification.modifiedAt.toMillis() : 
          new Date(modification.modifiedAt).getTime()
        
        // Doar modificările după data de start
        if (modifiedAtTimestamp >= notificationSystemStartDate) {
          // Verificăm dacă lucrarea modificată este în lista curentă (non-arhivată)
          const lucrareExists = lucrari.some(l => l.id === modification.lucrareId)
          
          if (lucrareExists) {
            lucrariWithWorkModifications.add(modification.lucrareId)
            
            // Generăm descrierea detaliată bazată pe modificarea reală
            let description = modification.description || "Modificare necunoscută"
            
            // Îmbunătățim descrierea cu detalii about oldValue și newValue
            if (modification.oldValue && modification.newValue) {
              switch (modification.modificationType) {
                case 'status':
                  description = `Status schimbat din "${modification.oldValue}" în "${modification.newValue}" de către ${modification.modifiedByName}`
                  break
                case 'assignment':
                  description = `Atribuire schimbată din "${modification.oldValue}" în "${modification.newValue}" de către ${modification.modifiedByName}`
                  break
                case 'schedule':
                  description = `Data intervenție schimbată din "${modification.oldValue}" în "${modification.newValue}" de către ${modification.modifiedByName}`
                  break
                default:
                  description = `${modification.description} de către ${modification.modifiedByName}`
              }
            } else {
              description = `${modification.description} de către ${modification.modifiedByName}`
            }

            notifications.push({
              id: modification.id,
              lucrareId: modification.lucrareId,
              lucrareTitle: modification.lucrareTitle,
              modificationType: modification.modificationType === 'assignment' ? 'tehnician' : 
                               modification.modificationType === 'schedule' ? 'data_interventie' :
                               modification.modificationType,
              modifiedAt: modification.modifiedAt?.toDate ? modification.modifiedAt.toDate() : new Date(modification.modifiedAt),
              description,
              read: readModificationIds.has(modification.id),
              priority: modification.priority || 'medium',
              modifiedBy: modification.modifiedBy,
              modifiedByName: modification.modifiedByName,
              oldValue: modification.oldValue,
              newValue: modification.newValue,
              isOverdue: false,
              source: 'work_modifications'
            })
          }
        }
      })
    }

    // 2. SISTEM VECHI - Pentru modificările care nu au work_modifications (COMPATIBILITATE)
    lucrari.forEach(lucrare => {
      // Skip dacă lucrarea deja are work_modifications (evităm duplicatele)
      if (lucrariWithWorkModifications.has(lucrare.id || '')) {
        return
      }

      // Verifică dacă lucrarea nu a fost citită de utilizatorul curent
      const isNotificationRead = lucrare.notificationRead === true || 
                                  (Array.isArray(lucrare.notificationReadBy) && 
                                   lucrare.notificationReadBy.includes(userData.uid))
      
      // Doar lucrările necitite și create/modificate după 26 iulie sunt notificări
      if (!isNotificationRead) {
        const updatedAtTimestamp = lucrare.updatedAt?.toMillis ? lucrare.updatedAt.toMillis() : 0
        
        // LOGICĂ STRICTĂ: Doar lucrările modificate după 26 iulie 2025, ora 16:20
        const isModifiedAfterStart = updatedAtTimestamp >= notificationSystemStartDate
        
        if (isModifiedAfterStart) {
          // Determină tipul modificării pe baza statusului și datelor (sistem vechi)
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
            priority,
            modifiedBy: undefined, // Nu avem aceste informații în sistemul vechi
            modifiedByName: undefined,
            oldValue: undefined,
            newValue: undefined,
            isOverdue: false,
            source: 'legacy_system'
          })
        }
      }
    })

    // 3. NOTIFICĂRI PENTRU LUCRĂRI ÎNTÂRZIATE (cerința clientului)
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today

    lucrari.forEach(lucrare => {
      // Verificăm dacă lucrarea are data de intervenție trecută și nu este finalizată
      if (lucrare.dataInterventie && 
          (lucrare.statusLucrare === 'Atribuită' || lucrare.statusLucrare === 'În lucru') &&
          !lucrare.archivedAt) {
        
        let dataInterventie: Date
        
        // Parsăm data intervenției din diferite formate
        if (typeof lucrare.dataInterventie === 'string') {
          // Format: "dd.MM.yyyy HH:mm"
          const [datePart, timePart] = lucrare.dataInterventie.split(' ')
          const [day, month, year] = datePart.split('.')
          const [hour, minute] = (timePart || '00:00').split(':')
          dataInterventie = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
        } else {
          dataInterventie = new Date(lucrare.dataInterventie)
        }

        // Verificăm dacă data de intervenție a trecut
        if (dataInterventie < today) {
          const daysOverdue = Math.floor((today.getTime() - dataInterventie.getTime()) / (1000 * 60 * 60 * 24))
          
          // Creăm o notificare pentru lucrarea întârziată
          const overdueId = `overdue_${lucrare.id}_${dataInterventie.getTime()}`
          
          // Verificăm dacă această notificare de întârziere nu a fost deja citită
          const isOverdueRead = lucrare.notificationRead === true || 
                                (Array.isArray(lucrare.notificationReadBy) && 
                                 lucrare.notificationReadBy.includes(userData.uid))
          
          if (!isOverdueRead) {
            notifications.push({
              id: overdueId,
              lucrareId: lucrare.id || '',
              lucrareTitle: `${lucrare.client || ''} - ${lucrare.locatie || ''}`.trim(),
              modificationType: 'other',
              modifiedAt: dataInterventie, // Folosim data intervenției pentru sortare
              description: `Lucrare întârziată cu ${daysOverdue} ${daysOverdue === 1 ? 'zi' : 'zile'} - data planificată: ${lucrare.dataInterventie}`,
              read: false,
              priority: daysOverdue >= 3 ? 'high' : daysOverdue >= 1 ? 'medium' : 'low',
              modifiedBy: 'system',
              modifiedByName: 'Sistem automat',
              isOverdue: true,
              source: 'legacy_system'
            })
          }
        }
      }
    })

    // Sortează după dată (cele mai recente primul)
    return notifications.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  }, [lucrari, userData?.uid, workModifications, readStatuses])

  // Numărul de notificări necitite
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Marchează o modificare de work_modifications ca citită
  const markWorkModificationAsRead = useCallback(async (modificationId: string) => {
    if (!userData?.uid) return
    
    try {
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase/firebase')
      
      const readStatusDoc = doc(db, "work_modifications_read", `${userData.uid}_${modificationId}`)
      await setDoc(readStatusDoc, {
        userId: userData.uid,
        modificationId,
        readAt: serverTimestamp()
      })
      console.log("✅ Work modification marcată ca citită:", modificationId)
    } catch (error) {
      console.error("❌ Eroare la marcarea work modification ca citită:", error)
    }
  }, [userData?.uid])

  // Marchează toate notificările ca citite
  const markAllAsRead = useCallback(async () => {
    if (!userData?.uid) return
    
    try {
      const { writeBatch, doc, serverTimestamp } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase/firebase')
      const { updateLucrare } = await import('@/lib/firebase/firestore')
      
      const batch = writeBatch(db)
      
      // Marchează work_modifications ca citite
      const unreadWorkModifications = notifications.filter(n => !n.read && n.source === 'work_modifications')
      unreadWorkModifications.forEach(notification => {
        const readStatusDoc = doc(db, "work_modifications_read", `${userData.uid}_${notification.id}`)
        batch.set(readStatusDoc, {
          userId: userData.uid,
          modificationId: notification.id,
          readAt: serverTimestamp()
        })
      })
      
      await batch.commit()
      
      // Marchează notificările din sistemul vechi (legacy + overdue) ca citite în lucrari collection
      const legacyNotifications = notifications.filter(n => !n.read && n.source === 'legacy_system')
      for (const notification of legacyNotifications) {
        const lucrare = lucrari.find(l => l.id === notification.lucrareId)
        if (lucrare) {
          const currentReadBy = Array.isArray(lucrare.notificationReadBy) ? lucrare.notificationReadBy : []
          const updatedReadBy = [...new Set([...currentReadBy, userData.uid])]
          
          await updateLucrare(notification.lucrareId, {
            notificationReadBy: updatedReadBy,
            notificationRead: true
          }, undefined, undefined, true) // silent = true
        }
      }
      
      console.log(`✅ ${notifications.filter(n => !n.read).length} notificări marcate ca citite`)
    } catch (error) {
      console.error("❌ Eroare la marcarea în masă ca citite:", error)
    }
  }, [notifications, lucrari, userData?.uid])

  // Marchează o notificare specifică ca citită
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userData?.uid) return
    
    const notification = notifications.find(n => n.id === notificationId)
    if (!notification) return

    try {
      if (notification.source === 'work_modifications') {
        // Pentru work_modifications, marchează în work_modifications_read
        await markWorkModificationAsRead(notificationId)
      } else {
        // Pentru sistemul vechi (legacy + overdue), marchează în lucrari collection
        const lucrare = lucrari.find(l => l.id === notification.lucrareId)
      const { updateLucrare } = await import('@/lib/firebase/firestore')
      
        if (lucrare) {
      const currentReadBy = Array.isArray(lucrare.notificationReadBy) ? lucrare.notificationReadBy : []
      const updatedReadBy = [...new Set([...currentReadBy, userData.uid])]
      
          await updateLucrare(notification.lucrareId, {
        notificationReadBy: updatedReadBy,
            notificationRead: true
      }, undefined, undefined, true) // silent = true
        }
      }
      
      console.log(`✅ Notificare marcată ca citită: ${notificationId} (${notification.source})`)
    } catch (error) {
      console.error("❌ Eroare la marcarea ca citită:", error)
    }
  }, [notifications, lucrari, userData?.uid, markWorkModificationAsRead])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    loading: false
  }
} 