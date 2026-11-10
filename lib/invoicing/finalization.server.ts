import { randomUUID, createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { createSagaService } from "@/lib/saga/service.server";
import { importPolicy, type ImportPolicy } from "@/lib/saga/import";
import { SagaError } from "@/lib/saga/contracts";
import { createInvoiceXmlService } from "./xml.server";
import { createInvoiceSagaService } from "./saga-transfer.server";
import {
  decimalLess,
  stockGroups,
  type SagaTransfer,
  type StockGroup,
} from "./saga-transfer";
import type { PreparedInvoice, XmlPreview } from "./xml";

type Actor = { uid: string; role: string };
type Gateway = Pick<
  ReturnType<typeof createSagaService>,
  "readForInvoice" | "importForInvoice"
>;
type Deps = {
  config?: () => SagaConfig;
  policy?: () => ImportPolicy;
  gateway?: Gateway;
  now?: () => number;
};
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const invalid = (message: string, status = 409) =>
  new SagaError("FINALIZATION_CONFLICT", message, status);
function ident(v: unknown) {
  if (typeof v !== "string" || !v || v.length > 200 || /[\/\x00-\x1f]/.test(v))
    throw invalid("Identificator invalid.", 400);
  return v;
}
const publicTransfer = (v: SagaTransfer) => {
  const { leaseOwner, leaseUntil, actorRole, ...rest } = v;
  return rest;
};
export function createInvoiceFinalizationService(
  db: Firestore,
  deps: Deps = {},
) {
  const config = deps.config || sagaConfig,
    policy = deps.policy || importPolicy,
    now = deps.now || Date.now;
  const xml = createInvoiceXmlService(db, config, () => new Date(now()));
  const gateway =
    deps.gateway || createSagaService(db, { config, importPolicy: policy });
  const saga = createInvoiceSagaService(db, { config, policy, gateway, now });
  const previews = () =>
    db
      .doc(`sagaCatalogs/${config().fiscalCode}`)
      .collection("finalizationPreviews");
  const fingerprint = (p: XmlPreview | { document: PreparedInvoice }) =>
    "document" in p
      ? hash({ sha256: p.document.sha256, number: p.document.number })
      : p.previewHash;
  const snapshotOf = (p: XmlPreview | { document: PreparedInvoice }) =>
    "document" in p ? p.document.snapshot : p.snapshot;
  async function context(
    tx: Transaction,
    actor: Actor,
    workId: string,
    revision: number,
    operationId: string,
  ) {
    const current = await xml.previewIn(tx, actor, workId, {
      expectedRevision: revision,
    });
    const staged = await saga.stageIn(
      tx,
      actor,
      workId,
      operationId,
      "document" in current ? current.document : null,
    );
    return { current, staged };
  }
  async function preview(actor: Actor, workId: string, raw: unknown) {
    ident(workId);
    const v = raw as { expectedRevision: number };
    const p = policy(),
      modeHash = hash(p),
      previewId = randomUUID(),
      operationId = randomUUID();
    const initial = await db.runTransaction((tx) =>
      context(tx, actor, workId, v?.expectedRevision, operationId),
    );
    const existing = initial.staged.existing;
    if (
      existing &&
      !(existing.phase === "blocked" && existing.importStatus === "pending")
    )
      return {
        mode: p.mode,
        document:
          "document" in initial.current ? initial.current.document : null,
        transfer: publicTransfer(existing),
        alreadyStarted: true,
      };
    const groups = stockGroups({ snapshot: snapshotOf(initial.current) });
    const issues: string[] = [];
    if (p.mode !== "dry-run") {
      for (const g of groups) {
        try {
          const result = await gateway.readForInvoice(actor, {
            kind: "stock",
            code: g.code,
            warehouse: g.warehouse,
          });
          if (
            result.quantity === undefined ||
            !/^[-]?\d+(?:\.\d+)?$/.test(result.quantity)
          )
            throw Error("Invalid stock");
          g.before = { quantity: result.quantity, checkedAt: result.checkedAt };
          if (decimalLess(result.quantity, g.expected))
            issues.push(
              `Stoc insuficient pentru ${g.code}, gestiune ${g.warehouse}: ${result.quantity} disponibil, ${g.expected} necesar.`,
            );
        } catch {
          issues.push(
            `Stocul pentru ${g.code}, gestiune ${g.warehouse}, nu a putut fi verificat. Reia verificarea.`,
          );
        }
      }
    }
    const ref = previews().doc(previewId);
    return db.runTransaction(async (tx) => {
      if (hash(policy()) !== modeHash)
        throw invalid("Modul de trimitere s-a schimbat. Reia verificarea.");
      const latest = await context(
        tx,
        actor,
        workId,
        v.expectedRevision,
        operationId,
      );
      if (fingerprint(latest.current) !== fingerprint(initial.current))
        throw invalid(
          "Datele s-au modificat. Editările sunt păstrate; reia verificarea.",
        );
      const details = {
        snapshot: snapshotOf(latest.current),
        estimatedNumber:
          "document" in latest.current
            ? latest.current.document.number
            : latest.current.estimatedNumber,
        prepared: "document" in latest.current,
      };
      const quote = {
        ...details,
        fiscalCode: config().fiscalCode,
        createdAt: new Date(now()).toISOString(),
        uid: actor.uid,
        workId,
        expectedRevision: v.expectedRevision,
        mode: p.mode,
        modeHash,
        fingerprint: fingerprint(latest.current),
        expiresAt: now() + 600000,
        canConfirm: issues.length === 0,
        groups,
      };
      if (Buffer.byteLength(JSON.stringify(quote)) > 512 * 1024)
        throw invalid("Rezumatul este prea mare.", 400);
      tx.create(ref, quote);
      return {
        previewId,
        mode: p.mode,
        expiresAt: quote.expiresAt,
        canConfirm: quote.canConfirm,
        issues,
        groups,
        ...details,
      };
    });
  }
  async function confirm(actor: Actor, workId: string, raw: unknown) {
    ident(workId);
    const v = raw as { previewId: string; operationId: string };
    const ref = previews().doc(ident(v?.previewId));
    ident(v?.operationId);
    return db.runTransaction(async (tx) => {
      await xml.authorizeIn(tx, actor);
      const quote = (await tx.get(ref)).data();
      if (
        !quote ||
        quote.uid !== actor.uid ||
        quote.workId !== workId ||
        quote.fiscalCode !== config().fiscalCode
      )
        throw invalid("Rezumatul nu aparține acestui utilizator și tichet.");
      if (quote.modeHash !== hash(policy()))
        throw invalid("Modul de trimitere s-a schimbat. Reia verificarea.");
      const { current, staged } = await context(
        tx,
        actor,
        workId,
        quote.expectedRevision,
        v.operationId,
      );
      // A completed or concurrently committed operation is authoritative and never renumbered.
      if (
        "document" in current &&
        staged.existing &&
        current.document.sha256 === staged.existing.sha256 &&
        !(
          staged.existing.phase === "blocked" &&
          staged.existing.importStatus === "pending" &&
          !quote.completed
        )
      )
        return {
          mode: quote.mode,
          document: current.document,
          transfer: publicTransfer(staged.existing),
        };
      if (
        !quote.canConfirm ||
        quote.expiresAt <= now() ||
        quote.fingerprint !== fingerprint(current)
      )
        throw invalid(
          "Rezumatul a expirat sau datele s-au modificat. Reia verificarea.",
        );
      let transfer: SagaTransfer | undefined;
      const result = await xml.prepareIn(
        tx,
        actor,
        workId,
        {
          expectedRevision: quote.expectedRevision,
          previewHash:
            "document" in current
              ? hash(current.document.sha256)
              : current.previewHash,
          operationId: v.operationId,
        },
        async () => (document) => {
          transfer = staged.enqueue(document);
        },
      );
      if (!transfer)
        throw invalid("Operațiunea de trimitere nu a putut fi pregătită.");
      tx.update(ref, {
        completed: true,
        committedAt: new Date(now()).toISOString(),
        requestOperationId: v.operationId,
      });
      return {
        mode: quote.mode,
        document: result.document,
        transfer: publicTransfer(transfer),
      };
    });
  }
  return { preview, confirm };
}
