"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function FirebaseCheckPage() {
  const [checks, setChecks] = useState({
    apiKey: { status: "pending", value: "" },
    authDomain: { status: "pending", value: "" },
    projectId: { status: "pending", value: "" },
    storageBucket: { status: "pending", value: "" },
    messagingSenderId: { status: "pending", value: "" },
    appId: { status: "pending", value: "" },
  })

  useEffect(() => {
    // Verificăm variabilele de mediu Firebase
    const newChecks = { ...checks }

    newChecks.apiKey.value = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
    newChecks.apiKey.status = newChecks.apiKey.value ? "success" : "error"

    newChecks.authDomain.value = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ""
    newChecks.authDomain.status = newChecks.authDomain.value ? "success" : "error"

    newChecks.projectId.value = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
    newChecks.projectId.status = newChecks.projectId.value ? "success" : "error"

    newChecks.storageBucket.value = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ""
    newChecks.storageBucket.status = newChecks.storageBucket.value ? "success" : "error"

    newChecks.messagingSenderId.value = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ""
    newChecks.messagingSenderId.status = newChecks.messagingSenderId.value ? "success" : "error"

    newChecks.appId.value = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""
    newChecks.appId.status = newChecks.appId.value ? "success" : "error"

    setChecks(newChecks)
  }, [])

  const allSuccess = Object.values(checks).every((check) => check.status === "success")

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Verificare Configurare Firebase</CardTitle>
          <CardDescription>
            Verificăm dacă toate variabilele de mediu necesare pentru Firebase sunt configurate corect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(checks).map(([key, check]) => (
            <div key={key} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">{key}</p>
                <p className="text-sm text-muted-foreground">
                  {check.value ? `${check.value.substring(0, 6)}...` : "Nedefinit"}
                </p>
              </div>
              {check.status === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
          ))}

          {!allSuccess && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Configurare incompletă</AlertTitle>
              <AlertDescription>
                Unele variabile de mediu Firebase lipsesc sau sunt incorecte. Verificați configurarea în fișierul
                .env.local sau în setările proiectului Vercel.
              </AlertDescription>
            </Alert>
          )}

          {allSuccess && (
            <Alert className="bg-green-50 text-green-800 border-green-200">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Configurare completă</AlertTitle>
              <AlertDescription>Toate variabilele de mediu Firebase sunt configurate corect.</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Link href="/" className="w-full">
            <Button className="w-full">Înapoi la pagina principală</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
