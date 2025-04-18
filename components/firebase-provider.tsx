"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Loader2, Info } from "lucide-react"
import { isPreviewEnvironment, isFirebaseAvailable } from "@/lib/utils/environment"

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [isPreview, setIsPreview] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Verificăm dacă suntem în mediul de preview
    const preview = isPreviewEnvironment()
    setIsPreview(preview)

    // Dacă suntem în preview, nu încercăm să inițializăm Firebase
    if (preview) {
      setIsFirebaseInitialized(true)
      return
    }

    // Importăm Firebase doar pe client
    const initializeFirebase = async () => {
      try {
        // Verificăm dacă suntem pe client
        if (typeof window !== "undefined") {
          // Verificăm dacă variabilele de mediu sunt definite
          if (!isFirebaseAvailable()) {
            throw new Error("Variabilele de mediu Firebase nu sunt configurate corect")
          }

          // Importăm configurația Firebase
          await import("@/lib/firebase/config")
          setIsFirebaseInitialized(true)
          setInitError(null)
        }
      } catch (error) {
        console.error("Eroare la inițializarea Firebase:", error)
        setInitError(error instanceof Error ? error.message : "Eroare necunoscută la inițializarea Firebase")
      }
    }

    initializeFirebase()
  }, [])

  // Dacă suntem pe o pagină care necesită Firebase și Firebase nu este încă inițializat
  if (!isFirebaseInitialized && (pathname?.includes("/dashboard") || pathname === "/login")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {initError ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Eroare la inițializarea Firebase</AlertTitle>
            <AlertDescription>
              {initError}. Verificați variabilele de mediu în fișierul .env.local sau în setările proiectului Vercel.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Se încarcă aplicația...</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {isPreview && (
        <Alert className="fixed bottom-4 right-4 max-w-md z-50 bg-yellow-50 border-yellow-200">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Mod Preview</AlertTitle>
          <AlertDescription>
            Aplicația rulează în modul preview cu date simulate. Funcționalitățile Firebase sunt dezactivate.
          </AlertDescription>
        </Alert>
      )}
      {children}
    </>
  )
}
