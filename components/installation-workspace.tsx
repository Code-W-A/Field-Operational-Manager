"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Scanner } from "@yudiel/react-qr-scanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SignaturePad } from "@/components/signature-pad"
import { useAuth } from "@/contexts/AuthContext"
import { installationApi, installationRequest } from "@/lib/installations/client"
import type { InstallationDocument, InstallationFields, InstallationSheet } from "@/types/installation"

const statuses = { pending: "Neînceput", in_progress: "În lucru", blocked: "Blocat", done: "Finalizat", completed: "Finalizat" }
const pageUrl = (workId: string) => `/dashboard/lucrari/${encodeURIComponent(workId)}/instalare`
async function pdf(snapshot: InstallationDocument, workId: string, sheetId?: string) {
  const { downloadInstallationPdf } = await import("@/lib/pdf/installation")
  await downloadInstallationPdf(snapshot, workId, sheetId)
}

export function InstallationWorkspace({ workId, equipmentId, sheetId, compact = false, complete = false }: { workId: string; equipmentId?: string; sheetId?: string; compact?: boolean; complete?: boolean }) {
  const { userData } = useAuth()
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<InstallationSheet[]>([])
  const [selected, setSelected] = useState<InstallationSheet | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const scanRequest = useRef<string | null>(null)
  const scanningRequest = useRef(false)
  const load = useCallback(async () => {
    const result = await installationRequest(installationApi(workId))
    setData(result); setHistory(result.sheets)
    if (sheetId) {
      const selection = await installationRequest(`${installationApi(workId)}?sheetId=${encodeURIComponent(sheetId)}`)
      setSelected(selection.sheets[0] || null)
    } else if (equipmentId) {
      const activeId = result.work.installation.activeSheetByEquipment[equipmentId]
      if (activeId) {
        const selection = await installationRequest(`${installationApi(workId)}?sheetId=${encodeURIComponent(activeId)}`)
        setSelected(selection.sheets[0] || null)
      } else setSelected(null)
    }
  }, [workId, sheetId, equipmentId])
  useEffect(() => {
    setSelected(null); setScanning(false); setError(""); setShowCompletion(complete); scanRequest.current = null
    void load().catch(e => setError(e.message))
  }, [load, complete])
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("")
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : "Operația a eșuat.") } finally { setBusy(false) }
  }
  async function scan(qrRaw: string) {
    if (scanningRequest.current) return
    scanningRequest.current = true
    scanRequest.current ||= crypto.randomUUID()
    await run(async () => {
      const result = await installationRequest(installationApi(workId), { action: "start", equipmentId, qrRaw, requestId: scanRequest.current })
      setSelected(result.sheet); setScanning(false)
      const refreshed = await installationRequest(installationApi(workId)); setData(refreshed); setHistory(refreshed.sheets)
    })
    scanningRequest.current = false
  }
  if (!data) return <div className="p-4">{error ? <p role="alert">{error}</p> : "Se încarcă instalarea…"}<Button variant="outline" onClick={() => void run(load)}>Reîncarcă</Button></div>
  const work = data.work
  const meta = work.installation
  const manager = ["admin", "dispecer"].includes(userData?.role || "")
  const active = Object.keys(meta.activeSheetByEquipment).length > 0
  const allDone = work.equipmentIds.length > 0 && work.equipmentIds.every((id: string) => meta.equipmentStatus[id] === "done")
  return <Card className="my-4">
    <CardHeader><CardTitle>Instalare — fișe de montaj</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {!compact && <Button asChild variant="outline"><Link href={`/dashboard/lucrari/${workId}`}>Înapoi la tichet</Link></Button>}
      <p className="text-sm">{work.client} · {work.locatie} · {work.nrLucrare || workId}</p>
      <div className="space-y-2">{meta.equipment.map((e: any) => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
        <div><strong>{e.name}</strong><p className="text-sm text-muted-foreground">{e.code} · {statuses[meta.equipmentStatus[e.id] as keyof typeof statuses]}</p></div>
        {(!meta.closedReason && meta.equipmentStatus[e.id] !== "done") && <Button asChild variant="outline"><Link href={`${pageUrl(workId)}?equipmentId=${encodeURIComponent(e.id)}`}>{meta.activeSheetByEquipment[e.id] ? "Deschide fișa activă" : data.canStart ? "Începe instalarea" : "Vezi echipamentul"}</Link></Button>}
      </div>)}</div>
      {!compact && equipmentId && !selected && data.canStart && !meta.closedReason && meta.equipmentStatus[equipmentId] !== "done" && <div className="space-y-3 rounded border p-4">
        <p>Scanați QR-ul echipamentului pentru a deschide o fișă nouă.</p>
        <Button disabled={busy} onClick={() => setScanning(v => !v)}>{scanning ? "Oprește camera" : "Scanează QR"}</Button>
        {scanning && <div className="max-w-sm"><Scanner onScan={codes => { const raw = codes[0]?.rawValue; if (raw) void scan(raw) }} onError={() => { setError("Camera nu poate fi accesată. Permiteți accesul la cameră și reîncercați."); setScanning(false) }} /></div>}
      </div>}
      {!compact && selected && <InstallationSheetForm key={selected.id} workId={workId} sheet={selected} onSheet={setSelected} onRefresh={load} />}
      <div className="space-y-2"><h3 className="font-semibold">Istoric fișe zilnice</h3>
        {history.length === 0 && <p className="text-sm text-muted-foreground">Nu există încă fișe de montaj.</p>}
        {history.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
          <div><p>{s.workDate} · {meta.equipment.find((e: any) => e.id === s.equipmentId)?.name || s.equipmentId}</p><p className="text-sm">{s.principalName} · {s.state === "closed" ? "Semnată" : "Ciornă"} · {statuses[s.installationStatus]}</p></div>
          <div className="flex gap-2"><Button asChild variant="outline"><Link href={`${pageUrl(workId)}?sheetId=${encodeURIComponent(s.id)}`}>Deschide</Link></Button>
            {s.documentSnapshot && <Button disabled={busy} onClick={() => void run(() => pdf(s.documentSnapshot!, workId, s.id))}>Descarcă PDF</Button>}</div>
        </div>)}
        {data.nextCursor && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await installationRequest(`${installationApi(workId)}?cursor=${encodeURIComponent(data.nextCursor)}`); setHistory(previous => [...previous, ...result.sheets]); setData((previous: any) => ({ ...previous, nextCursor: result.nextCursor })) })}>Mai multe fișe</Button>}
      </div>
      {workId !== meta.rootWorkId && <Button asChild variant="outline"><Link href={pageUrl(meta.rootWorkId)}>Istoricul lucrării inițiale</Link></Button>}
      {meta.continuationWorkId && <Button asChild><Link href={`/dashboard/lucrari/${meta.continuationWorkId}`}>Deschide tichetul de continuare</Link></Button>}
      {manager && !meta.closedReason && !active && !allDone && meta.startedEquipmentIds.length > 0 && <Button disabled={busy} variant="outline" onClick={() => {
        if (window.confirm("Creezi un tichet nou Listată cu echipamentele neterminate, fără tehnicieni atribuiți?")) void run(async () => { await installationRequest(installationApi(workId), { action: "continue" }); await load() })
      }}>Trimite restul spre replanificare</Button>}
      {data.canStart && allDone && !active && !meta.closedReason && !data.completion && <Button asChild={compact} onClick={() => setShowCompletion(true)}>{compact ? <Link href={`${pageUrl(workId)}?complete=1`}>Proces-verbal de terminare</Link> : "Proces-verbal de terminare"}</Button>}
      {!compact && showCompletion && data.canStart && allDone && !active && !meta.closedReason && !data.completion && <InstallationCompletionForm workId={workId} onComplete={load} />}
      {data.completion && <Button disabled={busy} onClick={() => void run(() => pdf(data.completion.documentSnapshot, workId))}>Descarcă procesul-verbal final</Button>}
      <Button disabled={busy} variant="ghost" onClick={() => void run(load)}>Reîncarcă datele</Button>
    </CardContent>
  </Card>
}

