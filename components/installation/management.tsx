"use client";

import { useRef, useState, type ReactNode } from "react";
import { CheckCircle, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLucrareById,
  updateLucrare,
  type Lucrare,
  type ProductItem,
} from "@/lib/firebase/firestore";
import { OfferEditorDialog } from "@/app/dashboard/lucrari/[id]/offer-editor-dialog";
import { DevizEditorDialog } from "@/app/dashboard/lucrari/[id]/deviz-editor-dialog";
import { DocumentUpload } from "@/components/document-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { InstallationHeaderAction } from "./header-action";
import { installationPickupReason } from "@/lib/installations/pickup";
import { installationApi, installationRequest } from "@/lib/installations/client";
import type { InstallationListResponse } from "@/types/installation";

function editorProducts(
  products: (ProductItem & { id?: string; total?: number })[] = [],
) {
  return products.map((product, index) => ({
    ...product,
    id: product.id || `product-${index}`,
    total: product.total ?? product.quantity * product.price,
  }));
}

type InstallationManagementSlots = {
  pickupAction?: (blockedReason?: string, currentWork?: InstallationListResponse["work"]) => ReactNode;
  busy: boolean;
  version: number;
  clientControls: ReactNode;
  documents: ReactNode;
};

export function InstallationManagement({
  work,
  onUpdate,
  children,
}: {
  work: Lucrare;
  onUpdate: (work: Lucrare) => void;
  children: (slots: InstallationManagementSlots) => ReactNode;
}) {
  const { userData } = useAuth();
  const [busy, setBusy] = useState("");
  const [version, setVersion] = useState(0);
  const pending = useRef(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [devizOpen, setDevizOpen] = useState(false);
  const manager = userData?.role === "admin" || userData?.role === "dispecer";
  if (!manager)
    return (
      <>
        {children({
          busy: false,
          version: 0,
          clientControls: null,
          documents: null,
        })}
      </>
    );

  const inactive = Boolean(
    work.anulat ||
    work.archivedAt ||
    ["Arhivată", "Anulat", "Anulată"].includes(work.statusLucrare),
  );
  const offerSent = Number(work.offerSendCount || 0) > 0;

  async function refresh() {
    const fresh = await getLucrareById(work.id!, { serverOnly: true });
    if (!fresh) throw new Error("Tichetul nu mai este disponibil.");
    onUpdate(fresh);
    setVersion((value) => value + 1);
  }
  async function save(action: string, patch: Partial<Lucrare>, expectedAssignmentVersion?: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    try {
      if (action === "pickup") {
        await installationRequest(installationApi(work.id!), {
          action: "manage", work: patch, expectedAssignmentVersion,
        });
      } else {
        await updateLucrare(work.id!, patch);
      }
      await refresh();
    } catch (error) {
      toast({
        title: "Eroare",
        description:
          error instanceof Error
            ? error.message
            : "Nu s-a putut salva modificarea.",
        variant: "destructive",
      });
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  async function refreshAfterAction() {
    try {
      await refresh();
    } catch {
      toast({
        title: "Eroare",
        description: "Nu am putut reîncărca tichetul. Reîncarcă pagina.",
        variant: "destructive",
      });
    }
  }

  const pickupAction = (blockedReason?: string, currentWork: InstallationListResponse["work"] | Lucrare = work) => {
    const reason =
      blockedReason ||
      (busy
        ? "O operație este în curs. Așteaptă finalizarea."
        : installationPickupReason(currentWork));
    const showPickup = !work.preluatDispecer || Boolean(currentWork.tehnicieni?.length);
    return showPickup && !inactive ? (
      <InstallationHeaderAction label="Preia tichetul" reason={reason}>
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700"
          disabled={Boolean(reason)}
          onClick={() => void save("pickup", { preluatDispecer: true }, currentWork.installation?.assignmentVersion || 0)}
        >
          {busy === "pickup" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Preia tichetul
        </Button>
      </InstallationHeaderAction>
    ) : null;
  };

  const clientControls = !inactive ? (
    <section className="min-w-0 space-y-4" aria-label="Ofertare și deviz">
      <h3 className="font-semibold">Ofertare și deviz</h3>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="installation-needs-offer"
              checked={Boolean(work.necesitaOferta)}
              disabled={
                Boolean(busy) || (offerSent && Boolean(work.necesitaOferta))
              }
              onCheckedChange={(checked) =>
                void save("offer", {
                  necesitaOferta: checked,
                  ...(!checked ? { comentariiOferta: "" } : {}),
                })
              }
            />
            <Label htmlFor="installation-needs-offer">Necesită ofertă</Label>
          </div>
          <Button
            variant="outline"
            disabled={!work.necesitaOferta || Boolean(busy)}
            onClick={() => setOfferOpen(true)}
          >
            <FileText className="mr-2 h-4 w-4" /> Editor ofertă
          </Button>
          <Button
            variant="outline"
            disabled={!work.preluatDispecer || Boolean(busy)}
            onClick={() => setDevizOpen(true)}
          >
            <FileText className="mr-2 h-4 w-4" /> Editor deviz
          </Button>
        </div>
        {offerSent && (
          <p className="text-sm text-muted-foreground">
            Oferta a fost transmisă; necesitatea ofertei nu mai poate fi
            dezactivată.
          </p>
        )}
        {!work.preluatDispecer && (
          <p className="text-sm text-muted-foreground">
            Oferta poate fi pregătită înainte de preluare. Devizul și facturarea
            sunt disponibile după preluare.
          </p>
        )}
        {work.necesitaOferta && (
          <div className="space-y-2">
            <Label htmlFor="installation-offer-comments">
              Comentarii ofertă
            </Label>
            <Textarea
              id="installation-offer-comments"
              key={work.comentariiOferta || ""}
              defaultValue={work.comentariiOferta || ""}
              disabled={Boolean(busy)}
              onBlur={(event) => {
                if (event.target.value !== (work.comentariiOferta || ""))
                  void save("comments", {
                    comentariiOferta: event.target.value,
                  });
              }}
            />
          </div>
        )}
        {work.offerResponse?.reason && (
          <p className="text-sm">Răspuns client: {work.offerResponse.reason}</p>
        )}
      </div>
    </section>
  ) : null;

  return (
    <>
      {children({
        pickupAction,
        busy: Boolean(busy),
        version,
        clientControls,
        documents: (
          <DocumentUpload
            lucrareId={work.id!}
            lucrare={work}
            onLucrareUpdate={() => void refreshAfterAction()}
            hideOfertaUpload
            hideReportActions
          />
        ),
      })}
      {!inactive && (
        <>
          <OfferEditorDialog
            lucrareId={work.id!}
            open={offerOpen}
            onOpenChange={(open) => {
              setOfferOpen(open);
              if (!open) void refreshAfterAction();
            }}
            initialProducts={editorProducts(work.products)}
            presetLocationLabel={work.locatie}
          />
          {work.preluatDispecer && (
            <DevizEditorDialog
              lucrareId={work.id!}
              open={devizOpen}
              onOpenChange={(open) => {
                setDevizOpen(open);
                if (!open) void refreshAfterAction();
              }}
              initialProducts={editorProducts(work.devizProducts)}
              presetLocationLabel={work.locatie}
            />
          )}
        </>
      )}
    </>
  );
}
