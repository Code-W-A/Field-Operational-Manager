"use client"

import { useState, useEffect } from "react"
import type { Setting } from "@/types/settings"
import { subscribeToSettings, getInheritedValue } from "@/lib/firebase/settings"

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

