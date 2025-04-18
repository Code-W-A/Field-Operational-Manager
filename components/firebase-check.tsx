"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export function FirebaseCheck() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Verificăm dacă variabilele de mediu Firebase sunt definite
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

    if (!apiKey) {
      setError("NEXT_PUBLIC_FIREBASE_API_KEY nu este definit")
    } else if (!authDomain) {
      setError("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN nu este definit")
    } else if (!projectId) {
      setError("NEXT_PUBLIC_FIREBASE_PROJECT_ID nu este definit")
    } else {
      setError(null)
    }
  }, [])

  if (!error) return null

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Eroare de configurare Firebase</AlertTitle>
      <AlertDescription>
        {error}. Verificați variabilele de mediu în fișierul .env.local sau în setările proiectului Vercel.
      </AlertDescription>
    </Alert>
  )
}
