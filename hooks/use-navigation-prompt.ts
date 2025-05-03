"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"

/**
 * Hook pentru a afișa un prompt de confirmare când utilizatorul încearcă să navigheze
 * @param shouldPrompt - Boolean care indică dacă ar trebui să se afișeze promptul
 * @returns Funcții și stări pentru gestionarea promptului de navigare
 */
export function useNavigationPrompt(shouldPrompt: boolean) {
  const router = useRouter()
  const [showPrompt, setShowPrompt] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isNavigatingAway, setIsNavigatingAway] = useState(false)
  const shouldPromptRef = useRef(shouldPrompt)

  // Actualizăm referința când se schimbă valoarea
  useEffect(() => {
    shouldPromptRef.current = shouldPrompt
    console.log("Navigation prompt state updated:", shouldPrompt)
  }, [shouldPrompt])

  // Gestionăm evenimentul beforeunload pentru a preveni închiderea/reîncărcarea paginii
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!shouldPromptRef.current) return

      console.log("beforeunload event triggered, shouldPrompt:", shouldPromptRef.current)

      // Mesaj standard pentru a arăta un dialog de confirmare
      const message = "Aveți modificări nesalvate. Sunteți sigur că doriți să părăsiți pagina?"
      e.preventDefault()
      e.returnValue = message
      return message
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  // Funcție pentru a gestiona navigarea cu confirmare
  const confirmNavigation = useCallback(
    (url: string) => {
      if (shouldPromptRef.current) {
        console.log("Attempting navigation to:", url, "- Showing prompt")
        setPendingNavigation(url)
        setShowPrompt(true)
        return false
      } else {
        console.log("Navigating directly to:", url)
        router.push(url)
        return true
      }
    },
    [router],
  )

  // Funcție pentru a confirma navigarea și a continua
  const handleConfirm = useCallback(() => {
    console.log("Navigation confirmed, proceeding to:", pendingNavigation)
    setShowPrompt(false)
    setIsNavigatingAway(true)

    if (pendingNavigation) {
      setTimeout(() => {
        if (pendingNavigation === "#cancel") {
          // Tratăm cazul special pentru anulare
          if (onCancelRef.current) {
            onCancelRef.current()
          }
        } else {
          router.push(pendingNavigation)
        }
      }, 0)
    }
  }, [pendingNavigation, router])

  // Funcție pentru a anula navigarea
  const handleCancel = useCallback(() => {
    console.log("Navigation cancelled")
    setShowPrompt(false)
    setPendingNavigation(null)
  }, [])

  // Referință pentru funcția de anulare
  const onCancelRef = useRef<(() => void) | undefined>(undefined)

  // Funcție pentru a gestiona acțiunea de anulare a formularului
  const handleCancel2 = useCallback((onCancel?: () => void) => {
    // Salvăm funcția de anulare în referință
    onCancelRef.current = onCancel

    if (shouldPromptRef.current) {
      console.log("Cancel button clicked - Showing prompt")
      setPendingNavigation("#cancel")
      setShowPrompt(true)
    } else if (onCancel) {
      console.log("Cancel button clicked - No prompt needed")
      onCancel()
    }
  }, [])

  // Funcție pentru a confirma anularea formularului
  const confirmCancel = useCallback((onCancel?: () => void) => {
    console.log("Cancel confirmed")
    setShowPrompt(false)
    if (onCancel) {
      setTimeout(() => {
        onCancel()
      }, 0)
    }
  }, [])

  return {
    showPrompt,
    pendingNavigation,
    isNavigatingAway,
    confirmNavigation,
    handleConfirm,
    handleCancel,
    handleCancel2,
    confirmCancel,
  }
}
