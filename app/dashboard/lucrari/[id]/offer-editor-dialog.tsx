"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle } from "lucide-react"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { updateLucrare, getLucrareById, getClientById, addUserLogEntry } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/hooks/use-toast"
// Recipient selection temporarily disabled; show read-only info instead

interface OfferEditorDialogProps {
  lucrareId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProducts?: ProductItem[]
  // Optional preset recipient/location from parent page to avoid async mismatch
  presetRecipientEmail?: string
  presetLocationLabel?: string
}

export function OfferEditorDialog({ lucrareId, open, onOpenChange, initialProducts = [], presetRecipientEmail, presetLocationLabel }: OfferEditorDialogProps) {
  const { userData } = useAuth()
  const [products, setProducts] = useState<ProductItem[]>(initialProducts)
  const [saving, setSaving] = useState(false)
  const [versions, setVersions] = useState<Array<{ savedAt: string; savedBy?: string; total: number; products: ProductItem[] }>>([])
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [vatPercent, setVatPercent] = useState<number>(21)
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(0)
  const [adjustmentInput, setAdjustmentInput] = useState<string>("")
  const [isPickedUp, setIsPickedUp] = useState<boolean>(true)
  const [statusOferta, setStatusOferta] = useState<string | undefined>(undefined)
  const [editingNewVersion, setEditingNewVersion] = useState(false)
  const [baselineProducts, setBaselineProducts] = useState<ProductItem[]>(initialProducts)
  const [initialVersionsCount, setInitialVersionsCount] = useState(0)
  const [canSendOffer, setCanSendOffer] = useState(false)
  const [currentWork, setCurrentWork] = useState<any>(null)
  const [clientData, setClientData] = useState<any>(null)
  const [acceptedSavedAt, setAcceptedSavedAt] = useState<string | null>(null)
  const [rejectedSavedAt, setRejectedSavedAt] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  // read-only suggested recipient
  const suggestedRecipient = useMemo(() => {
    try {
      return presetRecipientEmail || resolveRecipientEmailForLocation(clientData, currentWork)
    } catch {
      return null
    }
  }, [presetRecipientEmail, clientData, currentWork])
  const [termsPayment, setTermsPayment] = useState<string>("")
  const [termsDelivery, setTermsDelivery] = useState<string>("")
  const [termsInstallation, setTermsInstallation] = useState<string>("")

useEffect(() => {
  // Actualizăm mereu baseline-ul din props
  setBaselineProducts(initialProducts || [])
  // Nu suprascriem produsele în timp ce dialogul este deschis și există deja rânduri (nesalvate)
  if (!open) {
    setProducts(initialProducts || [])
    return
  }
  if (!products || products.length === 0) {
    setProducts(initialProducts || [])
  }
  // altfel, păstrăm lista curentă (rânduri noi incluse)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [initialProducts, open])

  useEffect(() => {
    const load = async () => {
      const current = await getLucrareById(lucrareId)
      setVersions(((current as any)?.offerVersions || []) as any)
      setIsPickedUp(Boolean((current as any)?.preluatDispecer))
      setStatusOferta((current as any)?.statusOferta)
      setCurrentWork(current)
      try {
        const resp = (current as any)?.offerResponse
        const acceptedSnapshotAt = (current as any)?.acceptedOfferSnapshot?.savedAt || null
        const versionAt = (current as any)?.offerActionVersionSavedAt || null
        if (resp?.status === 'accept') {
          setAcceptedSavedAt(acceptedSnapshotAt ? String(acceptedSnapshotAt) : (versionAt ? String(versionAt) : null))
          setRejectedSavedAt(null)
          setRejectionReason(null)
        } else if (resp?.status === 'reject') {
          setAcceptedSavedAt(null)
          const rejAt = versionAt || (current as any)?.offerActionSnapshot?.savedAt || null
          setRejectedSavedAt(rejAt ? String(rejAt) : null)
          setRejectionReason(resp?.reason ? String(resp.reason) : null)
        } else {
          setAcceptedSavedAt(acceptedSnapshotAt ? String(acceptedSnapshotAt) : null)
          setRejectedSavedAt(null)
          setRejectionReason(null)
        }
      } catch {}
      try {
        const cid = (current as any)?.clientInfo?.id
        if (cid) {
          const c = await getClientById(cid)
          setClientData(c)
        }
      } catch {}
      {
        const rawVat = (current as any)?.offerVAT
        const nextVat = (typeof rawVat === 'number' && rawVat > 0) ? Number(rawVat) : 21
        setVatPercent(nextVat)
        const rawAdj = (current as any)?.offerAdjustmentPercent
        const nextAdj = (typeof rawAdj === 'number') ? Number(rawAdj) : 0
        setAdjustmentPercent(nextAdj)
        setAdjustmentInput(String(nextAdj))
      }
      // Initialize dynamic terms from existing conditiiOferta if present
      try {
        const conds: string[] = Array.isArray((current as any)?.conditiiOferta) ? ((current as any).conditiiOferta as string[]) : []
        const findByPrefix = (prefix: string) => conds.find((c) => String(c || '').toLowerCase().startsWith(prefix))
        const p = findByPrefix('plata:')
        const l = findByPrefix('livrare:')
        const i = findByPrefix('instalare:')
        if (p) setTermsPayment(p.replace(/^plata:\s*/i, '').trim() || termsPayment)
        if (l) setTermsDelivery(l.replace(/^livrare:\s*/i, '').trim() || termsDelivery)
        if (i) setTermsInstallation(i.replace(/^instalare:\s*/i, '').trim() || termsInstallation)
      } catch {}
    }
    if (open) void load()
  }, [open, lucrareId])

  // no manual recipient selection; display-only suggestion handled via suggestedRecipient

  // Helper: resolve best email for the work's location/contact with robust fallbacks
  const resolveRecipientEmailForLocation = (client: any, work: any): string | null => {
    const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(e || ''))
    const norm = (s?: string) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
    const matches = (a?: string, b?: string) => {
      const na = norm(a); const nb = norm(b)
      if (!na || !nb) return false
      return na === nb || na.includes(nb) || nb.includes(na)
    }

    const locatii = Array.isArray(client?.locatii) ? client.locatii : []
    const targetId = work?.clientInfo?.locationId || work?.clientInfo?.locatieId || work?.locationId
    const targetName = work?.locatie || work?.clientInfo?.locationName
    const targetAddr = work?.clientInfo?.locationAddress
    const targetContactName = work?.persoanaContact

    // 1) Try ID match first
    let loc = targetId ? locatii.find((l: any) => String(l?.id || '') === String(targetId)) : undefined
    // 2) Fallback: name/address fuzzy match
    if (!loc) {
      loc = locatii.find((l: any) => matches(l?.nume, targetName) || matches(l?.adresa, targetAddr))
    }

    // If we have a location, try exact contact match first, then any contact, then location email
    if (loc) {
      const persoane: any[] = Array.isArray(loc?.persoaneContact) ? loc.persoaneContact : []
      const exact = persoane.find((c: any) => matches(c?.nume, targetContactName))
      if (isValid(exact?.email)) return String(exact.email)
      const anyContact = persoane.find((c: any) => isValid(c?.email))
      if (isValid(anyContact?.email)) return String(anyContact.email)
      if (isValid(loc?.email)) return String(loc.email)
    }

    // Global fallbacks on client level
    if (isValid(client?.email)) return String(client.email)
    const persoaneClient: any[] = Array.isArray(client?.persoaneContact) ? client.persoaneContact : []
    const anyClientContact = persoaneClient.find((c: any) => isValid(c?.email))
    if (isValid(anyClientContact?.email)) return String(anyClientContact.email)

    // No valid email found
    return null
  }

  const total = useMemo(() => products.reduce((s, p) => s + (p.total || 0), 0), [products])
  // Discount as percentage applied to subtotal (acts like a discount)
  const discountedTotal = useMemo(() => {
    const adj = Number(adjustmentPercent) || 0
    return total * (1 - adj / 100)
  }, [total, adjustmentPercent])
  const totalWithVAT = useMemo(() => discountedTotal * (1 + (Number(vatPercent) || 0) / 100), [discountedTotal, vatPercent])

  // Persist draft locally so rows added are not lost if dialog is closed without save
  const draftStorageKey = useMemo(() => `offerDraft:${lucrareId}`, [lucrareId])

  // Load draft on open (if exists)
  useEffect(() => {
    if (!open) return
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(draftStorageKey) : null
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.products)) {
        setProducts(parsed.products as ProductItem[])
      }
    } catch {}
  }, [open, draftStorageKey])

  // Save draft whenever products change (debounced by event loop naturally; lightweight)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const payload = JSON.stringify({ products, updatedAt: new Date().toISOString() })
      localStorage.setItem(draftStorageKey, payload)
    } catch {}
  }, [products, draftStorageKey])

  // Nu populăm automat rânduri demo când dialogul este deschis – lăsăm gol implicit

  // When versions load, remember initial count to know if a save created a new version
  useEffect(() => {
    if (open) {
      setInitialVersionsCount(versions?.length || 0)
      setCanSendOffer(false)
    }
  }, [open, versions?.length])

  const handleSave = async () => {
    try {
      setSaving(true)
      // determinăm baseline: ultima versiune sau baseline-ul din deschidere
      const last = versions && versions.length ? versions[versions.length - 1] : undefined
      const baseline = last?.products?.length ? last.products : baselineProducts
      const changed = JSON.stringify(products) !== JSON.stringify(baseline) || (last?.total ?? 0) !== total
      if (!changed) {
        // Nu închidem dialogul dacă nu sunt schimbări
        setCanSendOffer(true)
        return
      }
      const version = {
        savedAt: new Date().toISOString(),
        savedBy: userData?.displayName || userData?.email || "Unknown",
        total: discountedTotal,
        products,
      }
      const current = await getLucrareById(lucrareId)
      const existing = (current as any)?.offerVersions || []
      const newVersions = [...existing, version]
      // Build dynamic conditions (without warranty)
      const conditiiOferta = [
        `Plata: ${termsPayment}`,
        `Livrare: ${termsDelivery}`,
        `Instalare: ${termsInstallation}`,
      ]
      const adjToSave = (() => { const n = parseFloat(String(adjustmentInput).replace(',', '.')); return isNaN(n) ? 0 : n })()
      await updateLucrare(lucrareId, {
        products,
        // Save discounted total as the effective offer total
        offerTotal: discountedTotal,
        offerVAT: Number(vatPercent) || 0,
        offerAdjustmentPercent: adjToSave,
        offerVersions: newVersions as any,
        conditiiOferta: conditiiOferta as any,
      } as any)
      setVersions(newVersions)
      setBaselineProducts(products)
      setEditingNewVersion(false)
      // allow sending after a new version is created și păstrăm dialogul deschis
      setCanSendOffer(true)
      // clear draft after successful save
      try { if (typeof window !== 'undefined') localStorage.removeItem(draftStorageKey) } catch {}
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (index: number) => {
    try {
      setSaving(true)
      const v = versions[index]
      // Restaurăm produsele și totalul fără a crea o versiune nouă în istoric
      await updateLucrare(lucrareId, {
        products: v.products,
        offerTotal: v.total,
      } as any)
      setProducts(v.products)
      // Istoricul rămâne neschimbat (nu adăugăm o versiune nouă)
    } finally {
      setSaving(false)
    }
  }

  const canEditOffer = isPickedUp && statusOferta !== "OFERTAT"
  const effectiveDisabled = !canEditOffer && !editingNewVersion
  const startNewVersion = () => {
    const last = versions && versions.length ? versions[versions.length - 1] : undefined
    const seed = last?.products?.length ? last.products : products
    setProducts(seed)
    setEditingNewVersion(true)
  }

  const handleSendOffer = async () => {
    try {
      setSaving(true)
      // generează token și link-uri
      // Folosim savedAt-ul ultimei versiuni salvate, pentru a putea marca corect versiunea ACCEPTATĂ în istoric
      const lastVersion = versions && versions.length ? versions[versions.length - 1] : undefined
      const computedSubtotal = (products || []).reduce((s: number, p: any) => s + (Number(p.total) || (Number(p.quantity)||0)*(Number(p.price)||0)), 0)
      const computedTotal = computedSubtotal * (1 - (Number(adjustmentPercent)||0)/100)
      const currentSnapshot = {
        products: (lastVersion?.products && Array.isArray(lastVersion.products)) ? lastVersion.products : products,
        total: typeof lastVersion?.total === 'number' ? lastVersion.total : computedTotal,
        vat: Number(vatPercent) || 0,
        savedAt: String(lastVersion?.savedAt || new Date().toISOString()),
      }
      const tokenResp = await fetch('/api/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lucrareId, snapshot: currentSnapshot })
      })
      if (!tokenResp.ok) throw new Error('Nu s-a putut genera link-ul de ofertă')
      const { acceptUrl, rejectUrl } = await tokenResp.json()
  
      // ia date proaspete
      const freshWork = await getLucrareById(lucrareId)
      let freshClient: any = clientData
      try {
        const cid = (freshWork as any)?.clientInfo?.id
        if (cid) freshClient = await getClientById(cid)
      } catch {}
      const recipient = presetRecipientEmail || resolveRecipientEmailForLocation(freshClient, freshWork)
      if (!recipient) throw new Error('Nu există un email valid disponibil pentru această lucrare.')
  
      toast({ title: 'Se trimite ofertă', description: `Către: ${recipient}` })
  
      // construiește tabelul cu produse
      const subject = `Ofertă pentru lucrarea ${currentWork?.numarRaport || currentWork?.id}`
      const rows = (products || []).map((p: any) => `
        <tr>
          <td style="padding:6px;border:1px solid #e5e7eb">${p.name || ''}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:center">${p.um || '-'}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${Number(p.quantity||0)}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${Number(p.price||0).toFixed(2)}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${((Number(p.quantity)||0)*(Number(p.price)||0)).toFixed(2)}</td>
        </tr>`).join('')
      const subtotalNoVat = (products || []).reduce((s: number, p: any) => s + (Number(p.quantity)||0)*(Number(p.price)||0), 0)
      const totalNoVat = subtotalNoVat * (1 - (Number(adjustmentPercent)||0)/100)
  
      // HTML email cu text introductiv, listă, tabel și butoane
      const bullets = (products || []).map((p: any) => `<li>${p?.name || ''}${p?.quantity ? ` — ${Number(p.quantity)} buc.` : ''}${p?.price ? ` @ ${Number(p.price).toFixed(2)} lei` : ''}</li>`).join('')
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220"> 
          <h2 style="margin:0 0 12px;color:#0f56b3">Ofertă lucrarea ${currentWork?.numarRaport || currentWork?.id}</h2>

          <p style="margin:8px 0 6px;color:#0b1220">În vederea finalizării lucrării ${currentWork?.numarRaport || currentWork?.id} am constatat că sunt necesare următoarele echipamente și servicii:</p>
 

          <table style="border-collapse:collapse;width:100%;margin-top:8px;font-size:14px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Denumire</th>
                <th style="padding:6px;border:1px solid #e5e7eb;text-align:center">UM</th>
                <th style="padding:6px;border:1px solid #e5e7eb;text-align:right">Buc</th>
                <th style="padding:6px;border:1px solid #e5e7eb;text-align:right">PU (lei)</th>
                <th style="padding:6px;border:1px solid #e5e7eb;text-align:right">Total (lei)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:600">Total fără TVA</td>
                <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:700">${totalNoVat.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="margin:12px 0 6px;color:#0b1220">Vă rugăm să ne transmiteți poziția dvs. față de oferta de mai sus prin apăsarea butonului „acceptă/refuză”.</p>

          <p style="margin:10px 0 6px;color:#64748b">Link-ul este valabil 30 de zile de la primirea emailului. După acceptare/refuzare, linkurile devin inactive.</p>
  
          <!-- Butoane -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px">
            <tr>
              <!-- Accept -->
              <td align="center" valign="middle" bgcolor="#16a34a" style="border-radius:6px;">
                <a href="${acceptUrl}" rel="noopener noreferrer"
                   style="display:inline-block;padding:12px 16px;font-weight:600;
                          font-family:Arial,sans-serif;font-size:14px;
                          color:#ffffff;text-decoration:none;border-radius:6px;">
                  Accept ofertă
                </a>
              </td>
              <td style="width:12px">&nbsp;</td>
              <!-- Refuz -->
              <td align="center" valign="middle" bgcolor="#dc2626" style="border-radius:6px;">
                <a href="${rejectUrl}" rel="noopener noreferrer"
                   style="display:inline-block;padding:12px 16px;font-weight:600;
                          font-family:Arial,sans-serif;font-size:14px;
                          color:#ffffff;text-decoration:none;border-radius:6px;">
                  Refuz ofertă
                </a>
              </td>
            </tr>
          </table>
  
          <div style="margin-top:10px;font-size:12px;color:#64748b"> 
            Dacă butoanele nu funcționează, folosiți direct link-urile: 
            <div style="margin-top:6px"> 
              Accept: <span style="word-break:break-all">
                <a href="${acceptUrl}" rel="noopener noreferrer" style="color:#0f56b3;text-decoration:underline">${acceptUrl}</a>
              </span> 
            </div> 
            <div> 
              Refuz: <span style="word-break:break-all">
                <a href="${rejectUrl}" rel="noopener noreferrer" style="color:#0f56b3;text-decoration:underline">${rejectUrl}</a>
              </span> 
            </div> 
          </div>

          <div style="margin-top:14px;font-size:11px;color:#6b7280">Acesta este un mesaj automat emis de FOM by NRG. Nu răspundeți la acest e-mail; această căsuță de e-mail nu este supravegheată de nicio persoană. Pentru neclarități sau alte detalii vă rugăm să contactați persoana atribuită contului dvs.</div>
        </div>`
  
      // atașament PDF ofertă pentru client
      let attachmentData: any[] | undefined = undefined
      try {
        const currentProducts = products || []
        if (currentProducts.length) {
          const { generateOfferPdf } = await import('@/lib/utils/offer-pdf')
          const blob = await generateOfferPdf({
            id: String(lucrareId),
            numarRaport: String(currentWork?.numarRaport || ''),
            offerNumber: Number((freshWork as any)?.offerSendCount || 0) + 1,
            client: freshWork?.client || "",
            attentionTo: freshWork?.persoanaContact || "",
            fromCompany: "NRG Access Systems SRL",
            products: currentProducts.map((p: any) => ({ name: p?.name || '', quantity: Number(p?.quantity||0), price: Number(p?.price||0) })),
            offerVAT: Number(vatPercent) || 0,
            adjustmentPercent: Number(adjustmentPercent) || 0,
            damages: [],
            conditions: Array.isArray((freshWork as any)?.conditiiOferta) ? (freshWork as any).conditiiOferta : undefined,
            equipmentName: String((freshWork as any)?.echipament || ''),
            locationName: String((freshWork as any)?.locatie || ''),
            preparedBy: String(userData?.displayName || userData?.email || ''),
            preparedAt: new Date().toISOString().slice(0,10).split('-').reverse().join('.'),
            beneficiar: {
              name: String((freshWork as any)?.client || (freshWork as any)?.clientInfo?.nume || ''),
              cui: String((freshWork as any)?.clientInfo?.cui || ''),
              reg: String((freshWork as any)?.clientInfo?.rc || ''),
              address: String((freshWork as any)?.clientInfo?.adresa || ''),
            },
          } as any)

          const blobToBase64 = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              try {
                const result = String(reader.result || '')
                const base64 = result.includes(',') ? result.split(',')[1] : result
                resolve(base64)
              } catch (e) { reject(e) }
            }
            reader.onerror = reject
            reader.readAsDataURL(b)
          })

          const base64 = await blobToBase64(blob)
          attachmentData = [{ filename: `oferta_${String(currentWork?.numarRaport || currentWork?.id)}.pdf`, content: base64, encoding: 'base64', contentType: 'application/pdf' }]
        }
      } catch {}

      // trimite email (cu atașament, dacă există)
      const resp = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: [recipient], subject, html, attachments: attachmentData })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err?.error || `Cerere invalidă (${resp.status})`)
      }
  
      // marchează ca ofertat și salvează autorul/datele pregătirii ofertei
      await updateLucrare(lucrareId, {
        statusOferta: "OFERTAT",
        offerPreparedBy: userData?.displayName || userData?.email || "—",
        offerPreparedAt: new Date(),
      } as any)
      setStatusOferta("OFERTAT")
      setCanSendOffer(false)
      toast({ title: 'Ofertă trimisă', description: `S-a trimis oferta la: ${recipient}` })
      // log non‑blocking în colecția loguri
      void addUserLogEntry({
        utilizator: userData?.displayName || userData?.email || "Utilizator",
        utilizatorId: userData?.uid || "system",
        actiune: "Trimitere ofertă",
        detalii: `Lucrare: ${String(currentWork?.numarRaport || lucrareId)}; Către: ${recipient}; Versiune: ${String(currentSnapshot.savedAt)}`,
        tip: "Informație",
        categorie: "Email",
      })
  
      // curăță draft
      try { if (typeof window !== 'undefined') localStorage.removeItem(draftStorageKey) } catch {}
    } catch (e) {
      console.warn('Trimitere ofertă eșuată', e)
      const msg = e instanceof Error ? e.message : 'Nu s-a putut trimite emailul.'
      toast({ title: 'Eroare trimitere', description: msg, variant: 'destructive' })
      // log non‑blocking eroare trimitere
      void addUserLogEntry({
        utilizator: userData?.displayName || userData?.email || "Utilizator",
        utilizatorId: userData?.uid || "system",
        actiune: "Trimitere ofertă eșuată",
        detalii: `Lucrare: ${String(currentWork?.numarRaport || lucrareId)}; Motiv: ${msg}`,
        tip: "Eroare",
        categorie: "Email",
      })
    } finally {
      setSaving(false)
    }
  }
  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader >
        {/* <DialogTitle className="my-4">Editor ofertă</DialogTitle> */}
      </DialogHeader>
      <DialogContent className="max-w-[1600px] w-[calc(100%-2rem)] max-h-[95vh] p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 space-y-4 overflow-y-auto max-h-[calc(95vh-8rem)] p-6">
            <ProductTableForm products={products} onProductsChange={setProducts} disabled={effectiveDisabled} />

            {/* Termeni ofertă (dinamici) */}
            <div className="space-y-3">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de plată</label>
                  <input
                    type="text"
                    value={termsPayment}
                    onChange={(e) => setTermsPayment(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 100% în avans"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de livrare</label>
                  <input
                    type="text"
                    value={termsDelivery}
                    onChange={(e) => setTermsDelivery(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 30 zile lucrătoare de la plată"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de instalare</label>
                  <input
                    type="text"
                    value={termsInstallation}
                    onChange={(e) => setTermsInstallation(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 1-2 zile lucrătoare de la livrare"
                  />
                </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">TVA (%)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(vatPercent)}
                    onChange={(e) => {
                      const onlyDigits = e.target.value.replace(/\D+/g, "")
                      setVatPercent(Number(onlyDigits || 0))
                    }}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Ajustare (%)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustmentInput}
                    onChange={(e) => setAdjustmentInput(e.target.value)}
                    onBlur={() => {
                      const n = parseFloat(String(adjustmentInput).replace(',', '.'))
                      const safe = isNaN(n) ? 0 : n
                      setAdjustmentPercent(safe)
                      setAdjustmentInput(String(safe))
                    }}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 5"
                  />
                </div>
              </div>
              </div>
            {/* Sumar total */}
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <div className="text-right text-sm">
                  <div>Subtotal: <strong>{total.toFixed(2)} lei</strong></div>
                  <div>Ajustare: <strong>-{(Number(adjustmentPercent)||0).toFixed(0)}%</strong></div>
                  <div>Total după ajustare: <strong>{discountedTotal.toFixed(2)} lei</strong></div>
                </div>
              </div>

              {/* Destinatar informativ (read-only) */}
              <div className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-2">
                {suggestedRecipient ? (
                  <>
                    <span className="font-medium">Oferta se va trimite la adresa de email: </span>
                    <span>{suggestedRecipient}</span>
                    {(presetLocationLabel || currentWork?.locatie || currentWork?.clientInfo?.locationName || currentWork?.clientInfo?.locationAddress) ? (
                      <span>{` (Locație: ${presetLocationLabel || currentWork?.locatie || currentWork?.clientInfo?.locationName || ''}${currentWork?.clientInfo?.locationAddress && !presetLocationLabel ? ` — ${currentWork?.clientInfo?.locationAddress}` : ''})`}</span>
                    ) : null}
                  </>
                ) : (!currentWork || clientData === null) ? (
                  <span>Se identifică adresa de email a persoanei de contact din locația lucrării...</span>
                ) : (
                  <span>Nu există email valid pentru persoana de contact din locația lucrării.</span>
                )}
              </div>
            </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {(!isPickedUp || statusOferta === "OFERTAT") && (
                <span className="text-xs text-muted-foreground mr-auto">{!isPickedUp ? "Editorul este disponibil după preluarea lucrării de către dispecer." : "Oferta trimisă este înghețată. Creați o versiune nouă pentru modificări."}</span>
              )}
              {statusOferta === "OFERTAT" && !editingNewVersion ? (
                <Button onClick={startNewVersion} disabled={saving}>Începe versiune nouă</Button>
              ) : (
                <Button onClick={handleSave} disabled={saving || products.length === 0 || (!isPickedUp && !editingNewVersion)}>{saving ? "Se salvează..." : "Salvează"}</Button>
              )}
              <Button onClick={handleSendOffer} disabled={saving}>Trimite ofertă</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="ml-2">Închide</Button>
            </div>
          </div>
          <div className="space-y-3 p-6 overflow-y-auto max-h-[calc(95vh-8rem)]">
          <div className="text-sm font-medium">Istoric versiuni ofertă</div>
            <div className="rounded border divide-y bg-white">
              {versions?.length ? versions.map((v, i) => (
                <div key={i} className={`p-2 text-sm ${
                  acceptedSavedAt && String(v.savedAt) === String(acceptedSavedAt)
                    ? 'ring-2 ring-green-500 rounded-md bg-green-50'
                    : rejectedSavedAt && String(v.savedAt) === String(rejectedSavedAt)
                      ? 'ring-2 ring-red-500 rounded-md bg-red-50'
                      : ''
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        <span>{new Date(v.savedAt).toLocaleString("ro-RO")}</span>
                      </div>
                      {acceptedSavedAt && String(v.savedAt) === String(acceptedSavedAt) && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="bg-green-200 text-green-800 inline-flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Ofertă acceptată
                          </Badge>
                        </div>
                      )}
                      {rejectedSavedAt && String(v.savedAt) === String(rejectedSavedAt) && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="bg-red-200 text-red-800 inline-flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Ofertă refuzată
                          </Badge>
                        </div>
                      )}
                      {rejectedSavedAt && String(v.savedAt) === String(rejectedSavedAt) && rejectionReason && (
                        <div className="mt-1 text-[11px] leading-4 text-red-800 bg-red-100/60 rounded px-1.5 py-0.5 max-w-full truncate" title={rejectionReason}>
                          {rejectionReason}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground truncate">{v.savedBy || "-"} • Total: {v.total?.toFixed?.(2) ?? v.total} lei</div>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewIndex(i)}>Vizualizează</Button>
                    <Button size="sm" onClick={() => handleRestore(i)} disabled={saving}>Restaurează</Button>
                    </div>
                  </div>
                  {viewIndex === i && (
                    <div className="mt-2 bg-gray-50 rounded p-2">
                      {v.products?.length ? (
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          {v.products.map((p, idx) => (
                            <li key={idx} className="truncate">{p.name} – {p.quantity} x {p.price} = {p.total} lei</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-muted-foreground">Fără produse</div>
                      )}
                      {rejectedSavedAt && String(v.savedAt) === String(rejectedSavedAt) && rejectionReason && (
                        <div className="mt-2 text-xs">
                          <span className="font-medium text-red-800">Motiv refuz:</span>{' '}
                          <span className="text-red-900">{rejectionReason}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )) : (
                <div className="p-2 text-sm text-muted-foreground">Nu există versiuni salvate.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


