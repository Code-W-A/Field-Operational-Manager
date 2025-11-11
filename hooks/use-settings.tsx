"use client"

import { useState, useEffect, useRef } from "react"
import type { Setting } from "@/types/settings"
import { subscribeToSettings, subscribeToSettingsByTarget, getInheritedValue } from "@/lib/firebase/settings"

export function useSettings(parentId: string | null) {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const unsubscribe = subscribeToSettings(parentId, (newSettings) => {
      setSettings(newSettings)
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [parentId])

  return { settings, loading, error }
}

export function useSettingValue(setting: Setting | null) {
  const [value, setValue] = useState<any>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!setting) {
      setValue(undefined)
      setLoading(false)
      return
    }

    setLoading(true)
    getInheritedValue(setting)
      .then((val) => {
        setValue(val)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Error getting inherited value:", err)
        setLoading(false)
      })
  }, [setting])

  return { value, loading }
}

// Returns the list of child settings for any setting bound to a given targetId
export function useTargetList(targetId: string) {
  const [items, setItems] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const childUnsubsRef = useRef<Record<string, () => void>>({})

  useEffect(() => {
    setLoading(true)
    setItems([])
    // cleanup previous child subscriptions
    Object.values(childUnsubsRef.current).forEach((u) => u && u())
    childUnsubsRef.current = {}

    const unsubParents = subscribeToSettingsByTarget(targetId, (parents) => {
      // unsubscribe from removed parents
      const currentIds = new Set(parents.map((p) => p.id))
      for (const pid of Object.keys(childUnsubsRef.current)) {
        if (!currentIds.has(pid)) {
          childUnsubsRef.current[pid]!()
          delete childUnsubsRef.current[pid]
        }
      }
      if (parents.length === 0) {
        setItems([])
        setLoading(false)
        return
      }
      // subscribe to children for each parent
      parents.forEach((p) => {
        if (childUnsubsRef.current[p.id]) return
        childUnsubsRef.current[p.id] = subscribeToSettings(p.id, (children) => {
          // merge children from all parents
          setItems((prev) => {
            const other = prev.filter((c) => c.parentId !== p.id)
            const next = [...other, ...children]
            // stable sort by order then name
            next.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name))
            return next
          })
          setLoading(false)
        })
      })
    })

    return () => {
      unsubParents()
      Object.values(childUnsubsRef.current).forEach((u) => u && u())
      childUnsubsRef.current = {}
    }
  }, [targetId])

  return { items, loading }
}

// Returns the first setting's value bound to targetId (useful for single value targets)
export function useTargetValue<T = any>(targetId: string) {
  const [value, setValue] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeToSettingsByTarget(targetId, async (settings) => {
      if (!settings.length) {
        setValue(undefined)
        setLoading(false)
        return
      }
      const s = settings[0]
      try {
        const v = await getInheritedValue(s)
        setValue(v as T)
      } catch {
        setValue((s as any)?.value as T)
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [targetId])

  return { value, loading }
}

