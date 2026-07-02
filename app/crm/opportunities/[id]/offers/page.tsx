"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, Download, ExternalLink, FileCheck2, Mail, Save, Send, TableProperties } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Panel } from "@/components/crm"
import { OfferEvidencePanel } from "@/components/offer/offer-evidence-panel"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { resolveClientContactsForOpportunity } from "@/lib/crm/opportunity-contacts"
import { getCrmClientById, listCrmClientContacts } from "@/lib/crm/opportunities"
import { issueCrmOffer, listCrmOffers, saveCrmOfferDraft } from "@/lib/crm/offers"
import { isTerminalPipelineStageForOpportunityType } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import { getDateValue } from "@/lib/crm/activity"
import { crmStorageProvider } from "@/lib/crm/storage/provider"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"
import { blobToBase64, isValidEmail, normalizeEmail } from "@/lib/work-documents/shared"
import { getCrmFileOpenUrl } from "@/lib/crm/file-preview"
import type { CrmClient, CrmClientContact, CrmOffer } from "@/lib/crm/types"

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
  const { opportunity, loading: opportunityLoading } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<CrmOffer[]>([])
  const [clientName, setClientName] = useState("")
  const [crmClient, setCrmClient] = useState<CrmClient | null>(null)
  const [contacts, setContacts] = useState<CrmClientContact[]>([])
  const [offerEditorOpen, setOfferEditorOpen] = useState(false)
  const [dossierOfferId, setDossierOfferId] = useState<string | null>(null)

  const [products, setProducts] = useState<ProductItem[]>([createEmptyProduct()])
  const [vatPercent, setVatPercent] = useState("21")
  const [adjustmentPercent, setAdjustmentPercent] = useState("0")
  const [conditionsInput, setConditionsInput] = useState("Plata: conform contract\nLivrare: conform stoc\nInstalare: conform programare")
  const [comments, setComments] = useState("")
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

  /** Same resolution as opportunity layout Context CRM rail (all client contacts + primary). */
  const primaryContact = useMemo(
    () => resolveClientContactsForOpportunity(contacts, opportunity ?? null).primary,
    [contacts, opportunity]
  )

  const primaryRecipientEmail = useMemo(() => {
    if (!primaryContact?.email) return ""
    return normalizeEmail(primaryContact.email)
  }, [primaryContact])

  const primaryRecipientName = primaryContact?.name?.trim() || ""

  const isTerminalStage = useMemo(
    () =>
      opportunity ? isTerminalPipelineStageForOpportunityType(opportunity.opportunityType, opportunity.pipelineStage) : false,
    [opportunity]
  )

  const editorUnavailable = isTechnician || isTerminalStage
  const canOpenEditor = !editorUnavailable && Boolean(primaryContact?.email && isValidEmail(primaryRecipientEmail))

  const load = async () => {
    if (!opportunity || !user?.uid) return
    const clientId = String(opportunity.clientId || "").trim()
    if (!clientId) {
      setOffers([])
      setContacts([])
      setClientName("")
      setCrmClient(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // Contacts + client must not be blocked if listCrmOffers (API) fails
      const [contactRows, clientRow] = await Promise.all([listCrmClientContacts(clientId), getCrmClientById(clientId)])
      setContacts(contactRows)
      setCrmClient(clientRow ?? null)
      setClientName(clientRow?.name || "")
    } catch (error) {
      console.error("[CRM Offers] Failed to load contacts", error)
      setCrmClient(null)
      setClientName("")
      toast({
        title: "Contacte indisponibile",
        description: error instanceof Error ? error.message : "Nu s-au putut încărca contactele clientului.",
        variant: "destructive",
      })
    }
    try {
      const offerRows = await listCrmOffers(opportunityId)
      setOffers(offerRows)
    } catch (error) {
      console.error("[CRM Offers] Failed to load offer list", error)
      setOffers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, opportunity?.clientId, user?.uid])

  useEffect(() => {
    if (!opportunity) return
    if (!subject) setSubject(`Ofertă ${opportunity.code}`)
    if (!message) {
      setMessage(
        `Bună ziua,\n\nVă transmitem oferta comercială pentru oportunitatea ${opportunity.code}${clientName ? ` — ${clientName}` : ""}.\n\nPuteți accepta sau refuza oferta din acest email, folosind butoanele incluse în mesaj.\n\nCu stimă,`
      )
    }
  }, [clientName, message, opportunity, subject])

  if (opportunityLoading) {
    return (
      <Panel title="Oferte" size="comfortable" className="[&>header]:hidden xl:[&>header]:block">
        <p className="text-sm text-neutral-500">Se încarcă oportunitatea…</p>
      </Panel>
    )
  }

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
    setSubject(offer.subject || "")
    setMessage(offer.message || "")
    setEditingDraftOfferId(offer.status === "DRAFT" ? offer.id : null)
    setOfferEditorOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const openEditorClick = () => {
    if (editorUnavailable) {
      toast({
        title: "Editor indisponibil",
        description: isTechnician
          ? "Nu aveți drepturi de editare pentru oferte."
          : "Oportunitatea este în stadiu final; oferta nu mai poate fi editată aici.",
        variant: "destructive",
      })
      return
    }
    if (!primaryRecipientEmail || !isValidEmail(primaryRecipientEmail)) {
      toast({
        title: "Contact principal incomplet",
        description: "Contactul principal trebuie să aibă email setat. Îl puteți seta din antetul paginii oportunității.",
        variant: "destructive",
      })
      return
    }
    setOfferEditorOpen(true)
  }

  const handleSaveDraft = async () => {
    if (!user?.uid || savingDraft) return
    if (!primaryRecipientEmail || !isValidEmail(primaryRecipientEmail)) {
      toast({
        title: "Nu se poate salva",
        description: "Contactul principal trebuie să aibă email valid în CRM.",
        variant: "destructive",
      })
      return
    }
    setSavingDraft(true)
    try {
      const offerId = await saveCrmOfferDraft({
        offerId: editingDraftOfferId || undefined,
        opportunityId,
        snapshot: buildSnapshot(),
        recipientEmail: primaryRecipientEmail,
        recipientName: primaryRecipientName,
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
    const email = primaryRecipientEmail
    if (!isValidEmail(email)) {
      toast({
        title: "Email invalid",
        description: "Contactul principal trebuie să aibă email setat în CRM.",
        variant: "destructive",
      })
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
        attentionTo: primaryRecipientName,
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
        locationName: opportunity.displayTitle || opportunity.title,
        preparedBy: userData?.displayName || userData?.email || user.uid,
        preparedAt: new Date().toISOString(),
        beneficiar: {
          name: (crmClient?.name || clientName || opportunity.title).trim() || opportunity.title,
          cui: crmClient?.cui,
          address: crmClient?.address || "",
        },
      })

      const pdfFilename = `crm_oferta_${opportunity.code || opportunity.id}.pdf`
      const file = new File([blob], pdfFilename, { type: "application/pdf" })
      const uploaded = await crmStorageProvider.uploadOpportunityFile({
        opportunityId,
        file,
      })
      const attachmentBase64 = await blobToBase64(blob)

      await issueCrmOffer({
        opportunityId,
        draftOfferId: editingDraftOfferId || undefined,
        recipientEmail: email,
        recipientName: primaryRecipientName,
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
      setOfferEditorOpen(false)
      toast({
        title: "Ofertă emisă",
        description: "Oferta a fost trimisă pe email către contactul principal.",
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

  const offerEditorGrid = (
    <div className="grid min-h-0 min-w-0 grid-cols-1 gap-6 pb-1 lg:grid-cols-2 lg:items-start">
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="space-y-1 border-b border-neutral-100 bg-neutral-50/80 pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <TableProperties className="h-4 w-4" />
              </span>
              Poziții și costuri
            </CardTitle>
            <CardDescription>Completați denumirile pe mai multe rânduri dacă e nevoie; tabelul poate fi derulat orizontal pe ecrane înguste.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <ProductTableForm
              products={products}
              onProductsChange={setProducts}
              disabled={false}
              showTitle={false}
              tableScrollClassName="max-h-[min(52vh,440px)]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-200 bg-neutral-50/90 px-3 py-2.5 text-sm text-neutral-700">
              <span>
                Total fără TVA: <strong className="tabular-nums text-neutral-900">{subtotal.toFixed(2)} lei</strong>
              </span>
              <span className="hidden sm:inline text-neutral-300">|</span>
              <span>
                Total ajustat: <strong className="tabular-nums text-neutral-900">{total.toFixed(2)} lei</strong>
              </span>
              {editingDraftOfferId ? (
                <Badge variant="outline" className="ml-auto">
                  Draft: {editingDraftOfferId}
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="space-y-1 border-b border-neutral-100 bg-neutral-50/80 pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Mail className="h-4 w-4" />
              </span>
              Email și condiții
            </CardTitle>
            <CardDescription>Mesajul trimis clientului împreună cu PDF-ul ofertei.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5">
            <div className="grid gap-2">
              <Label htmlFor="offer-email-subject" className="text-sm font-medium text-neutral-800">
                Subiect
              </Label>
              <Input
                id="offer-email-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ex.: Ofertă OP.25"
                className="h-10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-email-body" className="text-sm font-medium text-neutral-800">
                Mesaj
              </Label>
              <Textarea
                id="offer-email-body"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Textul din corpul emailului…"
                className="min-h-[140px] resize-y text-sm leading-relaxed"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="offer-vat" className="text-sm font-medium text-neutral-800">
                  TVA (%)
                </Label>
                <Input
                  id="offer-vat"
                  value={vatPercent}
                  onChange={(event) => setVatPercent(event.target.value)}
                  placeholder="21"
                  className="h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="offer-adjustment" className="text-sm font-medium text-neutral-800">
                  Discount / ajustare (%)
                </Label>
                <Input
                  id="offer-adjustment"
                  value={adjustmentPercent}
                  onChange={(event) => setAdjustmentPercent(event.target.value)}
                  placeholder="0"
                  className="h-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-conditions" className="text-sm font-medium text-neutral-800">
                Condiții comerciale
              </Label>
              <Textarea
                id="offer-conditions"
                value={conditionsInput}
                onChange={(event) => setConditionsInput(event.target.value)}
                placeholder="Câte o condiție pe rând (apar în ofertă)"
                className="min-h-[100px] resize-y text-sm leading-relaxed"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-comments" className="text-sm font-medium text-neutral-800">
                Comentarii interne (ofertă)
              </Label>
              <Textarea
                id="offer-comments"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Opțional, vizibil în fluxul ofertei"
                className="min-h-[88px] resize-y text-sm leading-relaxed"
              />
            </div>
          </CardContent>
        </Card>
    </div>
  )

  const offerEditorFooter = (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
      <Button
        variant="outline"
        onClick={handleSaveDraft}
        disabled={savingDraft || issuingOffer}
        className="h-10 w-full min-w-0 sm:w-auto"
      >
        <Save className="mr-1.5 h-4 w-4 shrink-0" />
        {savingDraft ? "Se salvează..." : "Salvează draft"}
      </Button>
      <Button onClick={handleIssueOffer} disabled={issuingOffer || savingDraft} className="h-10 w-full min-w-0 sm:w-auto">
        <Send className="mr-1.5 h-4 w-4 shrink-0" />
        {issuingOffer ? "Se emite..." : "Emite ofertă"}
      </Button>
    </div>
  )

  return (
    <Panel
      title="Oferte"
      subtitle=""
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-4 border rounded-md bg-blue-50 border-blue-200 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">O</span>
              </div>
              <h4 className="text-base font-semibold text-blue-900">Ofertare</h4>
            </div>
          </div>

          {editorUnavailable && (
            <div className="flex items-start gap-3 text-sm bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 shadow-sm mb-4">
              <div className="flex-shrink-0">
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-900">Editor indisponibil</p>
                <p className="text-amber-700 mt-1">
                  {isTechnician
                    ? "Nu aveți drepturi de editare pentru oferte."
                    : "Oportunitatea este în stadiu final; oferta nu mai poate fi editată aici."}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap gap-8">
              <div className="space-y-2 min-w-[200px]">
                <Label className={`text-sm font-medium ${!primaryContact ? "text-gray-500" : "text-blue-800"}`}>Contact principal</Label>
                <div className="text-sm text-neutral-800 rounded-md border border-blue-200 bg-white/80 px-3 py-2">
                  {loading ? (
                    <p className="text-neutral-500">Se încarcă contactele…</p>
                  ) : primaryContact ? (
                    <>
                      <p className="font-medium">{primaryRecipientName || "—"}</p>
                      <p className="text-neutral-600">{primaryRecipientEmail || "Fără email"}</p>
                    </>
                  ) : (
                    <p className="text-neutral-500">Niciun contact asociat clientului.</p>
                  )}
                </div>
                {!loading && !primaryRecipientEmail && primaryContact && (
                  <p className="text-xs text-amber-800">Adăugați email la contact sau alegeți un alt contact principal din antetul oportunității.</p>
                )}
                {!loading && !primaryContact && (
                  <p className="text-xs text-neutral-600">
                    Asociați contacte clientului și setați contactul principal din{" "}
                    <Link href={`/crm/opportunities/${opportunityId}/timeline`} className="text-blue-700 underline underline-offset-2">
                      pagina oportunității
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className={`text-sm font-medium ${!canOpenEditor ? "text-gray-500" : "text-blue-800"}`}>Editor ofertă</Label>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditorClick}
                    disabled={!canOpenEditor}
                    className={
                      !canOpenEditor
                        ? "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-100 hover:text-gray-500 cursor-not-allowed"
                        : ""
                    }
                  >
                    Deschide editor
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={offerEditorOpen} onOpenChange={setOfferEditorOpen}>
          <DialogContent className="flex max-h-[92vh] w-[min(100%,96vw)] max-w-6xl min-h-0 flex-col gap-0 overflow-hidden p-0 xl:max-w-7xl">
            <DialogHeader className="min-w-0 shrink-0 space-y-2 border-b border-neutral-200/80 bg-neutral-50/50 px-5 py-4 text-left pr-10 sm:px-7 sm:py-5 sm:pr-12">
              <DialogTitle className="text-xl font-semibold tracking-tight text-neutral-900">Editor ofertă</DialogTitle>
              <p className="min-w-0 break-words text-sm leading-relaxed text-neutral-600">
                Destinatar:{" "}
                <span className="font-medium text-neutral-900">{primaryRecipientName || "—"}</span>{" "}
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
                  {primaryRecipientEmail || "—"}
                </span>
              </p>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-7 sm:py-5">
              {offerEditorGrid}
            </div>
            <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/90 px-5 py-3 sm:px-7 sm:py-4">
              {offerEditorFooter}
            </div>
          </DialogContent>
        </Dialog>

        {offers.some((offer) => offer.status !== "DRAFT") ? (
          <OfferEvidencePanel mode="crm-opportunity" entityId={opportunityId} className="mb-4" />
        ) : null}

        <Dialog open={Boolean(dossierOfferId)} onOpenChange={(open) => !open && setDossierOfferId(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dosar ofertă</DialogTitle>
            </DialogHeader>
            {dossierOfferId ? (
              <OfferEvidencePanel mode="crm-offer" entityId={dossierOfferId} title={`Dosar ofertă #${dossierOfferId.slice(0, 8)}`} />
            ) : null}
          </DialogContent>
        </Dialog>

        <div className="p-3 border rounded-md bg-white mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-neutral-900">Istoric oferte</p>
            {isTechnician ? (
              <Badge variant="outline" className="rounded-md">
                Read-only
              </Badge>
            ) : null}
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">Se încarcă ofertele...</p>
          ) : offers.length === 0 ? (
            <p className="text-sm text-neutral-500">Nu există oferte salvate.</p>
          ) : (
            <div className="space-y-2">
              {offers.map((offer) => {
                const status = formatOfferStatus(offer)
                return (
                  <div key={offer.id} className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
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
                        {offer.responseCertifiedPdf?.storagePath ? (
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-emerald-700">
                            <a
                              href={`/api/crm/offers/${encodeURIComponent(offer.id)}/certified-pdf`}
                              target="_blank"
                              rel="noreferrer"
                              title="PDF dovadă"
                            >
                              <FileCheck2 className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                        {offer.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => loadOfferInEditor(offer)}
                            disabled={editorUnavailable}
                            className={editorUnavailable ? "cursor-not-allowed opacity-60" : ""}
                          >
                            Încarcă draft
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setDossierOfferId(offer.id)}>
                            Dosar
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {offer.snapshot?.total?.toFixed?.(2) || Number(offer.snapshot?.total || 0).toFixed(2)} lei • {formatDateTime(offer.sentAt || offer.updatedAt || offer.createdAt)}
                    </p>
                    {offer.response?.reason ? <p className="mt-1 text-sm text-neutral-700">Motiv refuz: {offer.response.reason}</p> : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
