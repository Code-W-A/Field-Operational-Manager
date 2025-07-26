"use client"

import { useMemo } from "react"
import { WORK_STATUS } from "@/lib/utils/constants"
import type { Lucrare } from "@/lib/firebase/firestore"

export interface WorkNotification {
  type: 'unassigned' | 'in_progress' | 'completed_uninvoiced' | 'overdue' | 'postponed'
  count: number
  description: string
  priority: 'high' | 'medium' | 'low'
  color: string
}

export interface WorkNotificationsSummary {
  totalNotifications: number
  notifications: WorkNotification[]
  criticalCount: number
  lastUpdated: Date
}

export function useLucrariWelcomeNotifications(lucrari: Lucrare[]) {
  const summary = useMemo(() => {
    if (!lucrari || lucrari.length === 0) {
      return {
        totalNotifications: 0,
        notifications: [],
        criticalCount: 0,
        lastUpdated: new Date()
      }
    }

    // DATA DE START pentru sistemul de notificări - 26 iulie 2025, ora 16:20
    const notificationSystemStartDate = new Date('2025-07-26T16:20:00.000Z').getTime()

    const notifications: WorkNotification[] = []
    let criticalCount = 0

    // Filtrăm doar lucrările modificate după 26 iulie 2025, ora 16:20
    const validLucrari = lucrari.filter(lucrare => {
      const updatedAtTimestamp = lucrare.updatedAt?.toMillis ? lucrare.updatedAt.toMillis() : 0
      const isModifiedAfterStart = updatedAtTimestamp >= notificationSystemStartDate
      
      // DEBUG: Log pentru welcome dialog
      if (lucrare.client && lucrare.locatie) {
        console.log('🏠 Welcome dialog - verificare lucrare:', {
          title: `${lucrare.client} - ${lucrare.locatie}`,
          updatedAt: new Date(updatedAtTimestamp).toLocaleString('ro-RO'),
          startDate: new Date(notificationSystemStartDate).toLocaleString('ro-RO'),
          isIncluded: isModifiedAfterStart
        })
      }
      
      return isModifiedAfterStart
    })

    // 1. Lucrări neatribuite (fără tehnicieni) - doar din lucrările valide
    const unassignedCount = validLucrari.filter(lucrare => 
      !lucrare.tehnicieni || lucrare.tehnicieni.length === 0
    ).length

    if (unassignedCount > 0) {
      notifications.push({
        type: 'unassigned',
        count: unassignedCount,
        description: `${unassignedCount} lucrări neatribuite`,
        priority: 'high',
        color: 'text-red-600'
      })
      criticalCount += unassignedCount
    }

    // 2. Lucrări în progres sau nefinalizate - doar din lucrările valide
    const inProgressCount = validLucrari.filter(lucrare => 
      lucrare.statusLucrare === WORK_STATUS.IN_PROGRESS ||
      lucrare.statusLucrare === WORK_STATUS.LISTED ||
      lucrare.statusLucrare === WORK_STATUS.ASSIGNED ||
      lucrare.statusLucrare === WORK_STATUS.WAITING
    ).length

    if (inProgressCount > 0) {
      notifications.push({
        type: 'in_progress',
        count: inProgressCount,
        description: `${inProgressCount} lucrări în progres`,
        priority: 'medium',
        color: 'text-orange-600'
      })
    }

    // 3. Lucrări finalizate dar fără factură - doar din lucrările valide
    const completedUninvoicedCount = validLucrari.filter(lucrare => 
      lucrare.statusLucrare === WORK_STATUS.COMPLETED && 
      !lucrare.facturaDocument
    ).length

    if (completedUninvoicedCount > 0) {
      notifications.push({
        type: 'completed_uninvoiced',
        count: completedUninvoicedCount,
        description: `${completedUninvoicedCount} lucrări finalizate fără factură`,
        priority: 'high',
        color: 'text-red-600'
      })
      criticalCount += completedUninvoicedCount
    }

    // 4. Lucrări amânate (necesită reatribuire) - doar din lucrările valide
    const postponedCount = validLucrari.filter(lucrare => 
      lucrare.statusLucrare === WORK_STATUS.POSTPONED
    ).length

    if (postponedCount > 0) {
      notifications.push({
        type: 'postponed',
        count: postponedCount,
        description: `${postponedCount} lucrări amânate de tehnicieni`,
        priority: 'high',
        color: 'text-purple-600'
      })
      criticalCount += postponedCount
    }

    // 5. Lucrări foarte vechi (peste 7 zile fără update) - doar din lucrările valide
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const overdueCount = validLucrari.filter(lucrare => {
      if (lucrare.statusLucrare === WORK_STATUS.COMPLETED || lucrare.statusLucrare === WORK_STATUS.POSTPONED) return false
      if (!lucrare.updatedAt) return false
      const updatedAt = lucrare.updatedAt?.toDate ? lucrare.updatedAt.toDate() : new Date()
      return updatedAt < sevenDaysAgo
    }).length

    if (overdueCount > 0) {
      notifications.push({
        type: 'overdue',
        count: overdueCount,
        description: `${overdueCount} lucrări întârziate (>7 zile)`,
        priority: 'high',
        color: 'text-red-600'
      })
      criticalCount += overdueCount
    }

    const totalNotifications = notifications.reduce((sum, notif) => sum + notif.count, 0)

    return {
      totalNotifications,
      notifications,
      criticalCount,
      lastUpdated: new Date()
    }
  }, [lucrari])

  return {
    summary,
    loading: false, // Folosim datele deja încărcate
    refresh: () => {} // Nu mai avem nevoie de refresh, datele se actualizează automat
  }
} 