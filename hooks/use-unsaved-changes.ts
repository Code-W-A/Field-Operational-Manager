"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"

/**
 * Hook to track unsaved changes in a form and show a confirmation dialog when navigating away
 * @param isDirty Boolean indicating if the form has unsaved changes
 * @returns Object containing functions to handle navigation with confirmation
 */
export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter()
  const pathname = usePathname()
  const [showDialog, setShowDialog] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const isDirtyRef = useRef(isDirty)

  // Keep the ref updated with the latest isDirty value
  useEffect(() => {
    isDirtyRef.current = isDirty
    console.log("Form dirty state changed:", isDirty)
  }, [isDirty])

  // Handle browser back/refresh/close events
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return

      console.log("beforeunload event triggered, isDirty:", isDirtyRef.current)

      // Standard way to show a confirmation dialog when closing/refreshing the page
      e.preventDefault()
      e.returnValue = "Aveți modificări nesalvate. Sunteți sigur că doriți să părăsiți pagina?"
      return "Aveți modificări nesalvate. Sunteți sigur că doriți să părăsiți pagina?"
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  // Function to handle navigation with confirmation
  const handleNavigation = useCallback(
    (url: string) => {
      console.log("handleNavigation called with URL:", url, "isDirty:", isDirtyRef.current)

      if (isDirtyRef.current) {
        // If there are unsaved changes, store the URL and show the dialog
        setPendingUrl(url)
        setShowDialog(true)
        return false
      }

      // If no unsaved changes, navigate directly
      router.push(url)
      return true
    },
    [router],
  )

  // Function to confirm navigation and proceed
  const confirmNavigation = useCallback(() => {
    console.log("confirmNavigation called, pendingUrl:", pendingUrl)
    setShowDialog(false)
    if (pendingUrl) {
      router.push(pendingUrl)
      setPendingUrl(null)
    }
  }, [pendingUrl, router])

  // Function to cancel navigation
  const cancelNavigation = useCallback(() => {
    console.log("cancelNavigation called")
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
