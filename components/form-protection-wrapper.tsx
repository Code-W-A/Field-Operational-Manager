"use client"

import { type ReactNode, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"

interface FormProtectionWrapperProps {
  children: ReactNode
  isDirty: boolean
  onBeforeUnload?: () => void
}

export function FormProtectionWrapper({ children, isDirty, onBeforeUnload }: FormProtectionWrapperProps) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)

  // Handle browser back/refresh/close events
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return

      if (onBeforeUnload) {
        onBeforeUnload()
      }

      // Standard way to show a confirmation dialog when closing/refreshing the page
      e.preventDefault()
      e.returnValue = ""
      return ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    // Intercept navigation events
    const handleRouteChangeStart = () => {
      if (isDirty) {
        // If there are unsaved changes, show the dialog
        setShowDialog(true)
        // Return false to cancel the navigation
        return false
      }
      return true
    }

    // This is a simplified approach - in a real app, you'd need to use Next.js router events
    // or a more sophisticated approach to intercept navigation

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isDirty, onBeforeUnload])

  const confirmNavigation = () => {
    setShowDialog(false)
    if (pendingNavigation) {
      pendingNavigation()
      setPendingNavigation(null)
    }
  }

  const cancelNavigation = () => {
    setShowDialog(false)
    setPendingNavigation(null)
  }

  return (
    <>
      {children}
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
    </>
  )
}
