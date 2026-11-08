import { createCommercialService } from "./commercial.server";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { randomUUID } from "node:crypto";
import { createSagaCatalogService } from "@/lib/saga/catalog.server";
import type { InvoiceLine } from "./draft";
import type { Firestore } from "firebase-admin/firestore";
import {
  calculateInvoiceTotals,
  invoiceContent,
  InvoiceDraftError,
  invoiceEditReason,
  parseInvoiceContent,
  prepareInvoiceDraft,
  type InvoiceDraft,
  type InvoiceDraftResponse,
} from "./draft";
import { normalizeVatPercent } from "@/lib/settings/offer-vat";

export type InvoiceActor = { uid: string; role: string };
export function createInvoiceDraftService(
  db: Firestore,
  now = () => new Date(),
  catalog = createSagaCatalogService(db, async () => {
    throw new Error("Catalog resolution does not call SAGA");
  }),
  config: () => SagaConfig = sagaConfig,
) {
  const commercial = createCommercialService(db, config, now);
  const workRef = (id: string) => {
    if (!id || id.includes("/") || id.length > 200)
      throw new InvoiceDraftError("Tichet invalid.");
    return db.collection("lucrari").doc(id);
  };
  async function actorProfile(actor: InvoiceActor) {
    if (!actor?.uid || !["admin", "dispecer"].includes(actor.role))
      throw new InvoiceDraftError("Nu ai acces la facturare.", 403);
    const user = (await db.collection("users").doc(actor.uid).get()).data();
    if (!user || user.disabled === true || user.role !== actor.role)
      throw new InvoiceDraftError("Nu ai acces la facturare.", 403);
    return user;
  }
  async function seed(id: string, work: Record<string, any>) {
    const clientId = String(work.clientId || work.clientInfo?.id || "").trim();
    const matches = clientId
      ? [await db.collection("clienti").doc(clientId).get()]
      : work.client
        ? (
            await db
              .collection("clienti")
              .where("nume", "==", work.client)
              .limit(2)
              .get()
          ).docs
        : [];
    const client =
      matches.length === 1 && matches[0].exists
        ? { ...matches[0].data(), id: matches[0].id }
        : null;
    const setting = (
      await db
        .collection("predefinedSettings")
        .doc("offers_default_vat_percent")
        .get()
    ).data();
    const fallbackVat = normalizeVatPercent(setting?.value);
    return prepareInvoiceDraft(
      id,
      work,
      client,
      fallbackVat,
      client
        ? []
        : [
            "Clientul lipsește sau este ambiguu. Verifică datele beneficiarului; nu s-a făcut o asociere automată.",
          ],
      now(),
    );
  }
  async function get(
    id: string,
    actor: InvoiceActor,
    refreshSource = false,
  ): Promise<InvoiceDraftResponse> {
    const ref = workRef(id);
    await actorProfile(actor);
    const [w, d, preparedDocument] = await Promise.all([
      ref.get(),
      db.collection("invoiceDrafts").doc(id).get(),
      db.collection("invoices").doc(id).get(),
    ]);
    if (!w.exists) throw new InvoiceDraftError("Tichetul nu mai există.", 404);
    const policy = await commercial.policyIn();
    const reason = preparedDocument.exists
      ? "Documentul XML este pregătit în FOM. Ciorna poate fi doar consultată."
      : invoiceEditReason(w.data()!);
    if (d.exists && !refreshSource)
      return {
        commercialPolicy: policy.enabled,
        draft: d.data() as InvoiceDraft,
        saved: true,
        canEdit: !reason,
        reason,
      };
    if (reason)
      return {
        commercialPolicy: policy.enabled,
        draft: d.exists ? (d.data() as InvoiceDraft) : null,
        saved: d.exists,
        canEdit: false,
        reason,
      };
    let draft = await seed(id, w.data()!);
    if ((await commercial.policyIn()).enabled) {
      const proposal = await db.runTransaction((tx) =>
        commercial.proposeIn(tx, actor, w.data()!, {
          ...invoiceContent(draft),
          discountPercent: !d.exists ? "0" : draft.discountPercent,
        }),
      );
      draft = {
        ...draft,
        ...proposal.content,
        schemaVersion: 2,
        totals: calculateInvoiceTotals(proposal.content),
      };
    }
    draft.revision = d.exists ? d.data()!.revision : 0;
    return {
      draft,
      saved: d.exists,
      canEdit: true,
      reason: "",
      commercialPolicy: policy.enabled,
    };
  }
  async function put(
    id: string,
    input: unknown,
    actor: InvoiceActor,
  ): Promise<InvoiceDraftResponse> {
    const ref = workRef(id);
    await actorProfile(actor);
    const body = input as {
      expectedRevision?: unknown;
      content?: unknown;
      refreshSource?: unknown;
      commercialHash?: string;
      approveDiscount?: boolean;
    } | null;
    if (
      !body ||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 0 ||
      (body.refreshSource !== undefined &&
        typeof body.refreshSource !== "boolean")
    )
      throw new InvoiceDraftError("Revizia ciornei nu este validă.");
    let content = parseInvoiceContent(body.content);
    // Source data is read on the server, never trusted from the submitted JSON.
    const prepared = await get(id, actor, true);
    return db.runTransaction(async (tx) => {
      const draftRef = db.collection("invoiceDrafts").doc(id);
      const [w, d, u, frozen] = await Promise.all([
        tx.get(ref),
        tx.get(draftRef),
        tx.get(db.collection("users").doc(actor.uid)),
        tx.get(db.collection("invoices").doc(id)),
      ]);
      if (
        !u.exists ||
        u.data()!.disabled === true ||
        u.data()!.role !== actor.role
      )
        throw new InvoiceDraftError("Nu ai acces la facturare.", 403);
      if (!w.exists)
        throw new InvoiceDraftError("Tichetul nu mai există.", 404);
      const reason = frozen.exists
        ? "Documentul XML este pregătit în FOM. Ciorna poate fi doar consultată."
        : invoiceEditReason(w.data()!);
      if (reason) throw new InvoiceDraftError(reason, 409, "DRAFT_READ_ONLY");
      const previous = d.exists ? (d.data() as InvoiceDraft) : null;
      if ((previous?.revision || 0) !== body.expectedRevision)
        throw new InvoiceDraftError(
          "Ciorna a fost salvată de alt operator. Compară versiunea salvată înainte de a continua.",
          409,
          "REVISION_CONFLICT",
        );
      const source =
        !previous || body.refreshSource ? prepared.draft! : previous;
      if (!source)
        throw new InvoiceDraftError(
          "Datele sursă nu mai sunt disponibile.",
          409,
        );
      if (
        !previous &&
        !content.commercial &&
        (await commercial.policyIn(tx)).enabled
      )
        throw new InvoiceDraftError(
          "Aplică regulile SAGA pentru ciorna nouă.",
          409,
          "COMMERCIAL_REQUIRED",
        );
      if (previous?.commercial && !content.commercial)
        throw new InvoiceDraftError(
          "Nu poți reveni la regulile comerciale vechi.",
          409,
        );
      if (
        content.commercial &&
        previous &&
        !previous.commercial &&
        !body.commercialHash
      )
        throw new InvoiceDraftError(
          "Previzualizează și confirmă aplicarea regulilor SAGA.",
          409,
        );
      if (content.commercial && body.commercialHash) {
        const preview = await commercial.proposeIn(
          tx,
          actor,
          w.data()!,
          content,
        );
        if (preview.confirmationHash !== body.commercialHash)
          throw new InvoiceDraftError(
            "Previzualizarea comercială s-a modificat.",
            409,
            "COMMERCIAL_CONFLICT",
          );
      }
      content = await commercial.validateIn(
        tx,
        actor,
        w.data()!,
        content,
        previous,
        false,
        body.approveDiscount === true,
      );
      const at = now().toISOString();
      const lines: InvoiceLine[] = [];
      for (const line of content.lines) {
        lines.push(
          line.saga
            ? { ...line, saga: await catalog.resolve(tx, line.saga) }
            : line,
        );
      }
      // Only the validated content may opt into the commercial schema.
      const {
        commercial: _sourceCommercial,
        extraInfo: _sourceInfo,
        ...baseSource
      } = source;
      const draft: InvoiceDraft = {
        ...baseSource,
        ...content,
        lines,
        workId: id,
        schemaVersion: content.commercial ? 2 : 1,
        revision: (previous?.revision || 0) + 1,
        totals: calculateInvoiceTotals(content),
        createdAt: previous?.createdAt || at,
        updatedAt: at,
        updatedBy: { uid: actor.uid, name: u.data()!.displayName || actor.uid },
      };
      const commercialPolicy = (await commercial.policyIn(tx)).enabled;
      tx.set(draftRef, draft);
      if (
        actor.role === "admin" &&
        (body.approveDiscount === true ||
          previous?.discountPercent !== content.discountPercent) &&
        content.commercial
      )
        tx.set(
          db
            .collection("sagaCatalogs")
            .doc(config().fiscalCode)
            .collection("commercialDiscountAudit")
            .doc(randomUUID()),
          {
            workId: id,
            percent: content.discountPercent,
            previousPercent: previous?.discountPercent || "0",
            uid: actor.uid,
            at,
            revision: draft.revision,
          },
        );
      return {
        draft,
        saved: true,
        canEdit: true,
        reason: "",
        commercialPolicy,
      };
    });
  }
  return { get, put };
}