function InstallationSheetForm({ workId, sheet, onSheet, onRefresh }: { workId: string; sheet: InstallationSheet; onSheet: (s: InstallationSheet) => void; onRefresh: () => Promise<void> }) {
  const { userData } = useAuth()
  const [content, setContent] = useState<InstallationFields>({ finding: sheet.finding, operations: sheet.operations, installationStatus: sheet.installationStatus, blockReason: sheet.blockReason, internalNote: sheet.internalNote || "" })
  const [technicianSignature, setTechSignature] = useState("")
  const [beneficiarySignature, setBeneficiarySignature] = useState("")
  const [beneficiaryName, setBeneficiaryName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = "" } }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [dirty])
  const editable = sheet.state === "draft" && sheet.principalUid === userData?.uid
  async function run(fn: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Operația a eșuat.") } finally { setBusy(false) } }
  async function save(close: boolean) {
    await run(async () => {
      const result = await installationRequest(installationApi(workId), { action: close ? "close" : "save", sheetId: sheet.id, fields: content, revision: sheet.revision, signatures: { technicianSignature, beneficiarySignature, beneficiaryName } })
      onSheet(result.sheet); setDirty(false); setNotice(close ? "Fișa zilei a fost închisă și semnată." : "Ciorna a fost salvată.")
      if (close) await onRefresh()
    })
  }
  const change = (key: keyof InstallationFields, value: string) => { setContent(previous => ({ ...previous, [key]: value })); setDirty(true) }
  return <section className="space-y-4 rounded border p-4">
    <h3 className="font-semibold">Fișa din {sheet.workDate} · {sheet.principalName}</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-green-700">{notice}</p>}
    {sheet.state === "closed" ? <><p>Fișă semnată · {statuses[sheet.installationStatus]}</p><p className="whitespace-pre-wrap">{sheet.finding}</p><p className="whitespace-pre-wrap">{sheet.operations}</p>{sheet.blockReason && <p>{sheet.blockReason}</p>}{sheet.internalNote !== undefined && <p className="whitespace-pre-wrap">Notă internă: {sheet.internalNote}</p>}
      <Button disabled={busy} onClick={() => void run(() => pdf(sheet.documentSnapshot!, workId, sheet.id))}>Descarcă PDF</Button><Button variant="outline" onClick={() => void run(onRefresh)}>Actualizează progresul</Button></> : !editable ? <p>Fișa poate fi completată numai de principalul {sheet.principalName}.{sheet.internalNote !== undefined && <span> Notă internă: {sheet.internalNote}</span>}</p> : <>
      <fieldset disabled={busy} className="space-y-4">
        <div><Label htmlFor="installation-finding">Constatare la locație *</Label><Textarea id="installation-finding" maxLength={6000} value={content.finding} onChange={e => change("finding", e.target.value)} /></div>
        <div><Label htmlFor="installation-operations">Operațiuni executate *</Label><Textarea id="installation-operations" maxLength={6000} value={content.operations} onChange={e => change("operations", e.target.value)} /></div>
        <div><Label htmlFor="installation-status">Statusul instalării</Label><select id="installation-status" className="block w-full rounded border p-2" value={content.installationStatus} onChange={e => change("installationStatus", e.target.value)}><option value="in_progress">În lucru</option><option value="blocked">Blocat</option><option value="completed">Finalizat</option></select></div>
        {content.installationStatus === "blocked" && <div><Label htmlFor="installation-block">Motivul blocajului *</Label><Textarea id="installation-block" maxLength={6000} value={content.blockReason} onChange={e => change("blockReason", e.target.value)} /></div>}
        <div><Label htmlFor="installation-note">Notă internă — nu apare în PDF</Label><Textarea id="installation-note" maxLength={6000} value={content.internalNote} onChange={e => change("internalNote", e.target.value)} /></div>
        <div><Label htmlFor="installation-photos">Fotografii ({sheet.photos.length}/4)</Label><Input id="installation-photos" type="file" accept="image/*" multiple disabled={sheet.photos.length >= 4} onChange={e => {
          const files = Array.from(e.target.files || []); e.target.value = ""
          void run(async () => {
            if (files.length + sheet.photos.length > 4) throw new Error("Maximum 4 fotografii pe fișă, inclusiv cele salvate.")
            for (const file of files) {
              const compressed = await compressPhoto(file)
              const form = new FormData(); form.set("sheetId", sheet.id); form.set("file", compressed)
              const result = await installationRequest(`${installationApi(workId)}/photos`, form); onSheet(result.sheet)
            }
          })
        }} /></div>
      </fieldset>
      <Button disabled={busy} onClick={() => void save(false)}>Salvează ciorna</Button>
      <div className="space-y-3 border-t pt-4"><p>Închiderea zilei necesită ambele semnături. „Finalizat” încheie și instalarea echipamentului.</p>
        <Label htmlFor="installation-beneficiary">Numele beneficiarului *</Label><Input disabled={busy} id="installation-beneficiary" maxLength={200} value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)} />
        <div className="grid gap-4 md:grid-cols-2"><SignaturePad title={`Semnătura tehnicianului — ${sheet.principalName}`} onClear={() => setTechSignature("")} onSave={setTechSignature} existingSignature={technicianSignature} /><SignaturePad title="Semnătura beneficiarului" onClear={() => setBeneficiarySignature("")} onSave={setBeneficiarySignature} existingSignature={beneficiarySignature} /></div>
        <Button disabled={busy || !technicianSignature || !beneficiarySignature || !beneficiaryName.trim()} onClick={() => void save(true)}>Închide fișa zilei</Button>
      </div>
    </>}
    <div className="flex flex-wrap gap-3">{sheet.photos.map(p => <div key={p.id}><img className="h-28 w-36 rounded object-cover" alt={p.name} src={`${installationApi(workId)}/photos?sheetId=${encodeURIComponent(sheet.id)}&photoId=${encodeURIComponent(p.id)}`} />{editable && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await installationRequest(`${installationApi(workId)}/photos`, { sheetId: sheet.id, photoId: p.id }, "DELETE"); onSheet(result.sheet) })}>Șterge fotografia</Button>}</div>)}</div>
  </section>
}

