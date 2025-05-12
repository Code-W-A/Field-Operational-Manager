import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"

type PendingTask = (() => void) | null   //  --- NEW ---

export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter()
  const pathname = usePathname()

  const [showDialog,  setShowDialog]  = useState(false)
  const [pendingUrl,  setPendingUrl]  = useState<string | null>(null)
  const [pendingTask, setPendingTask] = useState<PendingTask>(null)   //  --- NEW ---
  const isDirtyRef = useRef(isDirty)

  // ──────────────────────────────────────────────────────────────────────────
  // menținem referința sincronizată cu starea “dirty”
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // ──────────────────────────────────────────────────────────────────────────
  // blocăm închiderea/refresh-ul tab-ului
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      const msg = "Aveți modificări nesalvate. Sunteți sigur că doriți să părăsiți pagina?"
      e.preventDefault()
      e.returnValue = msg
      return msg
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  // ───────���──────────────────────────────────────────────────────────────────
  // 1️⃣  Navigare blocabilă (exact ca înainte)
  const handleNavigation = useCallback(
    (url: string) => {
      if (isDirtyRef.current) {
        setPendingUrl(url)
        setPendingTask(null)        //  ←  ne asigurăm că nu e și o acțiune
        setShowDialog(true)
        return false
      }
      router.push(url)
      return true
    },
    [router],
  )

  // 2️⃣  Orice acțiune blocabilă (închiderea unui dialog, resetarea unui formular etc.)
  //     O chemi așa:  handleBlockedAction(() => setDialogOpen(false))
  const handleBlockedAction = useCallback(               //  --- NEW ---
    (task: () => void) => {
      if (isDirtyRef.current) {
        setPendingTask(() => task)   // stocăm funcția
        setPendingUrl(null)
        setShowDialog(true)
        return false
      }
      task()
      return true
    },
    [],
  )

  // ──────────────────────────────────────────────────────────────────────────
  // confirmăm și executăm ce-a rămas în pending (url sau task)
  const confirmNavigation = useCallback(() => {
    setShowDialog(false)

    if (pendingTask) {             //  --- NEW ---
      pendingTask()
      setPendingTask(null)
    } else if (pendingUrl) {
      router.push(pendingUrl)
      setPendingUrl(null)
    }
  }, [pendingUrl, pendingTask, router])

  const cancelNavigation = useCallback(() => {
    setShowDialog(false)
    setPendingUrl(null)
    setPendingTask(null)           //  --- NEW ---
  }, [])

  return {
    // state
    showDialog,
    pendingUrl,

    // api
    handleNavigation,     // pt. schimbare de URL
    handleBlockedAction,  // pt. orice altă acțiune
    confirmNavigation,
    cancelNavigation,
  }
}
