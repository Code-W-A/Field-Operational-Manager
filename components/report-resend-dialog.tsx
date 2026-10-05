"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { auth } from "@/lib/firebase/config"
import { canResendReport, validateResendEmails, type ReportRecipients } from "@/lib/work-documents/report-resend"
import { generateRevisionOperationsPDF } from "@/lib/pdf/revision-operations"
import { ReportGenerator } from "@/components/report-generator"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function ReportResendDialog({ work, onSent }: { work: Lucrare; onSent?: () => void | Promise<void> }) {
  const pdfWork = useMemo(() => ({ ...work, products: work.products?.map((product, index) => ({
    ...product, id: (product as any).id || String(index), total: (product as any).total ?? product.quantity * product.price,
  })) }), [work])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [addresses, setAddresses] = useState("")
  const [source, setSource] = useState<ReportRecipients | null>(null)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ sent: string[]; failed: string[] } | null>(null)
  const pdfButton = useRef<HTMLButtonElement>(null)
  const pdfRequest = useRef<{ resolve: (pdf: Blob) => void; reject: (error: Error) => void } | null>(null)

  useEffect(() => {
    if (!open || !work.id) return
    const controller = new AbortController()
    setLoading(true); setError(""); setResult(null); setAddresses(""); setSource(null)
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const response = await fetch(`/api/lucrari/${encodeURIComponent(work.id!)}/report-recipients`, {
          signal: controller.signal, cache: "no-store", credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Destinatarii nu pot fi încărcați.")
        if (controller.signal.aborted) return
        setSource(data); setAddresses(data.emails.join("\n"))
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Destinatarii nu pot fi încărcați.")
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [open, work.id])

  if (!canResendReport(work)) return null

  async function send() {
    if (busyRef.current || loading || !work.id) return
    let recipients: string[]
    try { recipients = validateResendEmails(addresses.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean)) }
    catch (error) { setError((error as Error).message); return }
    busyRef.current = true; setBusy(true); setError(""); setResult(null)
    try {
      const pdf = await new Promise<Blob>((resolve, reject) => {
        if (!pdfButton.current) { reject(new Error("Generatorul PDF nu este disponibil.")); return }
        pdfRequest.current = { resolve, reject }
        pdfButton.current.click()
      })
      const workNumber = String(work.nrLucrare || work.numarRaport || work.id).replace(/[^a-zA-Z0-9_-]/g, "")
      const form = new FormData()
      form.append("recipientMode", "report-resend")
      form.append("lucrareId", work.id)
      form.append("recipients", JSON.stringify(recipients))
      form.append("pdfFile", new File([pdf], `Raport_Interventie_${workNumber}.pdf`, { type: "application/pdf" }))
      if (String(work.tipLucrare).toLowerCase() === "revizie") {
        const operations = await generateRevisionOperationsPDF(work.id)
        form.append("opsPdfFile", new File([operations], `Fise_Operatiuni_${workNumber}.pdf`, { type: "application/pdf" }))
      }
      const token = await auth.currentUser?.getIdToken()
      const response = await fetch("/api/send-email", {
        method: "POST", body: form, credentials: "same-origin", headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await response.json()
      if (Array.isArray(data.sent) && Array.isArray(data.failed)) {
        setResult({ sent: data.sent, failed: data.failed })
        if (data.failed.length) { setAddresses(data.failed.join("\n")); setError(data.error || "Unele trimiteri au eșuat.") }
        try { await onSent?.() } catch { /* Delivery results remain visible even if ticket refresh fails. */ }
      } else if (!response.ok) throw new Error(data.error || "Raportul nu a putut fi trimis.")
      else throw new Error("Rezultatul trimiterii nu poate fi confirmat. Verificați istoricul emailurilor înainte de a reîncerca.")
    } catch (error) { setError(error instanceof Error ? error.message : "Retrimiterea a eșuat.") }
    finally { pdfRequest.current = null; busyRef.current = false; setBusy(false) }
  }

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>Retrimite raportul</Button>
    <Dialog open={open} onOpenChange={value => { if (!busyRef.current) setOpen(value) }}>
      <DialogContent onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault() }} onInteractOutside={event => { if (busyRef.current) event.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>Retrimite raportul</DialogTitle>
          <DialogDescription>Alegeți una sau mai multe adrese. Raportul existent va fi trimis separat către fiecare adresă din această listă.</DialogDescription>
        </DialogHeader>
        {loading ? <p role="status">Se încarcă destinatarii actuali...</p> : <>
          {source?.warning && <p role="status" className="text-sm text-amber-700">{source.warning}</p>}
          {source?.source === "current" && <p className="text-sm text-muted-foreground">Lista inițială a fost precompletată din fișa actuală a clientului și locației.</p>}
          <Label htmlFor="resend-report-emails">Destinatari</Label>
          <Textarea id="resend-report-emails" value={addresses} onChange={event => setAddresses(event.target.value)} disabled={busy || !!result} placeholder="adresa@exemplu.ro" />
          <p className="text-xs text-muted-foreground">O adresă pe rând sau separate prin virgulă. Maximum 20 de adrese; puteți elimina destinatarii precompletați.</p>
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {result && <div role="status" className="text-sm space-y-1">
          {!!result.sent.length && <p>Trimis către: {result.sent.join(", ")}</p>}
          {!!result.failed.length && <p>Eșuat către: {result.failed.join(", ")}. Lista conține acum doar aceste adrese.</p>}
        </div>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Închide</Button>
          <Button disabled={loading || busy || !addresses.trim() || !!result && !result.failed.length} onClick={() => void send()}>
            {busy ? "Se retrimite..." : result?.failed.length ? "Retrimite la adresele eșuate" : "Trimite raportul"}
          </Button>
        </DialogFooter>
        {open && <div className="hidden" aria-hidden="true"><ReportGenerator lucrare={pdfWork} readOnly ref={pdfButton}
          onGenerate={pdf => { pdfRequest.current?.resolve(pdf); pdfRequest.current = null }}
          onError={error => { pdfRequest.current?.reject(error); pdfRequest.current = null }} /></div>}
      </DialogContent>
    </Dialog>
  </>
}
