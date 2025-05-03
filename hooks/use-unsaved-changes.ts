"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

/**
 * Hook to track unsaved changes in a form and show a confirmation dialog when navigating away
 * @param isDirty Boolean indicating if the form has unsaved changes
 * @returns Object containing a function to handle navigation with confirmation
 */
export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  // Handle browser back/refresh/close events
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return

      // Standard way to show a confirmation dialog when closing/refreshing the page
      e.preventDefault()
      e.returnValue = ""
      return ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isDirty])

  // Function to handle navigation with confirmation
  const handleNavigation = useCallback(
    (url: string) => {
      if (isDirty) {
        // If there are unsaved changes, store the URL and show the dialog
        setPendingUrl(url)
        setShowDialog(true)
        return false
      }

      // If no unsaved changes, navigate directly
      router.push(url)
      return true
    },
    [isDirty, router],
  )

  // Function to confirm navigation and proceed
  const confirmNavigation = useCallback(() => {
    setShowDialog(false)
    if (pendingUrl) {
      router.push(pendingUrl)
      setPendingUrl(null)
    }
  }, [pendingUrl, router])

  // Function to cancel navigation
  const cancelNavigation = useCallback(() => {
    setShowDialog(false)
    setPendingUrl(null)
  }, [])

  return {
    showDialog,
    pendingUrl,
    handleNavigation,
    confirmNavigation,
    cancelNavigation,
  }
}
