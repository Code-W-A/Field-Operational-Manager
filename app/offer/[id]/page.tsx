"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, X, AlertCircle } from "lucide-react"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

export default function OfferActionPage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const token = params.get("t") || ""
  const action = params.get("action") as ("accept" | "reject" | null)

  const [state, setState] = useState<"loading" | "success" | "error" | "expired" | "used" | "invalid">("loading")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    const run = async () => {
      try {
        if (!id || !token || !action || (action !== "accept" && action !== "reject")) {
          setState("invalid")
          setMessage("Link invalid. Contactați operatorul.")
          return
        }
        const ref = doc(db, "lucrari", id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setState("invalid")
          setMessage("Lucrarea nu există.")
          return
        }
        const data: any = snap.data()
        if (!data.offerActionToken || data.offerActionToken !== token) {
          setState("invalid")
          setMessage("Link invalid sau utilizat.")
          return
        }
        if (data.offerActionUsedAt) {
          setState("used")
          setMessage("Oferta a fost deja acceptată sau refuzată. Contactați operatorul.")
          return
        }
        const exp = data.offerActionExpiresAt?.toDate ? data.offerActionExpiresAt.toDate() : new Date(data.offerActionExpiresAt)
        if (exp && Date.now() > exp.getTime()) {
          setState("expired")
          setMessage("Link expirat. Contactați operatorul pentru o ofertă nouă.")
          return
        }

        await updateDoc(ref, {
          statusOferta: action === "accept" ? "OFERTAT" : "DA", // păstrăm logica internă existentă; ajustați după nevoie
          offerResponse: {
            status: action,
            at: new Date(),
          },
          offerActionUsedAt: new Date(),
        })
        setState("success")
        setMessage(action === "accept" ? "Ați acceptat oferta. Vă mulțumim!" : "Ați refuzat oferta. Am înregistrat răspunsul.")
      } catch (e) {
        console.error(e)
        setState("error")
        setMessage("A apărut o eroare. Încercați mai târziu sau contactați operatorul.")
      }
    }
    run()
  }, [id, token, action])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Confirmare ofertă</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state === "loading" && (
            <div className="text-sm text-muted-foreground">Se procesează...</div>
          )}
          {state === "success" && (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {(state === "error" || state === "expired" || state === "used" || state === "invalid") && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="pt-2">
            <Button asChild variant="outline">
              <a href="/">Înapoi la FOM</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
