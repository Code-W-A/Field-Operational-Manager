"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  // Handle browser navigation events
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Handle Next.js navigation
  const handleNavigation = useCallback(
    (url: string) => {
      if (hasUnsavedChanges) {
        setPendingUrl(url)
        setShowDialog(true)
        return false
      }
      return true
    },
    [hasUnsavedChanges],
  )

  const confirmNavigation = useCallback(() => {
    setShowDialog(false)
    if (pendingUrl) {
      if (pendingUrl.startsWith("#")) {
        // Handle special actions
        // This is for internal actions like cancel
      } else {
        router.push(pendingUrl)
      }
    }
  }, [pendingUrl, router])

  const cancelNavigation = useCallback(() => {
    setShowDialog(false)
    setPendingUrl(null)
  }, [])

  return {
    showDialog,
    handleNavigation,
    confirmNavigation,
    cancelNavigation,
    pendingUrl,
  }
}
