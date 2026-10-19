"use client"

import { useRef, useState } from "react"
import { CheckCircle, FileText, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { getLucrareById, updateLucrare, type Lucrare, type ProductItem } from "@/lib/firebase/firestore"
import { OfferEditorDialog } from "@/app/dashboard/lucrari/[id]/offer-editor-dialog"
import { DevizEditorDialog } from "@/app/dashboard/lucrari/[id]/deviz-editor-dialog"
import { DocumentUpload } from "@/components/document-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

function editorProducts(products: (ProductItem & { id?: string; total?: number })[] = []) {
  return products.map((product, index) => ({ ...product, id: product.id || `product-${index}`, total: product.total ?? product.quantity * product.price }))
}

export function InstallationManagement({ work, onUpdate }: { work: Lucrare; onUpdate: (work: Lucrare) => void }) {
  const { userData } = useAuth()
  const [busy, setBusy] = useState("")
  const pending = useRef(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [devizOpen, setDevizOpen] = useState(false)
  const manager = userData?.role === "admin" || userData?.role === "dispecer"
  if (!manager) return null

  const completed = work.statusLucrare === "Finalizat" && work.installation?.closedReason === "completed"
  const inactive = Boolean(work.anulat || work.archivedAt || ["Arhivată", "Anulat", "Anulată"].includes(work.statusLucrare))
  const offerSent = Number(work.offerSendCount || 0) > 0
  const response = work.offerResponse?.status
  const offerStatus = response === "accept" ? "Acceptată" : response === "reject" ? "Refuzată" : work.statusOferta || (work.necesitaOferta ? "De pregătit" : "Nu necesită ofertă")

  async function refresh() {
    const fresh = await getLucrareById(work.id!, { serverOnly: true })
    if (!fresh) throw new Error("Tichetul nu mai este disponibil.")
    onUpdate(fresh)
  }
  async function save(action: string, patch: Partial<Lucrare>) {
    if (pending.current) return
    pending.current = true
    setBusy(action)
    try {
      await updateLucrare(work.id!, patch)
      await refresh()
    } catch (error) {
      toast({ title: "Eroare", description: error instanceof Error ? error.message : "Nu s-a putut salva modificarea.", variant: "destructive" })
    } finally {
      pending.current = false
      setBusy("")
    }
  }
  async function refreshAfterAction() {
    try { await refresh() }
    catch { toast({ title: "Eroare", description: "Nu am putut reîncărca tichetul. Reîncarcă pagina.", variant: "destructive" }) }
  }

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>Preluare, ofertare și facturare</CardTitle>
        <CardDescription>Gestionează pașii comerciali ai tichetului de instalare.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Preluare dispecer</p>
            <Badge variant="outline">{work.preluatDispecer ? `Preluat de ${work.preluatDe || "Dispecer"}` : "Nepreluat"}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ofertare</p>
            <Badge variant="outline">{offerStatus}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Facturare</p>
            <Badge variant="outline">{work.statusFacturare || "Nefacturat"}</Badge>
          </div>
        </div>

        {!work.preluatDispecer && !inactive && (
          <div className="space-y-2">
            <Button disabled={!completed || Boolean(busy)} onClick={() => void save("pickup", { preluatDispecer: true })}>
              {busy === "pickup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Preia tichetul
            </Button>
            {!completed && <p className="text-sm text-muted-foreground">Preluarea devine disponibilă după semnarea procesului-verbal de terminare a instalării.</p>}
          </div>
        )}

        {!inactive && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="installation-needs-offer" checked={Boolean(work.necesitaOferta)} disabled={Boolean(busy) || (offerSent && Boolean(work.necesitaOferta))}
                  onCheckedChange={checked => void save("offer", { necesitaOferta: checked, ...(!checked ? { comentariiOferta: "" } : {}) })} />
                <Label htmlFor="installation-needs-offer">Necesită ofertă</Label>
              </div>
              <Button variant="outline" disabled={!work.necesitaOferta || Boolean(busy)} onClick={() => setOfferOpen(true)}>
                <FileText className="mr-2 h-4 w-4" /> Editor ofertă
              </Button>
              <Button variant="outline" disabled={!work.preluatDispecer || Boolean(busy)} onClick={() => setDevizOpen(true)}>
                <FileText className="mr-2 h-4 w-4" /> Editor deviz
              </Button>
            </div>
            {offerSent && <p className="text-sm text-muted-foreground">Oferta a fost transmisă; necesitatea ofertei nu mai poate fi dezactivată.</p>}
            {!work.preluatDispecer && <p className="text-sm text-muted-foreground">Oferta poate fi pregătită înainte de preluare. Devizul și facturarea sunt disponibile după preluare.</p>}
            {work.necesitaOferta && (
              <div className="space-y-2">
                <Label htmlFor="installation-offer-comments">Comentarii ofertă</Label>
                <Textarea id="installation-offer-comments" key={work.comentariiOferta || ""} defaultValue={work.comentariiOferta || ""} disabled={Boolean(busy)}
                  onBlur={event => { if (event.target.value !== (work.comentariiOferta || "")) void save("comments", { comentariiOferta: event.target.value }) }} />
              </div>
            )}
            {work.offerResponse?.reason && <p className="text-sm">Răspuns client: {work.offerResponse.reason}</p>}
          </div>
        )}

        <DocumentUpload lucrareId={work.id!} lucrare={work} onLucrareUpdate={() => void refreshAfterAction()} hideOfertaUpload hideReportActions />

        {!inactive && (
          <>
            <OfferEditorDialog lucrareId={work.id!} open={offerOpen} onOpenChange={open => { setOfferOpen(open); if (!open) void refreshAfterAction() }}
              initialProducts={editorProducts(work.products)} presetLocationLabel={work.locatie} />
            {work.preluatDispecer && <DevizEditorDialog lucrareId={work.id!} open={devizOpen} onOpenChange={open => { setDevizOpen(open); if (!open) void refreshAfterAction() }}
              initialProducts={editorProducts(work.devizProducts)} presetLocationLabel={work.locatie} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}
