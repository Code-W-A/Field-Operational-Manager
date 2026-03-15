"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { updateLucrare, getLucrareById, getClientById, addUserLogEntry } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/hooks/use-toast"
import { useTargetList, useTargetValue } from "@/hooks/use-settings"
import { generateDevizPdf } from "@/lib/utils/offer-pdf"
import {
  blobToBase64,
  buildPricingConditions,
  formatPreparedDate,
  normalizeEmail,
  resolveRecipientEmailForLocation,
} from "@/lib/work-documents/shared"

interface DevizEditorDialogProps {
  lucrareId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProducts?: ProductItem[]
  presetRecipientEmail?: string
  presetLocationLabel?: string
}

type DevizVersion = {
  savedAt: string
  savedBy?: string
  total: number
  products: ProductItem[]
}

export function DevizEditorDialog({
  lucrareId,
  open,
  onOpenChange,
  initialProducts = [],
  presetRecipientEmail,
  presetLocationLabel,
}: DevizEditorDialogProps) {
  const { userData } = useAuth()
  const [products, setProducts] = useState<ProductItem[]>(initialProducts)
  const [versions, setVersions] = useState<DevizVersion[]>([])
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [isPickedUp, setIsPickedUp] = useState(true)
  const [currentWork, setCurrentWork] = useState<any>(null)
  const [clientData, setClientData] = useState<any>(null)
  const [vatPercent, setVatPercent] = useState<number>(21)
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(0)
  const [adjustmentInput, setAdjustmentInput] = useState<string>("0")
  const [termsPayment, setTermsPayment] = useState("")
  const [termsDelivery, setTermsDelivery] = useState("")
  const [termsInstallation, setTermsInstallation] = useState("")
  const [canSendDeviz, setCanSendDeviz] = useState(false)
  const [lastEmailDebug, setLastEmailDebug] = useState<any>(null)
  const { items: paymentTermOptions } = useTargetList("offer.paymentTermsOptions")
  const { items: deliveryTermOptions } = useTargetList("offer.deliveryTermsOptions")
  const { items: installationTermOptions } = useTargetList("offer.installationTermsOptions")
  const { value: defaultVatPercentSetting } = useTargetValue<number>("offer.defaultVatPercent")

  const total = useMemo(() => products.reduce((sum, product) => sum + (Number(product.total) || 0), 0), [products])
  const discountedTotal = useMemo(() => {
    const adjustment = Number(adjustmentPercent) || 0
    return total * (1 - adjustment / 100)
  }, [total, adjustmentPercent])

  useEffect(() => {
    setProducts(initialProducts || [])
  }, [initialProducts])

  useEffect(() => {
    if (!open) return

    const load = async () => {
      const current = await getLucrareById(lucrareId)
      setCurrentWork(current)
      setVersions(Array.isArray((current as any)?.devizVersions) ? (current as any).devizVersions : [])
      setIsPickedUp(Boolean((current as any)?.preluatDispecer))
      setProducts(Array.isArray((current as any)?.devizProducts) ? (current as any).devizProducts : initialProducts || [])
      setVatPercent(
        typeof (current as any)?.devizVAT === "number"
          ? Number((current as any).devizVAT)
          : typeof defaultVatPercentSetting === "number"
            ? Number(defaultVatPercentSetting)
            : 21,
      )
      const nextAdjustment =
        typeof (current as any)?.devizAdjustmentPercent === "number"
          ? Number((current as any).devizAdjustmentPercent)
          : 0
      setAdjustmentPercent(nextAdjustment)
      setAdjustmentInput(String(nextAdjustment))

      try {
        const conditions: string[] = Array.isArray((current as any)?.devizConditions) ? (current as any).devizConditions : []
        const findByPrefix = (prefix: string) => conditions.find((entry) => String(entry || "").toLowerCase().startsWith(prefix))
        const payment = findByPrefix("plata:")
        const delivery = findByPrefix("livrare:")
        const installation = findByPrefix("instalare:")
        setTermsPayment(payment ? payment.replace(/^plata:\s*/i, "").trim() : "")
        setTermsDelivery(delivery ? delivery.replace(/^livrare:\s*/i, "").trim() : "")
        setTermsInstallation(installation ? installation.replace(/^instalare:\s*/i, "").trim() : "")
      } catch {
        setTermsPayment("")
        setTermsDelivery("")
        setTermsInstallation("")
      }

      try {
        const clientId = (current as any)?.clientId || (current as any)?.clientInfo?.id
        if (clientId) {
          setClientData(await getClientById(String(clientId)))
        } else {
          setClientData(null)
        }
      } catch {
        setClientData(null)
      }
    }

    void load()
  }, [open, lucrareId, initialProducts, defaultVatPercentSetting])

  useEffect(() => {
    setCanSendDeviz(versions.length > 0)
  }, [versions.length])

  const suggestedRecipient = useMemo(() => {
    try {
      return resolveRecipientEmailForLocation(clientData, currentWork, presetRecipientEmail)
    } catch {
      return null
    }
  }, [clientData, currentWork, presetRecipientEmail])

  const resetDialog = () => {
    setViewIndex(null)
    setLastEmailDebug(null)
    setCanSendDeviz(versions.length > 0)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const version: DevizVersion = {
        savedAt: new Date().toISOString(),
        savedBy: userData?.displayName || userData?.email || "Unknown",
        total: discountedTotal,
        products,
      }
      const current = await getLucrareById(lucrareId)
      const existingVersions = Array.isArray((current as any)?.devizVersions) ? (current as any).devizVersions : []
      const updatedVersions = [...existingVersions, version]
      const conditions = buildPricingConditions(termsPayment, termsDelivery, termsInstallation)
      const normalizedAdjustment = parseFloat(String(adjustmentInput).replace(",", "."))

      await updateLucrare(lucrareId, {
        devizProducts: products,
        devizTotal: discountedTotal,
        devizVAT: Number(vatPercent) || 0,
        devizAdjustmentPercent: Number.isNaN(normalizedAdjustment) ? 0 : normalizedAdjustment,
        devizVersions: updatedVersions as any,
        devizConditions: conditions as any,
      } as any)

      setVersions(updatedVersions)
      setCanSendDeviz(true)
      toast({ title: "Deviz salvat", description: "Versiunea curentă a fost salvată." })
    } catch (error) {
      console.error("Eroare la salvarea devizului:", error)
      toast({ title: "Eroare", description: "Nu s-a putut salva devizul.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (index: number) => {
    try {
      setSaving(true)
      const version = versions[index]
      if (!version) return
      await updateLucrare(lucrareId, {
        devizProducts: version.products,
        devizTotal: version.total,
      } as any)
      setProducts(version.products)
      toast({ title: "Versiune restaurată", description: "Pozițiile devizului au fost restaurate." })
    } catch (error) {
      console.error("Eroare la restaurarea devizului:", error)
      toast({ title: "Eroare", description: "Nu s-a putut restaura versiunea.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleSendDeviz = async () => {
    try {
      setSaving(true)

      const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null
      if (!latestVersion) {
        throw new Error("Salvați întâi o versiune de deviz.")
      }

      const freshWork = await getLucrareById(lucrareId)
      let freshClient: any = clientData
      try {
        const clientId = (freshWork as any)?.clientId || (freshWork as any)?.clientInfo?.id
        if (clientId) freshClient = await getClientById(String(clientId))
      } catch {}

      const recipient = normalizeEmail(resolveRecipientEmailForLocation(freshClient, freshWork, presetRecipientEmail))
      if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new Error("Nu există un email valid disponibil pentru această tichet.")
      }

      const preparedAt = formatPreparedDate(new Date())
      const blob = await generateDevizPdf({
        id: String(lucrareId),
        numarRaport: String((freshWork as any)?.numarRaport || ""),
        offerNumber: Number((freshWork as any)?.devizSendCount || 0) + 1,
        client: freshWork?.client || "",
        attentionTo: freshWork?.persoanaContact || "",
        fromCompany: "NRG Access Systems SRL",
        products: latestVersion.products.map((product: any) => ({
          name: product?.name || "",
          quantity: Number(product?.quantity || 0),
          price: Number(product?.price || 0),
        })),
        offerVAT: Number(vatPercent) || 0,
        adjustmentPercent: Number(adjustmentPercent) || 0,
        conditions: Array.isArray((freshWork as any)?.devizConditions) ? (freshWork as any).devizConditions : buildPricingConditions(termsPayment, termsDelivery, termsInstallation),
        equipmentName: String((freshWork as any)?.echipament || ""),
        locationName: String((freshWork as any)?.locatie || ""),
        preparedBy: String((freshWork as any)?.preluatDe || userData?.displayName || userData?.email || ""),
        preparedAt,
        beneficiar: {
          name: String((freshWork as any)?.client || (freshWork as any)?.clientInfo?.nume || ""),
          cui: String((freshWork as any)?.clientInfo?.cui || ""),
          reg: String((freshWork as any)?.clientInfo?.rc || ""),
          address: String((freshWork as any)?.clientInfo?.adresa || ""),
        },
      } as any)

      const fileName = `deviz_${String((freshWork as any)?.numarRaport || lucrareId)}.pdf`
      const attachmentBase64 = await blobToBase64(blob)
      const conditions = buildPricingConditions(termsPayment, termsDelivery, termsInstallation)
      const sentAtIso = new Date().toISOString()
      const subject = `Deviz pentru lucrarea ${freshWork?.numarRaport || freshWork?.id || lucrareId}`
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
          <h2 style="margin:0 0 12px;color:#0f56b3">Deviz lucrarea ${freshWork?.numarRaport || freshWork?.id || lucrareId}</h2>
          <p style="margin:8px 0 12px;color:#0b1220">Atașat găsiți devizul aferent lucrării. Documentul conține pozițiile introduse manual și condițiile comerciale aplicabile.</p>
          <p style="margin:8px 0;color:#0b1220"><strong>Total fără TVA:</strong> ${latestVersion.total.toFixed(2)} lei</p>
          <p style="margin:8px 0;color:#64748b">Locație: ${presetLocationLabel || freshWork?.locatie || freshWork?.clientInfo?.locationName || "-"}</p>
          <div style="margin-top:14px;font-size:11px;color:#6b7280">Acesta este un mesaj automat emis de FOM by NRG.</div>
        </div>
      `

      const mailResponse = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [recipient],
          subject,
          html,
          attachments: [
            {
              filename: fileName,
              content: attachmentBase64,
              encoding: "base64",
              contentType: "application/pdf",
              lucrareId,
            },
          ],
          type: "DEVIZ",
        }),
      })

      if (!mailResponse.ok) {
        const errorPayload = await mailResponse.json().catch(() => ({}))
        setLastEmailDebug({ status: "error", recipient, apiError: errorPayload })
        throw new Error(errorPayload?.error || errorPayload?.message || `Cerere invalidă (${mailResponse.status})`)
      }

      const mailJson = await mailResponse.json().catch(() => ({}))
      setLastEmailDebug({ status: "success", recipient, api: mailJson })

      await updateLucrare(lucrareId, {
        devizProducts: latestVersion.products,
        devizTotal: latestVersion.total,
        devizVAT: Number(vatPercent) || 0,
        devizAdjustmentPercent: Number(adjustmentPercent) || 0,
        devizPreparedBy: userData?.displayName || userData?.email || "—",
        devizPreparedAt: new Date(),
        devizSendCount: Number((freshWork as any)?.devizSendCount || 0) + 1,
        devizConditions: conditions as any,
        devizDocument: {
          fileName,
          uploadedAt: sentAtIso,
          uploadedBy: userData?.displayName || userData?.email || "—",
          numarDeviz: `${String((freshWork as any)?.numarRaport || lucrareId)}-${Number((freshWork as any)?.devizSendCount || 0) + 1}`,
          dataDeviz: sentAtIso.slice(0, 10),
        },
      } as any)

      void addUserLogEntry({
        utilizator: userData?.displayName || userData?.email || "Utilizator",
        utilizatorId: userData?.uid || "system",
        actiune: "Trimitere deviz",
        detalii: `Tichet: ${String((freshWork as any)?.numarRaport || lucrareId)}; Către: ${recipient}; Versiune: ${String(latestVersion.savedAt)}`,
        tip: "Informație",
        categorie: "Email",
      })

      toast({ title: "Deviz trimis", description: `S-a trimis devizul la: ${recipient}` })
    } catch (error) {
      console.error("Eroare la trimiterea devizului:", error)
      const message = error instanceof Error ? error.message : "Nu s-a putut trimite devizul."
      toast({ title: "Eroare trimitere", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetDialog()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-[1500px] w-[calc(100%-2rem)] max-h-[95vh] p-0">
        <DialogHeader>
          <DialogTitle className="sr-only">Editor deviz</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Editor deviz: salvează versiuni și trimite documentul pe email către persoana de contact a locației.
        </DialogDescription>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 space-y-4 p-6 overflow-y-auto max-h-[calc(95vh-3rem)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Editor deviz</h2>
                <p className="text-sm text-muted-foreground">Flux separat de ofertă, cu produse și document proprii.</p>
              </div>
              <Badge variant={isPickedUp ? "default" : "secondary"}>
                {isPickedUp ? "Tichet preluat" : "Disponibil după preluare"}
              </Badge>
            </div>

            <ProductTableForm products={products} onProductsChange={setProducts} disabled={!isPickedUp || saving} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded border p-4 bg-slate-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de plată</label>
                  <input
                    type="text"
                    value={termsPayment}
                    onChange={(e) => setTermsPayment(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                    disabled={!isPickedUp || saving}
                  />
                  {!!paymentTermOptions?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {paymentTermOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="text-[11px] px-2 py-0.5 rounded border hover:bg-muted"
                          onClick={() => setTermsPayment(option.name)}
                          disabled={!isPickedUp || saving}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de livrare</label>
                  <input
                    type="text"
                    value={termsDelivery}
                    onChange={(e) => setTermsDelivery(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                    disabled={!isPickedUp || saving}
                  />
                  {!!deliveryTermOptions?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {deliveryTermOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="text-[11px] px-2 py-0.5 rounded border hover:bg-muted"
                          onClick={() => setTermsDelivery(option.name)}
                          disabled={!isPickedUp || saving}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de instalare</label>
                  <input
                    type="text"
                    value={termsInstallation}
                    onChange={(e) => setTermsInstallation(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                    disabled={!isPickedUp || saving}
                  />
                  {!!installationTermOptions?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {installationTermOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="text-[11px] px-2 py-0.5 rounded border hover:bg-muted"
                          onClick={() => setTermsInstallation(option.name)}
                          disabled={!isPickedUp || saving}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">TVA (%)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(vatPercent)}
                      onChange={(e) => setVatPercent(Number(e.target.value.replace(/\D+/g, "") || 0))}
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                      disabled={!isPickedUp || saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Discount (%)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={adjustmentInput}
                      onChange={(e) => setAdjustmentInput(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(String(adjustmentInput).replace(",", "."))
                        const safeValue = Number.isNaN(parsed) ? 0 : parsed
                        setAdjustmentPercent(safeValue)
                        setAdjustmentInput(String(safeValue))
                      }}
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                      disabled={!isPickedUp || saving}
                    />
                  </div>
                </div>

                <div className="rounded border bg-white p-3 text-sm">
                  <div>Subtotal: <strong>{total.toFixed(2)} lei</strong></div>
                  <div>Discount: <strong>-{(Number(adjustmentPercent) || 0).toFixed(0)}%</strong></div>
                  <div>Total după discount: <strong>{discountedTotal.toFixed(2)} lei</strong></div>
                </div>

                <div className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-2">
                  {suggestedRecipient ? (
                    <>
                      <span className="font-medium">Devizul se va trimite la adresa de email: </span>
                      <span>{suggestedRecipient}</span>
                      {(presetLocationLabel || currentWork?.locatie || currentWork?.clientInfo?.locationName) ? (
                        <span>{` (Locație: ${presetLocationLabel || currentWork?.locatie || currentWork?.clientInfo?.locationName || "-"})`}</span>
                      ) : null}
                    </>
                  ) : (
                    <span>Nu există email valid pentru persoana de contact din locația lucrării.</span>
                  )}
                </div>

                {lastEmailDebug && (
                  <div className="text-xs bg-slate-50 text-slate-800 border border-slate-200 rounded px-2 py-2">
                    <div>Status: <span className="font-mono">{String(lastEmailDebug.status)}</span></div>
                    {lastEmailDebug.recipient ? <div>Către: <span className="font-mono">{String(lastEmailDebug.recipient)}</span></div> : null}
                    {lastEmailDebug.api?.messageId ? <div>MessageID: <span className="font-mono">{String(lastEmailDebug.api.messageId)}</span></div> : null}
                    {lastEmailDebug.apiError ? <div>API error: <span className="font-mono">{JSON.stringify(lastEmailDebug.apiError)}</span></div> : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {!isPickedUp && (
                <span className="text-xs text-muted-foreground mr-auto">
                  Editorul este disponibil după preluarea tichetului de către dispecer.
                </span>
              )}
              <Button onClick={handleSave} disabled={saving || products.length === 0 || !isPickedUp}>
                {saving ? "Se salvează..." : "Salvează"}
              </Button>
              <Button onClick={handleSendDeviz} disabled={saving || !canSendDeviz || !isPickedUp}>
                Trimite deviz
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Închide
              </Button>
            </div>
          </div>

          <div className="space-y-3 p-6 overflow-y-auto max-h-[calc(95vh-3rem)] border-l bg-slate-50/40">
            <div className="text-sm font-medium">Istoric versiuni deviz</div>
            <div className="rounded border divide-y bg-white">
              {versions.length > 0 ? (
                versions.map((version, index) => (
                  <div key={`${version.savedAt}-${index}`} className="p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{new Date(version.savedAt).toLocaleString("ro-RO")}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {version.savedBy || "-"} • Total: {Number(version.total || 0).toFixed(2)} lei
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setViewIndex(index)}>
                          Vizualizează
                        </Button>
                        <Button size="sm" onClick={() => handleRestore(index)} disabled={saving}>
                          Restaurează
                        </Button>
                      </div>
                    </div>
                    {viewIndex === index && (
                      <div className="mt-2 rounded bg-slate-50 p-2">
                        {version.products?.length ? (
                          <ul className="list-disc list-inside space-y-1 text-xs">
                            {version.products.map((product, productIndex) => (
                              <li key={`${version.savedAt}-${productIndex}`}>
                                {product.name} - {product.quantity} x {product.price} = {product.total} lei
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-muted-foreground">Fără produse</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-3 text-sm text-muted-foreground">Nu există versiuni salvate.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
