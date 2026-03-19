"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { AlertCircle, Check, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type PageState = "loading" | "ready" | "success" | "error" | "expired" | "used" | "invalid"

export default function CrmOfferActionPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const searchParams = useSearchParams()
  const token = searchParams.get("t") || ""
  const action = searchParams.get("action") as "accept" | "reject" | null

  const [state, setState] = useState<PageState>("loading")
  const [message, setMessage] = useState("")
  const [offerData, setOfferData] = useState<any>(null)
  const [verificationEmail, setVerificationEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationMessage, setVerificationMessage] = useState("")
  const [verificationProof, setVerificationProof] = useState("")
  const [isVerified, setIsVerified] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [reason, setReason] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        setState("loading")
        if (!offerId || !token || !action || (action !== "accept" && action !== "reject")) {
          setState("invalid")
          setMessage("Link invalid. Contactați operatorul.")
          return
        }

        const query = new URLSearchParams({ offerId, token })
        const response = await fetch(`/api/crm/offers/public?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))

        if (payload?.offer?.recipientEmail) {
          setVerificationEmail(String(payload.offer.recipientEmail))
        }
        setOfferData(payload?.offer || null)

        if (payload?.status === "invalid") {
          setState("invalid")
          setMessage(payload?.message || "Link invalid.")
          return
        }
        if (payload?.status === "used") {
          setState("used")
          setMessage(payload?.message || "Oferta a fost deja procesată.")
          return
        }
        if (payload?.status === "expired") {
          setState("expired")
          setMessage(payload?.message || "Link expirat.")
          return
        }
        if (!response.ok || payload?.status !== "ready") {
          setState("error")
          setMessage(payload?.message || "Nu am putut încărca oferta.")
          return
        }

        setState("ready")
        setMessage("")
      } catch (error) {
        setState("error")
        setMessage(error instanceof Error ? error.message : "Eroare neașteptată.")
      }
    }

    void load()
  }, [action, offerId, token])

  const sendCode = async () => {
    if (!offerId || !token || !verificationEmail || isSendingCode) return
    try {
      setIsSendingCode(true)
      setVerificationMessage("")
      const response = await fetch("/api/crm/offers/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, token, email: verificationEmail }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setVerificationMessage(String(payload?.message || "Nu am putut trimite codul."))
        return
      }
      setVerificationMessage("Codul a fost trimis pe email.")
    } finally {
      setIsSendingCode(false)
    }
  }

  const verifyCode = async () => {
    if (!offerId || !token || !verificationEmail || !verificationCode || isVerifying) return
    try {
      setIsVerifying(true)
      setVerificationMessage("")
      const response = await fetch("/api/crm/offers/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, token, email: verificationEmail, code: verificationCode }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.status !== "verified") {
        setVerificationMessage(String(payload?.message || "Cod invalid."))
        return
      }
      setIsVerified(true)
      setVerificationProof(String(payload?.verificationProof || ""))
      setVerificationMessage("Cod validat. Poți confirma acum răspunsul.")
    } finally {
      setIsVerifying(false)
    }
  }

  const respond = async () => {
    if (!offerId || !token || !action || !verificationProof || isResponding) return
    try {
      setIsResponding(true)
      const response = await fetch("/api/crm/offers/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId,
          token,
          action,
          reason: action === "reject" ? reason : "",
          verificationProof,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.status !== "success") {
        setState("error")
        setMessage(String(payload?.message || "Nu am putut procesa răspunsul."))
        return
      }
      setState("success")
      setMessage(String(payload?.message || "Răspuns înregistrat cu succes."))
    } finally {
      setIsResponding(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Răspuns ofertă CRM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" ? <p>Se încarcă oferta...</p> : null}
          {state === "invalid" || state === "used" || state === "expired" || state === "error" ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{message || "Acțiune indisponibilă."}</AlertDescription>
            </Alert>
          ) : null}
          {state === "success" ? (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>{message || "Răspuns înregistrat."}</AlertDescription>
            </Alert>
          ) : null}

          {state === "ready" ? (
            <>
              <div className="space-y-1 text-sm text-neutral-700">
                <p><strong>Subiect:</strong> {String(offerData?.subject || "-")}</p>
                <p><strong>Versiune:</strong> {String(offerData?.version || "-")}</p>
                <p><strong>Total:</strong> {Number(offerData?.snapshot?.total || 0).toFixed(2)} lei (fără TVA)</p>
                <p><strong>Destinatar:</strong> {String(offerData?.recipientEmail || "-")}</p>
              </div>

              {offerData?.pdfUrl ? (
                <Button asChild variant="outline">
                  <a href={String(offerData.pdfUrl)} target="_blank" rel="noreferrer">
                    Descarcă / Vizualizează oferta PDF
                  </a>
                </Button>
              ) : null}

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Verificare în doi pași</p>
                <Input
                  value={verificationEmail}
                  onChange={(event) => setVerificationEmail(event.target.value)}
                  placeholder="Email"
                />
                <div className="flex gap-2">
                  <Input
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.toUpperCase())}
                    placeholder="Cod verificare"
                  />
                  <Button variant="outline" onClick={sendCode} disabled={isSendingCode}>
                    {isSendingCode ? "Trimite..." : "Trimite cod"}
                  </Button>
                </div>
                <Button onClick={verifyCode} disabled={isVerifying || !verificationCode}>
                  {isVerifying ? "Verific..." : "Verifică cod"}
                </Button>
                {verificationMessage ? <p className="text-xs text-neutral-600">{verificationMessage}</p> : null}
              </div>

              {action === "reject" ? (
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Motiv refuz (opțional)"
                />
              ) : null}

              <Button onClick={respond} disabled={!isVerified || isResponding} className="w-full">
                {isResponding ? "Se procesează..." : action === "accept" ? "Confirmă acceptarea" : "Confirmă refuzul"}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="text-xs text-neutral-500">
        {action === "accept" ? (
          <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Vei confirma acceptarea ofertei.</span>
        ) : (
          <span className="inline-flex items-center gap-1"><X className="h-3.5 w-3.5" /> Vei confirma refuzul ofertei.</span>
        )}
      </div>
    </main>
  )
}
