"use client"

import { useState, useEffect, useMemo } from "react"
import { useFirebaseCollection } from "./use-firebase-collection"
import { where, orderBy, limit } from "firebase/firestore"
import { WORK_STATUS } from "@/lib/utils/constants"

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

export function useWorkNotifications() {
  const [summary, setSummary] = useState<WorkNotificationsSummary>({
    totalNotifications: 0,
    notifications: [],
    criticalCount: 0,
    lastUpdated: new Date()
  })

  // Fetch only recent active work orders for notifications (limit for performance)
  const { data: lucrari, loading } = useFirebaseCollection("lucrari", [
    where("statusLucrare", "!=", WORK_STATUS.ARCHIVED),
    orderBy("updatedAt", "desc"),
    limit(200) // Limit to 200 most recent records to prevent loading thousands in production
  ])

  const calculatedSummary = useMemo(() => {
    if (!lucrari || lucrari.length === 0) {
      return {
        totalNotifications: 0,
        notifications: [],
        criticalCount: 0,
        lastUpdated: new Date()
      }
    }

    const notifications: WorkNotification[] = []
    let criticalCount = 0

    // 1. Lucrări neatribuite (fără tehnicieni)
    const unassignedCount = lucrari.filter(lucrare => 
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

    // 2. Lucrări în progres sau nefinalizate
    const inProgressCount = lucrari.filter(lucrare => 
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

    // 3. Lucrări finalizate dar fără factură
    const completedUninvoicedCount = lucrari.filter(lucrare => 
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

    // 4. Lucrări amânate (necesită reatribuire)
    const postponedCount = lucrari.filter(lucrare => 
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

    // 5. Lucrări foarte vechi (peste 7 zile fără update)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const overdueCount = lucrari.filter(lucrare => {
      if (lucrare.statusLucrare === WORK_STATUS.COMPLETED || lucrare.statusLucrare === WORK_STATUS.POSTPONED) return false
      const updatedAt = lucrare.updatedAt?.toDate ? lucrare.updatedAt.toDate() : new Date(lucrare.updatedAt)
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

  useEffect(() => {
    setSummary(calculatedSummary)
  }, [calculatedSummary])

  return {
    summary,
    loading,
    refresh: () => setSummary({ ...calculatedSummary, lastUpdated: new Date() })
  }
} 