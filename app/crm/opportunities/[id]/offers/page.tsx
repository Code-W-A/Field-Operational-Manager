"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Download, ExternalLink, Save, Send } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Panel } from "@/components/crm"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { getCrmClientById, listCrmClientContacts } from "@/lib/crm/opportunities"
import { issueCrmOffer, listCrmOffers, saveCrmOfferDraft } from "@/lib/crm/offers"
import { formatDateTime } from "@/lib/crm/presenters"
import { getDateValue } from "@/lib/crm/activity"
import { crmStorageProvider } from "@/lib/crm/storage/provider"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"
import { blobToBase64, isValidEmail, normalizeEmail } from "@/lib/work-documents/shared"
import { getCrmFileOpenUrl } from "@/lib/crm/file-preview"
import type { CrmClientContact, CrmOffer } from "@/lib/crm/types"

function createEmptyProduct(): ProductItem {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    um: "buc",
    quantity: 1,
    price: 0,
    total: 0,
  }
}

function parseConditions(value: string) {
  return value
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
}

function formatOfferStatus(offer: CrmOffer) {
  if (offer.status === "SENT" && !offer.actionUsedAt) {
    const expiresAt = getDateValue(offer.actionExpiresAt)
    if (expiresAt && Date.now() > expiresAt.getTime()) {
      return "EXPIRED"
    }
  }
  return offer.status
}

