"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"

interface NavigationGuardProps {
  children: ReactNode
  when: boolean
  message?: string
}

export function NavigationGuard({ children, when, message }: NavigationGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [showDialog, setShowDialog] = useState(false)
  const [lastPathname, setLastPathname] = useState(pathname)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  useEffect(() => {
    // If pathname changed and we have unsaved changes, show dialog
    if (pathname !== lastPathname && when) {
      setShowDialog(true)
      setPendingNavigation(pathname)
      // We would need to prevent navigation here, but Next.js App Router doesn't
      // have a built-in way to do this yet. This is a simplified approach.
    } else {
      setLastPathname(pathname)
    }
  }, [pathname, lastPathname, when])

  // Handle browser back/refresh/close events
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!when) return

      // Standard way to show a confirmation dialog when closing/refreshing the page
      e.preventDefault()
      e.returnValue = message || "Changes you made may not be saved."
      return message || "Changes you made may not be saved."
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [when, message])

  const confirmNavigation = () => {
    setShowDialog(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
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
