"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function useNavigationPrompt(shouldPrompt: boolean) {
  const router = useRouter()
  const [showPrompt, setShowPrompt] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  // Funcție pentru a testa dialogul
  const testDialog = useCallback(() => {
    if (shouldPrompt) {
      setShowPrompt(true)
      setPendingUrl(null)
    }
  }, [shouldPrompt])

  // Funcție pentru a confirma navigarea
  const confirmNavigation = useCallback(() => {
    setShowPrompt(false)
    setIsNavigating(true)

    if (pendingUrl) {
      router.push(pendingUrl)
    }

    setPendingUrl(null)
  }, [pendingUrl, router])

  // Funcție pentru a anula navigarea
  const cancelNavigation = useCallback(() => {
    setShowPrompt(false)
    setPendingUrl(null)
  }, [])

  // Funcție pentru a naviga cu confirmare
  const navigateTo = useCallback(
    (url: string) => {
      if (shouldPrompt && !isNavigating) {
        setShowPrompt(true)
        setPendingUrl(url)
        return false
      } else {
        router.push(url)
        return true
      }
    },
    [shouldPrompt, isNavigating, router],
  )

  // Adaugă un event listener pentru beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldPrompt) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [shouldPrompt])

  return {
    showPrompt,
    pendingUrl,
    confirmNavigation,
    cancelNavigation,
    navigateTo,
    testDialog,
  }
}
