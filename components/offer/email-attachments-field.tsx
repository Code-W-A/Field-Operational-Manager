"use client"
import { useId, useRef, useState } from "react"
import { ref, uploadBytesResumable } from "firebase/storage"
import { auth, storage } from "@/lib/firebase/config"
import { Button } from "@/components/ui/button"
import { OFFER_ATTACHMENT_ACCEPT, parseOfferAttachments, validateOfferFile, type OfferAttachmentContext, type OfferEmailAttachment } from "@/lib/offer/email-attachments"

export function EmailAttachmentsField({ context, value, onChange, disabled, onBusyChange }: {
  context: OfferAttachmentContext; value: OfferEmailAttachment[]; onChange: (files: OfferEmailAttachment[]) => void
  disabled?: boolean; onBusyChange: (busy: boolean) => void
}) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState("")
  async function headers() {
    const token = await auth.currentUser?.getIdToken()
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }
  async function upload(files: File[]) {
    if (lock.current || disabled || !files.length) return
    lock.current = true
    onBusyChange(true)
    setError("")
    let next = [...value]
    try {
      parseOfferAttachments([...next, ...files.map((file, index) => ({ id: `pending_${index}`, ...validateOfferFile(file.name, file.size) }))])
      for (const file of files) {
        setProgress(`${file.name} — 0%`)
        const init = await fetch("/api/offer/attachments", { method: "POST", headers: await headers(), body: JSON.stringify({ action: "initiate", context, filename: file.name, size: file.size }) })
        const permit = await init.json()
        if (!init.ok) throw new Error(permit.error)
        const task = uploadBytesResumable(ref(storage, permit.path), file, { contentType: permit.contentType })
        await new Promise<void>((resolve, reject) => task.on("state_changed", snapshot => setProgress(`${file.name} — ${Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)}%`), reject, resolve))
        const finish = await fetch("/api/offer/attachments", { method: "POST", headers: await headers(), body: JSON.stringify({ action: "finalize", context, id: permit.id }) })
        const attachment = await finish.json()
        if (!finish.ok) throw new Error(attachment.error)
        next = [...next, attachment]
        onChange(next)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Încărcarea a eșuat. Selectați din nou fișierele rămase.") }
    finally { lock.current = false; setProgress(null); onBusyChange(false); if (input.current) input.current.value = "" }
  }
  async function download(file: OfferEmailAttachment) {
    setError("")
    try {
      const query = new URLSearchParams({ kind: context.kind, contextId: context.id, id: file.id })
      const response = await fetch(`/api/offer/attachments?${query}`, { headers: await headers() })
      if (!response.ok) throw new Error((await response.json()).error)
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Descărcarea a eșuat.") }
  }
  return <div className="grid gap-2 rounded-md border p-3" aria-label="Atașamente email">
    <label htmlFor={inputId} className="text-sm font-medium">Atașamente email</label>
    <p className="text-xs text-muted-foreground">Maximum 10 fișiere, 10 MB/fișier și 15 MB în total cu PDF-ul ofertei. PDF, imagini, Word, Excel, DWG, DXF sau ZIP.</p>
    <input ref={input} id={inputId} type="file" multiple accept={OFFER_ATTACHMENT_ACCEPT} disabled={disabled || !!progress} onChange={event => void upload(Array.from(event.target.files || []))} className="sr-only" />
    <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={disabled || !!progress || value.length >= 10} onClick={() => input.current?.click()}>Atașează fișiere</Button>
    {value.map(file => <div key={file.id} className="flex min-w-0 items-center gap-2 text-sm">
      <button type="button" className="min-w-0 flex-1 truncate text-left underline" title={file.filename} onClick={() => void download(file)}>{file.filename}</button>
      <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1_000_000).toFixed(2)} MB</span>
      <Button type="button" size="sm" variant="ghost" disabled={disabled || !!progress} aria-label={`Elimină ${file.filename}`} onClick={() => onChange(value.filter(item => item.id !== file.id))}>Elimină</Button>
    </div>)}
    {progress && <p role="status" className="text-xs">Se încarcă {progress}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">PDF-ul ofertei este atașat automat. Salvați draftul pentru a păstra fișierele selectate.</p>
  </div>
}
