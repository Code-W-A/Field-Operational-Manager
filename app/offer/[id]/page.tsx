"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Check, X, AlertCircle } from "lucide-react"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"
import { uploadFile } from "@/lib/firebase/storage"
import { getClientById } from "@/lib/firebase/firestore"

export default function OfferActionPage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const token = params.get("t") || ""
  const action = params.get("action") as "accept" | "reject" | null

  const [state, setState] = useState<"loading" | "ready" | "success" | "error" | "expired" | "used" | "invalid">("loading")
  const [message, setMessage] = useState<string>("")
  const [offerUrl, setOfferUrl] = useState<string>("")
  const [downloading, setDownloading] = useState<boolean>(false)
  const [reason, setReason] = useState<string>("")
  const [verificationEmail, setVerificationEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationMessage, setVerificationMessage] = useState("")
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [verificationProof, setVerificationProof] = useState("")
  const [verifiedEmail, setVerifiedEmail] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [errorDetails, setErrorDetails] = useState<any>(null)

  const [isDownloadErrorDialogOpen, setIsDownloadErrorDialogOpen] = useState(false)
  const [downloadErrorTitle, setDownloadErrorTitle] = useState("Nu am putut descărca oferta")
  const [downloadErrorMessage, setDownloadErrorMessage] = useState("")
  const [downloadErrorTechnical, setDownloadErrorTechnical] = useState("")
  const [isReportingError, setIsReportingError] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [reportFeedbackMessage, setReportFeedbackMessage] = useState("")

  const openDownloadErrorDialog = (friendlyMessage: string, technicalMessage?: string) => {
    setDownloadErrorTitle("Nu am putut descărca oferta")
    setDownloadErrorMessage(friendlyMessage)
    setDownloadErrorTechnical((technicalMessage || "").slice(0, 2000))
    setReportSent(false)
    setReportFeedbackMessage("")
    setIsDownloadErrorDialogOpen(true)
  }

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const buildStoredDownloadLink = (urlToDownload?: string | null) => {
    if (!id || !urlToDownload) return null
    return `/api/download?lucrareId=${encodeURIComponent(String(id))}&type=oferta&url=${encodeURIComponent(urlToDownload)}`
  }

  const fetchOfferContext = async () => {
    const workId = String(id || "").trim()
    const currentToken = String(token || "").trim()
    if (!workId || !currentToken) {
      throw new Error("Nu s-au primit datele necesare pentru validarea ofertei.")
    }

    const query = new URLSearchParams({
      lucrareId: workId,
      token: currentToken,
    })

    const resp = await fetch(`/api/offer?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
    })
    const json = await resp.json().catch(() => ({}))

    // Pentru status-uri business (invalid/expired/used) endpointul poate răspunde cu non-2xx,
    // dar cu payload util pentru UI.
    if (!resp.ok && !json?.status) {
      throw new Error(json?.error || json?.message || `Eroare API (${resp.status})`)
    }

    return json as {
      status?: "ready" | "used" | "expired" | "invalid" | "error"
      message?: string
      offerUrl?: string
      work?: any
    }
  }

  const validateStoredDownloadLink = async (downloadLink: string) => {
    const resp = await fetch(downloadLink, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
    })

    const redirectLocation = resp.headers.get("location")
    if (resp.type === "opaqueredirect" || (resp.status >= 300 && resp.status < 400) || resp.ok) {
      return {
        ok: true as const,
        redirectLocation: redirectLocation || null,
      }
    }

    let detail = ""
    try {
      const json = await resp.json()
      detail = String(json?.error || json?.message || "")
    } catch {
      try {
        const text = await resp.text()
        detail = String(text || "").slice(0, 240)
      } catch {
        detail = ""
      }
    }

    return {
      ok: false as const,
      technical: `URL stocat indisponibil (HTTP ${resp.status}${detail ? `: ${detail}` : ""}).`,
    }
  }

  const generateOfferBlobFromWork = async (work: any) => {
    const products = Array.isArray(work?.products) ? work.products : []
    if (!products.length) {
      throw new Error("Oferta nu poate fi generată deoarece nu există produse în lucrare.")
    }

    const blob = await generateOfferPdf({
      id: String(id),
      numarRaport: String(work?.numarRaport || ""),
      client: work?.client || "",
      attentionTo: work?.persoanaContact || "",
      fromCompany: "NRG Access Systems SRL",
      products: products.map((p: any) => ({
        name: p?.name || p?.denumire || "",
        quantity: Number(p?.quantity || p?.cantitate || 0),
        price: Number(p?.price || p?.pretUnitar || 0),
      })),
      offerVAT: typeof work?.offerVAT === "number" ? work.offerVAT : 19,
      adjustmentPercent: Number(work?.offerAdjustmentPercent || 0),
      damages: String(work?.constatareLaLocatie || work?.raportSnapshot?.constatareLaLocatie || work?.comentariiOferta || "")
        .split(/\r?\n|\u2022|\-|\*/)
        .map((s: string) => s.trim())
        .filter(Boolean),
      conditions: Array.isArray(work?.conditiiOferta) ? work.conditiiOferta : undefined,
      equipmentName: String(work?.echipament || ""),
      locationName: String(work?.locatie || ""),
      beneficiar: {
        name: String(work?.client || work?.clientInfo?.nume || ""),
        cui: String(work?.clientInfo?.cui || ""),
        reg: String(work?.clientInfo?.rc || ""),
        address: String(work?.clientInfo?.adresa || ""),
      },
    })

    return { blob, fileName: `oferta_${id}.pdf` }
  }

  const handleDownloadOffer = async () => {
    if (!id) return

    setDownloading(true)
    try {
      const context = await fetchOfferContext()
      const fresh = context?.work || null
      const latestStoredUrl = typeof context?.offerUrl === "string" ? context.offerUrl : ""
      if (latestStoredUrl) {
        setOfferUrl(latestStoredUrl)
      }

      const technicalParts: string[] = []
      if (context?.status && context.status !== "ready") {
        technicalParts.push(`Status link ofertă: ${context.status}`)
      }
      if (context?.message) {
        technicalParts.push(`Mesaj server: ${context.message}`)
      }
      const candidateUrl = latestStoredUrl || offerUrl

      if (candidateUrl) {
        const downloadLink = buildStoredDownloadLink(candidateUrl)
        if (downloadLink) {
          const validation = await validateStoredDownloadLink(downloadLink)
          if (validation.ok) {
            const target = validation.redirectLocation || downloadLink
            const opened = window.open(target, "_blank", "noopener,noreferrer")
            if (!opened) {
              window.location.href = target
            }
            return
          }
          technicalParts.push(validation.technical)
        } else {
          technicalParts.push("Nu s-a putut construi linkul API de descărcare pentru URL-ul stocat.")
        }
      } else {
        technicalParts.push("Nu există ofertăDocument.url în lucrare.")
      }

      try {
        if (!fresh) {
          throw new Error("Datele lucrării nu sunt disponibile în răspunsul serverului.")
        }
        const { blob, fileName } = await generateOfferBlobFromWork(fresh)
        triggerBlobDownload(blob, fileName)
        return
      } catch (fallbackError: any) {
        technicalParts.push(`Fallback generare locală eșuat: ${String(fallbackError?.message || fallbackError)}`)
      }

      openDownloadErrorDialog(
        "Descărcarea ofertei a eșuat. Poți trimite eroarea către admin pentru investigație.",
        technicalParts.join(" | "),
      )
    } catch (e: any) {
      console.error("Download offer failed:", e)
      openDownloadErrorDialog(
        "A apărut o eroare neașteptată la descărcare. Trimite raportul către admin.",
        String(e?.message || e),
      )
    } finally {
      setDownloading(false)
    }
  }

  const sendDownloadErrorToAdmin = async () => {
    if (!id || isReportingError || reportSent) return

    try {
      setIsReportingError(true)
      setReportFeedbackMessage("")

      const browserContext =
        typeof window !== "undefined"
          ? {
              userAgent: navigator.userAgent,
              language: navigator.language,
              location: window.location.href,
              timestamp: new Date().toISOString(),
            }
          : null

      const fallbackTechnical = errorDetails
        ? JSON.stringify(errorDetails, null, 2).slice(0, 2000)
        : ""

      const resp = await fetch("/api/offer/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lucrareId: id,
          action,
          state,
          token,
          userMessage: downloadErrorMessage || message || "Eroare la descărcarea ofertei",
          technicalError: downloadErrorTechnical || fallbackTechnical,
          offerUrlPresent: Boolean(offerUrl),
          hasErrorDetails: Boolean(errorDetails),
          browser: browserContext,
        }),
      })

      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || json?.message || "Nu s-a putut trimite raportul către admin.")
      }

      setReportSent(true)
      setReportFeedbackMessage("Raportul a fost trimis către admin.")
    } catch (e: any) {
      setReportFeedbackMessage(String(e?.message || "Nu s-a putut trimite raportul către admin."))
    } finally {
      setIsReportingError(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      try {
        setState("loading")
        setIsVerified(false)
        setVerificationProof("")
        setVerifiedEmail("")
        setVerificationEmail("")
        setVerificationCode("")
        setVerificationMessage("")
        setCodeSent(false)
        setResendCooldown(0)
        setOfferUrl("")
        setErrorDetails(null)

        if (!id || !token || !action || (action !== "accept" && action !== "reject")) {
          setState("invalid")
          setMessage("Link invalid. Contactați operatorul.")
          return
        }

        const context = await fetchOfferContext()
        setOfferUrl(typeof context?.offerUrl === "string" ? context.offerUrl : "")

        if (context?.status === "invalid") {
          setState("invalid")
          setMessage(context?.message || "Link invalid. Contactați operatorul.")
          return
        }
        if (context?.status === "used") {
          setState("used")
          setMessage(context?.message || "Oferta a fost deja acceptată sau refuzată. Contactați operatorul.")
          return
        }
        if (context?.status === "expired") {
          setState("expired")
          setMessage(context?.message || "Link expirat. Contactați operatorul pentru o ofertă nouă.")
          return
        }
        if (context?.status === "error") {
          throw new Error(context?.message || "Eroare server la încărcarea ofertei.")
        }
        if (context?.status && context.status !== "ready") {
          throw new Error(`Status neașteptat la încărcare: ${context.status}`)
        }

        setState("ready")
      } catch (e) {
        console.error(e)
        setState("error")
        setMessage("A apărut o eroare. Încercați mai târziu sau contactați operatorul.")
        try {
          const err: any = e
          setErrorDetails({
            context: {
              action,
              workId: id,
              hasToken: Boolean(token),
              time: new Date().toISOString(),
            },
            error: {
              message: String(err?.message || err),
              code: err?.code || undefined,
              name: err?.name || undefined,
              stack: typeof err?.stack === "string" ? err.stack : undefined,
            },
          })
        } catch {}
      }
    }
    run()
  }, [id, token, action])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [resendCooldown])

  useEffect(() => {
    setCodeSent(false)
    setResendCooldown(0)
    setIsVerified(false)
    setVerifiedEmail("")
    setVerificationProof("")
    setVerificationCode("")
    setVerificationMessage("")
  }, [verificationEmail])

  const sendVerificationCode = async () => {
    if (!verificationEmail.trim()) return
    try {
      setIsSendingCode(true)
      setIsVerified(false)
      setVerifiedEmail("")
      setVerificationProof("")
      setVerificationCode("")
      setVerificationMessage("")
      const resp = await fetch("/api/offer/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lucrareId: id, token, email: verificationEmail.trim() }),
      })
      const json = await resp.json()
      if (!resp.ok || json.status !== "sent") {
        throw new Error(json?.message || "Nu s-a putut trimite codul.")
      }
      setVerificationMessage("Codul a fost trimis pe email. Verificați inbox-ul.")
      setCodeSent(true)
      setResendCooldown(30)
    } catch (e: any) {
      setVerificationMessage(String(e?.message || "Eroare la trimiterea codului."))
    } finally {
      setIsSendingCode(false)
    }
  }

  const verifyCode = async () => {
    if (!verificationEmail.trim() || !verificationCode.trim()) return
    try {
      setIsVerifyingCode(true)
      setVerificationMessage("")
      const resp = await fetch("/api/offer/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lucrareId: id,
          token,
          email: verificationEmail.trim(),
          code: verificationCode.trim().toUpperCase(),
        }),
      })
      const json = await resp.json()
      if (!resp.ok || json.status !== "verified") {
        throw new Error(json?.message || "Cod invalid.")
      }
      const proof = typeof json?.verificationProof === "string" ? json.verificationProof.trim() : ""
      if (!proof) {
        throw new Error("Verificarea nu a putut fi confirmată complet. Solicitați un cod nou.")
      }
      setVerificationProof(proof)
      setIsVerified(true)
      setVerifiedEmail(json.email || verificationEmail.trim().toLowerCase())
      setVerificationMessage("Email verificat cu succes.")
    } catch (e: any) {
      setVerificationMessage(String(e?.message || "Cod invalid."))
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const processResponse = async (finalAction: "accept" | "reject", finalReason?: string) => {
    try {
      if (!verificationProof) {
        setState("ready")
        setIsVerified(false)
        setVerificationMessage("Este necesară reverificarea în doi pași.")
        return
      }
      setState("loading")
      const resp = await fetch("/api/offer/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lucrareId: id,
          token,
          action: finalAction,
          verificationProof,
          ...(finalReason ? { reason: finalReason } : {}),
        }),
      })
      const json = await resp.json()
      if (!resp.ok || json.status !== "success") {
        if (json.status === "expired") {
          setState("expired")
          setMessage("Link expirat. Contactați operatorul pentru o ofertă nouă.")
          return
        }
        if (json.status === "used") {
          setState("used")
          setMessage("Oferta a fost deja acceptată sau refuzată. Contactați operatorul.")
          return
        }
        if (json.status === "invalid") {
          setState("invalid")
          setMessage("Link invalid. Contactați operatorul.")
          return
        }
        if (json.status === "verification_required" || json.status === "verification_invalid") {
          setState("ready")
          setIsVerified(false)
          setVerifiedEmail("")
          setVerificationProof("")
          setVerificationEmail("")
          setVerificationCode("")
          setCodeSent(false)
          setResendCooldown(0)
          setVerificationMessage(
            json?.message || "Este necesară validarea în doi pași înainte de acceptare/refuz.",
          )
          return
        }
        throw new Error(json?.message || "Eroare la procesare pe server")
      }

      const resolveRecipientEmailForLocation = (client: any, work: any): string | null => {
        const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(e || "")
        const norm = (s?: string) =>
          String(s || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .trim()

        const locatii = Array.isArray(client?.locatii) ? client.locatii : []
        const targetName = norm(work?.locatie || work?.clientInfo?.locationName)
        const targetAddr = norm(work?.clientInfo?.locationAddress)
        const targetContactName = norm(work?.persoanaContact)

        const loc = locatii.find((l: any) => norm(l?.nume) === targetName || norm(l?.adresa) === targetAddr)
        if (!loc) return null

        const exact = (loc.persoaneContact || []).find((c: any) => norm(c?.nume) === targetContactName)
        const email = exact?.email
        return isValid(email) ? String(email) : null
      }

      try {
        const ref = doc(db, "lucrari", id)
        const snap = await getDoc(ref)
        const data: any = snap.exists() ? snap.data() : null
        const freshSnap = await getDoc(ref)
        const fresh = freshSnap.exists() ? (freshSnap.data() as any) : null
        if (fresh) {
          let ofertaUrl: string | undefined = fresh?.ofertaDocument?.url
          if (ofertaUrl) {
            setOfferUrl(ofertaUrl)
          }

          if (finalAction === "accept" && !ofertaUrl) {
            const products = Array.isArray(fresh?.products) ? fresh.products : []
            if (products.length) {
              const blob = await generateOfferPdf({
                id: String(id),
                numarRaport: String(data?.numarRaport || ""),
                offerNumber: Number((fresh as any)?.offerSendCount || 0) + 1,
                client: fresh?.client || "",
                attentionTo: fresh?.persoanaContact || "",
                fromCompany: "NRG Access Systems SRL",
                products: products.map((p: any) => ({
                  name: p?.name || p?.denumire || "",
                  quantity: Number(p?.quantity || p?.cantitate || 0),
                  price: Number(p?.price || p?.pretUnitar || 0),
                })),
                offerVAT: typeof (fresh as any)?.offerVAT === "number" ? (fresh as any).offerVAT : 19,
                adjustmentPercent: Number((fresh as any)?.offerAdjustmentPercent || 0),
                damages: String(
                  (fresh as any)?.constatareLaLocatie ||
                    (fresh as any)?.raportSnapshot?.constatareLaLocatie ||
                    fresh?.comentariiOferta ||
                    "",
                )
                  .split(/\r?\n|\u2022|\-|\*/)
                  .map((s: string) => s.trim())
                  .filter(Boolean),
                conditions: Array.isArray((fresh as any)?.conditiiOferta) ? (fresh as any).conditiiOferta : undefined,
                equipmentName: String((fresh as any)?.echipament || ""),
                locationName: String((fresh as any)?.locatie || ""),
                preparedBy: String(
                  (fresh as any)?.preluatDe ||
                    (fresh as any)?.offerPreparedBy ||
                    (fresh as any)?.updatedByName ||
                    (fresh as any)?.createdByName ||
                    "",
                ),
                preparedAt:
                  (fresh as any)?.offerPreparedAt
                    ? (() => {
                        try {
                          const d = (fresh as any).offerPreparedAt?.toDate
                            ? (fresh as any).offerPreparedAt.toDate()
                            : new Date((fresh as any).offerPreparedAt)
                          return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
                        } catch {
                          return new Date().toISOString().slice(0, 10).split("-").reverse().join(".")
                        }
                      })()
                    : new Date().toISOString().slice(0, 10).split("-").reverse().join("."),
                beneficiar: {
                  name: String((fresh as any)?.client || (fresh as any)?.clientInfo?.nume || ""),
                  cui: String((fresh as any)?.clientInfo?.cui || ""),
                  reg: String((fresh as any)?.clientInfo?.rc || ""),
                  address: String((fresh as any)?.clientInfo?.adresa || ""),
                },
              })
              const fileName = `oferta_${id}.pdf`
              const file = new File([blob], fileName, { type: "application/pdf" })
              const path = `tichete/${id}/oferta/${fileName}`
              const uploaded = await uploadFile(file, path)
              ofertaUrl = uploaded.url
              setOfferUrl(uploaded.url)
              await updateDoc(ref, {
                ofertaDocument: {
                  url: uploaded.url,
                  fileName: uploaded.fileName,
                  uploadedAt: new Date().toISOString(),
                  uploadedBy: "Portal client",
                  numarOferta: (fresh as any)?.numarOferta || "",
                  dataOferta: new Date().toISOString().slice(0, 10),
                },
                offerSendCount: Number((fresh as any)?.offerSendCount || 0) + 1,
              })
            }
          }

          let clientData: any = null
          try {
            const cid = fresh?.clientInfo?.id
            if (cid) clientData = await getClientById(cid)
          } catch {}
          const recipient = resolveRecipientEmailForLocation(clientData, fresh)

          if (recipient) {
            const to = [recipient]
            const subject = `${
              finalAction === "accept" ? "Confirmare acceptare ofertă" : "Confirmare răspuns – refuz ofertă"
            } – tichet ${fresh?.numarRaport || String(id)}`
            const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")
            const downloadLink = ofertaUrl
              ? `${base}/api/download?lucrareId=${encodeURIComponent(String(id))}&type=oferta&url=${encodeURIComponent(ofertaUrl)}&recipient=${encodeURIComponent(String(recipient))}`
              : ""

            const messageParagraph =
              finalAction === "accept"
                ? "Va multumim pentru acceptarea ofertei noastre. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."
                : "Va multumim pentru raspunsul dvs. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."

            const linkSection =
              finalAction === "accept" && downloadLink
                ? `<p style="margin:12px 0"><a href="${downloadLink}" style="background:#2563eb;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none">Descarcă oferta</a></p>`
                : ""

            const html = `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
                  <p>${messageParagraph}</p>
                  ${linkSection}
                </div>
              `

            try {
              await fetch("/api/users/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, subject, html }),
              })
            } catch (e) {
              console.warn("Trimitere email confirmare ofertă eșuată (non-blocant):", e)
            }
          }
        }
      } catch (e) {
        console.warn("Post-response email or attachment handling failed (non-blocant):", e)
      }
      setState("success")
      setMessage(finalAction === "accept" ? "Ați acceptat oferta. Vă mulțumim!" : "Ați refuzat oferta. Am înregistrat răspunsul.")
    } catch (e) {
      console.error(e)
      setState("error")
      setMessage("A apărut o eroare. Încercați mai târziu sau contactați operatorul.")
      try {
        const err: any = e
        setErrorDetails({
          context: {
            action: finalAction,
            workId: id,
            hasToken: Boolean(token),
            time: new Date().toISOString(),
          },
          error: {
            message: String(err?.message || err),
            code: err?.code || undefined,
            name: err?.name || undefined,
            stack: typeof err?.stack === "string" ? err.stack : undefined,
          },
        })
      } catch {}
    }
  }

  const handleAccept = async () => {
    if (!isVerified || !verificationProof) {
      setVerificationMessage("Este necesară validarea în doi pași înainte de acceptare.")
      return
    }
    await processResponse("accept")
  }

  const submitReject = async () => {
    if (!isVerified || !verificationProof) {
      setVerificationMessage("Este necesară validarea în doi pași înainte de refuz.")
      return
    }
    await processResponse("reject", reason)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Confirmare ofertă</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state === "loading" && <div className="text-sm text-muted-foreground">Se procesează...</div>}

          {state === "ready" && !isVerified && (
            <div className="space-y-3">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  Pentru validarea ofertei, vă rugăm să introduceți emailul și să confirmați codul primit.
                </AlertDescription>
              </Alert>
              {!codeSent ? (
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="Email pentru validare"
                    value={verificationEmail}
                    onChange={(e) => setVerificationEmail(e.target.value)}
                    disabled={isSendingCode || isVerifyingCode}
                  />
                  <Button onClick={sendVerificationCode} disabled={isSendingCode || !verificationEmail.trim()}>
                    {isSendingCode ? "Se trimite..." : "Trimite cod"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Am trimis codul către <strong>{verificationEmail.trim().toLowerCase()}</strong>.
                  </div>
                  <Input
                    type="text"
                    placeholder="Cod validare (6 caractere)"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                    disabled={isSendingCode || isVerifyingCode}
                  />
                  <Button onClick={verifyCode} disabled={isVerifyingCode || !verificationCode.trim()}>
                    {isVerifyingCode ? "Se verifică..." : "Verifică codul"}
                  </Button>
                  <button
                    type="button"
                    className={`text-xs underline ${resendCooldown > 0 ? "text-muted-foreground cursor-not-allowed" : "text-blue-600"}`}
                    onClick={() => {
                      if (resendCooldown > 0) return
                      sendVerificationCode()
                    }}
                    disabled={resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Retrimite cod (${resendCooldown}s)` : "Retrimite cod"}
                  </button>
                </div>
              )}
              {verificationMessage && <div className="text-sm text-muted-foreground">{verificationMessage}</div>}
            </div>
          )}

          {state === "ready" && isVerified && (
            <div className="space-y-3">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>Validare reușită pentru {verifiedEmail || verificationEmail}.</AlertDescription>
              </Alert>
              {action === "accept" && (
                <div className="flex justify-end">
                  <Button onClick={handleAccept}>Acceptă oferta</Button>
                </div>
              )}
              {action === "reject" && (
                <div className="space-y-3">
                  <Alert>
                    <X className="h-4 w-4" />
                    <AlertDescription>Vă rugăm să indicați motivul refuzului (opțional).</AlertDescription>
                  </Alert>
                  <textarea
                    className="w-full border rounded p-2 text-sm"
                    rows={4}
                    placeholder="Ex.: Preț prea mare / Nu mai este necesar / Alt motiv"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" asChild>
                      <a href="/">Renunță</a>
                    </Button>
                    <Button variant="destructive" onClick={submitReject}>
                      Trimite refuzul
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {state === "success" && (
            <div className="space-y-3">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              {action === "accept" && (
                <div className="space-y-2">
                  <Button onClick={handleDownloadOffer} disabled={downloading}>
                    {downloading ? "Se descarcă..." : "Descarcă oferta"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {(state === "error" || state === "expired" || state === "used" || state === "invalid") && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {(state === "error" || state === "expired" || state === "used" || state === "invalid") && id && (
            <div className="flex flex-wrap gap-2 justify-between items-center">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reîncearcă
              </Button>
              <Button onClick={handleDownloadOffer} disabled={downloading}>
                {downloading ? "Se descarcă..." : "Descarcă oferta"}
              </Button>
            </div>
          )}

          {state === "error" && errorDetails && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium mb-1">Detalii tehnice eroare (pentru suport)</div>
              <pre className="text-xs overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(errorDetails, null, 2)}</pre>
            </div>
          )}

          <Dialog open={isDownloadErrorDialogOpen} onOpenChange={setIsDownloadErrorDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{downloadErrorTitle}</DialogTitle>
                <DialogDescription>{downloadErrorMessage}</DialogDescription>
              </DialogHeader>

              {downloadErrorTechnical && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Detalii tehnice</div>
                  <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                    {downloadErrorTechnical}
                  </pre>
                </div>
              )}

              {reportFeedbackMessage && (
                <div className={`text-xs ${reportSent ? "text-green-600" : "text-red-600"}`}>{reportFeedbackMessage}</div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDownloadErrorDialogOpen(false)}>
                  Închide
                </Button>
                <Button onClick={sendDownloadErrorToAdmin} disabled={isReportingError || reportSent || !id}>
                  {isReportingError ? "Se trimite..." : reportSent ? "Raport trimis" : "Trimite către admin"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