function InstallationCompletionForm({ workId, onComplete }: { workId: string; onComplete: () => Promise<void> }) {
  const { userData } = useAuth()
  const [observations, setObservations] = useState("")
  const [beneficiaryName, setBeneficiaryName] = useState("")
  const [technicianSignature, setTechnicianSignature] = useState("")
  const [beneficiarySignature, setBeneficiarySignature] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return <section className="space-y-4 rounded border p-4"><h3 className="font-semibold">Proces-verbal de terminare a lucrării</h3>
    <Label htmlFor="completion-observations">Observații finale</Label><Textarea id="completion-observations" maxLength={6000} value={observations} onChange={e => setObservations(e.target.value)} />
    <Label htmlFor="completion-beneficiary">Numele beneficiarului *</Label><Input id="completion-beneficiary" maxLength={200} value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)} />
    <div className="grid gap-4 md:grid-cols-2"><SignaturePad title={`Semnătura tehnicianului — ${userData?.displayName}`} onClear={() => setTechnicianSignature("")} onSave={setTechnicianSignature} existingSignature={technicianSignature} /><SignaturePad title="Semnătura beneficiarului" onClear={() => setBeneficiarySignature("")} onSave={setBeneficiarySignature} existingSignature={beneficiarySignature} /></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Button disabled={busy || !technicianSignature || !beneficiarySignature || !beneficiaryName.trim()} onClick={async () => {
      setBusy(true); setError("")
      try { await installationRequest(installationApi(workId), { action: "complete", observations, signatures: { beneficiaryName, technicianSignature, beneficiarySignature } }); await onComplete() } catch (e) { setError(e instanceof Error ? e.message : "Emiterea a eșuat.") } finally { setBusy(false) }
    }}>Semnează și finalizează lucrarea</Button>
  </section>
}

async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Selectați o fotografie.")
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Fotografia nu poate fi procesată.")
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8))
    if (!blob) throw new Error("Fotografia nu poate fi comprimată.")
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
  } finally { URL.revokeObjectURL(url) }
}