export default function OpportunityOffersPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<CrmOffer[]>([])
  const [clientName, setClientName] = useState("")
  const [contacts, setContacts] = useState<CrmClientContact[]>([])

  const [products, setProducts] = useState<ProductItem[]>([createEmptyProduct()])
  const [vatPercent, setVatPercent] = useState("21")
  const [adjustmentPercent, setAdjustmentPercent] = useState("0")
  const [conditionsInput, setConditionsInput] = useState("Plata: conform contract\nLivrare: conform stoc\nInstalare: conform programare")
  const [comments, setComments] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [editingDraftOfferId, setEditingDraftOfferId] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [issuingOffer, setIssuingOffer] = useState(false)

  const subtotal = useMemo(
    () => products.reduce((sum, row) => sum + (Number(row.total) || Number(row.quantity || 0) * Number(row.price || 0)), 0),
    [products]
  )
  const adjustment = Number(adjustmentPercent.replace(",", ".")) || 0
  const total = subtotal * (1 - adjustment / 100)

  const primaryContact = useMemo(() => {
    if (!opportunity) return null
    return contacts.find((row) => row.id === opportunity.primaryContactId) || contacts.find((row) => Boolean(row.email)) || null
  }, [contacts, opportunity])

  const load = async () => {
    if (!opportunity || !user?.uid) return
    setLoading(true)
    try {
      const [offerRows, contactRows, clientRow] = await Promise.all([
        listCrmOffers(opportunityId),
        listCrmClientContacts(opportunity.clientId),
        getCrmClientById(opportunity.clientId),
      ])
      setOffers(offerRows)
      setContacts(contactRows)
      setClientName(clientRow?.name || "")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  useEffect(() => {
    if (!primaryContact) return
    if (!recipientName) setRecipientName(primaryContact.name || "")
    if (!recipientEmail && primaryContact.email) setRecipientEmail(primaryContact.email)
  }, [primaryContact, recipientEmail, recipientName])

  useEffect(() => {
    if (!opportunity) return
    if (!subject) setSubject(`Ofertă ${opportunity.code}`)
    if (!message) {
      setMessage(
        `Bună ziua,\n\nVă transmitem oferta pentru oportunitatea ${opportunity.code}${clientName ? ` (${clientName})` : ""}.\n\nAșteptăm confirmarea dvs. prin linkurile din email.\n\nMulțumim.`
      )
    }
  }, [clientName, message, opportunity, subject])

  if (!opportunity) {
    return (
      <Panel title="Oferte" size="comfortable" className="[&>header]:hidden xl:[&>header]:block">
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  const buildSnapshot = () => ({
    products: products.map((row) => ({
      id: row.id,
      name: String(row.name || ""),
      um: String(row.um || "buc"),
      quantity: Number(row.quantity || 0),
      price: Number(row.price || 0),
      total: Number(row.total || Number(row.quantity || 0) * Number(row.price || 0)),
    })),
    vatPercent: Number(vatPercent.replace(",", ".")) || 0,
    adjustmentPercent: adjustment,
    conditions: parseConditions(conditionsInput),
    comments: comments.trim(),
    subtotal,
    total,
  })

  const loadOfferInEditor = (offer: CrmOffer) => {
    const snapshot = offer.snapshot
    if (!snapshot) return
    setProducts(
      (snapshot.products || []).length
        ? (snapshot.products as ProductItem[])
        : [createEmptyProduct()]
    )
    setVatPercent(String(snapshot.vatPercent ?? 21))
    setAdjustmentPercent(String(snapshot.adjustmentPercent ?? 0))
    setConditionsInput((snapshot.conditions || []).join("\n"))
    setComments(snapshot.comments || "")
    setRecipientEmail(offer.recipientEmail || "")
    setRecipientName(offer.recipientName || "")
    setSubject(offer.subject || "")
    setMessage(offer.message || "")
    setEditingDraftOfferId(offer.status === "DRAFT" ? offer.id : null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSaveDraft = async () => {
    if (!user?.uid || savingDraft) return
    setSavingDraft(true)
    try {
      const offerId = await saveCrmOfferDraft({
        offerId: editingDraftOfferId || undefined,
        opportunityId,
        snapshot: buildSnapshot(),
        recipientEmail: normalizeEmail(recipientEmail),
        recipientName: recipientName.trim(),
        subject: subject.trim(),
        message: message.trim(),
        actorId: user.uid,
      })
      setEditingDraftOfferId(offerId)
      toast({ title: "Draft salvat", description: "Oferta a fost salvată ca draft." })
      await load()
    } catch (error) {
      toast({
        title: "Nu s-a putut salva draftul",
        description: error instanceof Error ? error.message : "Eroare neașteptată.",
        variant: "destructive",
      })
    } finally {
      setSavingDraft(false)
    }
  }

  const handleIssueOffer = async () => {
    if (!user?.uid || issuingOffer) return
    const email = normalizeEmail(recipientEmail)
    if (!isValidEmail(email)) {
      toast({ title: "Email invalid", description: "Completează un email valid pentru destinatar.", variant: "destructive" })
      return
    }

    setIssuingOffer(true)
    try {
      const snapshot = buildSnapshot()
      const blob = await generateOfferPdf({
        id: opportunity.id,
        numarRaport: opportunity.code,
        offerNumber: Math.max(1, offers.length + 1),
        client: clientName || opportunity.title,
        attentionTo: recipientName || primaryContact?.name || "",
        fromCompany: "NRG Access Systems SRL",
        products: snapshot.products.map((row) => ({
          name: row.name,
          quantity: row.quantity,
          price: row.price,
          um: row.um,
        })),
        offerVAT: snapshot.vatPercent,
        adjustmentPercent: snapshot.adjustmentPercent,
        conditions: snapshot.conditions,
        locationName: opportunity.title,
        preparedBy: userData?.displayName || userData?.email || user.uid,
        preparedAt: new Date().toISOString(),
      })

      const pdfFilename = `crm_oferta_${opportunity.code || opportunity.id}.pdf`
      const file = new File([blob], pdfFilename, { type: "application/pdf" })
      const uploaded = await crmStorageProvider.uploadOpportunityFile({
        opportunityId,
        file,
      })
      const attachmentBase64 = await blobToBase64(blob)

      const issueResult = await issueCrmOffer({
        opportunityId,
        draftOfferId: editingDraftOfferId || undefined,
        recipientEmail: email,
        recipientName: recipientName.trim(),
        subject: subject.trim(),
        message: message.trim(),
        snapshot,
        pdfUrl: uploaded.url,
        pdfStoragePath: uploaded.path,
        pdfFilename: uploaded.filename,
        pdfMime: uploaded.mime,
        pdfSize: uploaded.size,
        attachmentBase64,
      })

      setEditingDraftOfferId(null)
      toast({
        title: "Ofertă emisă",
        description: issueResult.publicUrl
          ? `Oferta a fost trimisă. Link client: ${issueResult.publicUrl}`
          : "Oferta a fost trimisă către contactul selectat.",
      })
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("crm:activity-refresh", { detail: { opportunityId } }))
      }
      await load()
    } catch (error) {
      toast({
        title: "Nu s-a putut emite oferta",
        description: error instanceof Error ? error.message : "Eroare neașteptată.",
        variant: "destructive",
      })
    } finally {
      setIssuingOffer(false)
    }
  }

  return (
    <Panel
      title="Oferte"
      subtitle=""
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nume destinatar" />
            <Input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="Email destinatar" />
          </div>
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subiect email ofertă" />
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mesaj email" className="min-h-[100px]" />
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={vatPercent} onChange={(event) => setVatPercent(event.target.value)} placeholder="TVA (%)" />
            <Input value={adjustmentPercent} onChange={(event) => setAdjustmentPercent(event.target.value)} placeholder="Discount/Ajustare (%)" />
          </div>
          <Textarea
            value={conditionsInput}
            onChange={(event) => setConditionsInput(event.target.value)}
            placeholder="Condiții (câte una pe rând)"
            className="min-h-[80px]"
          />
          <Textarea value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Comentarii ofertă" className="min-h-[80px]" />

          <ProductTableForm products={products} onProductsChange={setProducts} disabled={isTechnician} />

          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            <span>Total fără TVA: <strong>{subtotal.toFixed(2)} lei</strong></span>
            <span>•</span>
            <span>Total ajustat: <strong>{total.toFixed(2)} lei</strong></span>
            {editingDraftOfferId ? <Badge variant="outline">Draft: {editingDraftOfferId}</Badge> : null}
          </div>

          {!isTechnician ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft || issuingOffer}>
                <Save className="mr-1.5 h-4 w-4" />
                {savingDraft ? "Se salvează..." : "Salvează draft"}
              </Button>
              <Button onClick={handleIssueOffer} disabled={issuingOffer || savingDraft}>
                <Send className="mr-1.5 h-4 w-4" />
                {issuingOffer ? "Se emite..." : "Emite ofertă"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Tehnicienii pot doar vizualiza ofertele.</p>
          )}
        </div>

        <div className="mt-4 space-y-2 pb-1">
          <p className="text-sm font-medium text-neutral-700">Istoric oferte</p>
          {loading ? (
            <p className="text-sm text-neutral-500">Se încarcă ofertele...</p>
          ) : offers.length === 0 ? (
            <p className="text-sm text-neutral-500">Nu există oferte salvate.</p>
          ) : (
            offers.map((offer) => {
              const status = formatOfferStatus(offer)
              return (
                <div key={offer.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">V{offer.version}</Badge>
                      <Badge
                        className={
                          status === "ACCEPTED"
                            ? "bg-emerald-600 text-white"
                            : status === "REJECTED"
                              ? "bg-rose-600 text-white"
                              : status === "EXPIRED"
                                ? "bg-amber-600 text-white"
                                : status === "SENT"
                                  ? "bg-blue-600 text-white"
                                  : "bg-neutral-700 text-white"
                        }
                      >
                        {status}
                      </Badge>
                      <span className="text-sm text-neutral-700">{offer.recipientEmail || "-"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {offer.pdfUrl ? (
                        <>
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                            <a href={getCrmFileOpenUrl({ url: offer.pdfUrl, mime: offer.pdfMime || "application/pdf" })} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                            <a href={offer.pdfUrl} target="_blank" rel="noreferrer" download={offer.pdfFilename || `oferta_v${offer.version}.pdf`}>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      ) : null}
                      {offer.status === "DRAFT" ? (
                        <Button size="sm" variant="outline" onClick={() => loadOfferInEditor(offer)}>
                          Încarcă draft
                        </Button>
                      ) : null}
                      {offer.status === "SENT" && offer.actionToken ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/offer/crm/${encodeURIComponent(offer.id)}?t=${encodeURIComponent(offer.actionToken)}&action=accept`} target="_blank" rel="noreferrer">
                            Deschide portal
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {offer.snapshot?.total?.toFixed?.(2) || Number(offer.snapshot?.total || 0).toFixed(2)} lei • {formatDateTime(offer.sentAt || offer.updatedAt || offer.createdAt)}
                  </p>
                  {offer.response?.reason ? <p className="mt-1 text-sm text-neutral-700">Motiv refuz: {offer.response.reason}</p> : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </Panel>
  )
}
