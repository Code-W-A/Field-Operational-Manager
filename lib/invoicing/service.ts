import { createSagaCatalogService } from "@/lib/saga/catalog.server";
import type { InvoiceLine } from "./draft";
import type { Firestore } from "firebase-admin/firestore";
import {
  calculateInvoiceTotals,
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
) {
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
    const [w, d] = await Promise.all([
      ref.get(),
      db.collection("invoiceDrafts").doc(id).get(),
    ]);
    if (!w.exists) throw new InvoiceDraftError("Tichetul nu mai există.", 404);
    const reason = invoiceEditReason(w.data()!);
    if (d.exists && !refreshSource)
      return {
        draft: d.data() as InvoiceDraft,
        saved: true,
        canEdit: !reason,
        reason,
      };
    if (reason)
      return {
        draft: d.exists ? (d.data() as InvoiceDraft) : null,
        saved: d.exists,
        canEdit: false,
        reason,
      };
    const draft = await seed(id, w.data()!);
    draft.revision = d.exists ? d.data()!.revision : 0;
    return { draft, saved: d.exists, canEdit: true, reason: "" };
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
    } | null;
    if (
      !body ||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 0 ||
      (body.refreshSource !== undefined &&
        typeof body.refreshSource !== "boolean")
    )
      throw new InvoiceDraftError("Revizia ciornei nu este validă.");
    const content = parseInvoiceContent(body.content);
    // Source data is read on the server, never trusted from the submitted JSON.
    const prepared = await get(id, actor, true);
    return db.runTransaction(async (tx) => {
      const draftRef = db.collection("invoiceDrafts").doc(id);
      const [w, d, u] = await Promise.all([
        tx.get(ref),
        tx.get(draftRef),
        tx.get(db.collection("users").doc(actor.uid)),
      ]);
      if (
        !u.exists ||
        u.data()!.disabled === true ||
        u.data()!.role !== actor.role
      )
        throw new InvoiceDraftError("Nu ai acces la facturare.", 403);
      if (!w.exists)
        throw new InvoiceDraftError("Tichetul nu mai există.", 404);
      const reason = invoiceEditReason(w.data()!);
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
      const at = now().toISOString();
      const lines: InvoiceLine[] = [];
      for (const line of content.lines) {
        lines.push(
          line.saga
            ? { ...line, saga: await catalog.resolve(tx, line.saga) }
            : line,
        );
      }
      const draft: InvoiceDraft = {
        ...source,
        ...content,
        lines,
        workId: id,
        schemaVersion: 1,
        revision: (previous?.revision || 0) + 1,
        totals: calculateInvoiceTotals(content),
        createdAt: previous?.createdAt || at,
        updatedAt: at,
        updatedBy: { uid: actor.uid, name: u.data()!.displayName || actor.uid },
      };
      tx.set(draftRef, draft);
      return { draft, saved: true, canEdit: true, reason: "" };
    });
  }
  return { get, put };
}
