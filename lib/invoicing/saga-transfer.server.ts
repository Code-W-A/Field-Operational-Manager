import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { createSagaService } from "@/lib/saga/service.server";
import {
  importPolicy,
  requireLiveImports,
  type ImportPolicy,
  type SagaImportResult,
} from "@/lib/saga/import";
import { SagaError } from "@/lib/saga/contracts";
import { createSagaCatalogService } from "@/lib/saga/catalog.server";
import { unitsMatch } from "@/lib/saga/catalog";
import {
  clientTaxId,
  normalizeTaxId,
  type SagaClientLink,
} from "@/lib/saga/clients";
import { invoiceEditReason } from "./draft";
import type { PreparedInvoice } from "./xml";
import { digest, verifyInvoiceArtifact } from "./saga-artifact.server";
import {
  TransferError,
  decimalSum,
  decimalLess,
  stockGroups,
  transferPending,
  type SagaTransfer,
  type StockGroup,
  type StockReading,
} from "./saga-transfer";
type Actor = { uid: string; role: string };
type Gateway = {
  readForInvoice: ReturnType<typeof createSagaService>["readForInvoice"];
  importForInvoice: ReturnType<typeof createSagaService>["importForInvoice"];
};
type Dependencies = {
  config?: () => SagaConfig;
  policy?: () => ImportPolicy;
  now?: () => number;
  gateway?: Gateway;
};
const id = (v: unknown) => {
  if (typeof v !== "string" || !v || v.length > 200 || /[\/\x00-\x1f]/.test(v))
    throw new TransferError("INVALID_INPUT", "Identificator invalid.");
  return v;
};
export function createInvoiceSagaService(
  db: Firestore,
  deps: Dependencies = {},
) {
  const cfg = deps.config || sagaConfig,
    policy = deps.policy || importPolicy,
    now = deps.now || Date.now;
  const gateway =
    deps.gateway ||
    createSagaService(db, { config: cfg, importPolicy: policy });
  const catalog = createSagaCatalogService(
    db,
    async () => {
      throw new Error("Resolution never calls SAGA");
    },
    cfg,
  );
  const simulation = () => policy().mode === "dry-run";
  const records = (sim = simulation()) =>
    db.collection(sim ? "invoiceSagaSimulations" : "invoiceSagaTransfers");
  const jobId = (workId: string) =>
    digest(JSON.stringify([cfg().fiscalCode, id(workId)]));
  const lockRef = (sim: boolean) =>
    db
      .collection("invoiceSagaCompanyLeases")
      .doc(`${sim ? "mock" : "live"}-${cfg().fiscalCode}`);
  const reportRef = (job: string, sim: boolean) =>
    db.collection("invoiceSagaReports").doc(`${sim ? "mock" : "live"}-${job}`);
  const at = () => new Date(now()).toISOString();
  async function authorize(actor: Actor, tx?: Transaction) {
    if (!actor?.uid || !["admin", "dispecer"].includes(actor.role))
      throw new TransferError(
        "FORBIDDEN",
        "Nu ai acces la trimiterea facturilor.",
        403,
      );
    const ref = db.doc(`users/${id(actor.uid)}`),
      u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled === true || u.role !== actor.role)
      throw new TransferError(
        "FORBIDDEN",
        "Nu ai acces la trimiterea facturilor.",
        403,
      );
  }
  function activation() {
    const p = policy(),
      c = cfg();
    if (!c.readsEnabled)
      throw new TransferError(
        "TRANSFERS_DISABLED",
        "Procesarea este dezactivată. Activează integrarea numai după publicarea regulilor Firestore de protecție.",
        409,
      );
    if (p.mode !== "dry-run")
      requireLiveImports(p, c.fiscalCode, c.readsEnabled);
    return p;
  }
  async function frozen(
    tx: Transaction,
    workId: string,
    validateMappings = false,
  ) {
    const [d, a, w] = await Promise.all([
      tx.get(db.doc(`invoices/${workId}`)),
      tx.get(db.doc(`invoiceArtifacts/${workId}`)),
      tx.get(db.doc(`lucrari/${workId}`)),
    ]);
    if (!d.exists || !a.exists || !w.exists)
      throw new TransferError(
        "INVOICE_REQUIRED",
        "Pregătește mai întâi XML-ul facturii.",
        409,
      );
    const doc = d.data() as PreparedInvoice,
      file = verifyInvoiceArtifact(doc, a.data()!, cfg().fiscalCode);
    if (validateMappings) {
      const reason = invoiceEditReason(w.data()!);
      if (reason) throw new TransferError("INVOICE_BLOCKED", reason, 409);
      const root = db.doc(`sagaCatalogs/${cfg().fiscalCode}`);
      const [l, c, entry, importing] = await Promise.all([
        tx.get(root.collection("clientLinks").doc(id(doc.snapshot.clientId))),
        tx.get(db.doc(`clienti/${id(doc.snapshot.clientId)}`)),
        tx.get(
          root
            .collection("clients")
            .where("code", "==", doc.snapshot.clientCode)
            .limit(2),
        ),
        tx.get(root.collection("clientImports").doc("control")),
      ]);
      const link = l.data() as SagaClientLink | undefined;
      if (
        !link?.active ||
        !c.exists ||
        link.revision !== doc.snapshot.linkRevision ||
        entry.size !== 1 ||
        entry.docs[0].id !== link.sagaClientId ||
        entry.docs[0].data().revision !== doc.snapshot.clientRevision ||
        importing.data()?.active
      )
        throw new TransferError(
          "SOURCE_CONFLICT",
          "Asocierea clientului s-a modificat. Factura necesită reconciliere înainte de transmitere.",
          409,
        );
      const tax = clientTaxId(c.data()!, link.country),
        b = doc.snapshot.content.beneficiary;
      if (
        tax.conflict ||
        (tax.normalized &&
          tax.normalized !== normalizeTaxId(b.cui, link.country)) ||
        link.country !== b.country
      )
        throw new TransferError(
          "SOURCE_CONFLICT",
          "Identitatea fiscală a clientului s-a modificat.",
          409,
        );
      for (const line of doc.snapshot.content.lines) {
        if (!line.saga)
          throw new TransferError(
            "INVALID_MAPPING",
            "Lipsește asocierea unui articol.",
          );
        const resolved = await catalog.resolve(tx, line.saga),
          s = resolved.snapshot!;
        if (
          !unitsMatch(line.um, s.unit) ||
          !isDeepStrictEqual(s, line.saga.snapshot)
        )
          throw new TransferError(
            "SOURCE_CONFLICT",
            "Asocierea unui articol sau gestiunea s-a modificat.",
            409,
          );
      }
    }
    return { doc, file };
  }
  const publicTransfer = (v: SagaTransfer | null) =>
    v ? (({ leaseOwner, leaseUntil, actorRole, ...rest }) => rest)(v) : null;
  async function state(actor: Actor, workId: string) {
    await authorize(actor);
    const p = policy();
    let canStart = true,
      reason = "";
    try {
      activation();
    } catch (e) {
      canStart = false;
      reason =
        e instanceof SagaError ? e.message : "Configurație indisponibilă.";
    }
    const doc = (await db.doc(`invoices/${id(workId)}`).get()).data() as
      | PreparedInvoice
      | undefined;
    if (doc && doc.fiscalCode !== cfg().fiscalCode)
      throw new TransferError(
        "COMPANY_CONFLICT",
        "Factura aparține altei firme.",
        409,
      );
    const t = (await records().doc(jobId(workId)).get()).data() as
      | SagaTransfer
      | undefined;
    return {
      mode: p.mode,
      canStart,
      reason,
      transfer: publicTransfer(t || null),
    };
  }
  async function start(actor: Actor, workId: string, body: unknown) {
    await authorize(actor);
    const p = activation(),
      v = body as { sha256: string; operationId: string };
    id(workId);
    id(v?.operationId);
    if (!/^[a-f0-9]{64}$/.test(v?.sha256))
      throw new TransferError("INVALID_INPUT", "Amprenta XML este invalidă.");
    const sim = p.mode === "dry-run",
      ref = records(sim).doc(jobId(workId));
    const value = await db.runTransaction(async (tx) => {
      await authorize(actor, tx);
      const old = (await tx.get(ref)).data() as SagaTransfer | undefined;
      if (old) {
        if (old.sha256 !== v.sha256 || old.mode !== p.mode)
          throw new TransferError(
            "TRANSFER_CONFLICT",
            "Există deja o operațiune pentru altă versiune a facturii sau alt mod.",
            409,
          );
        if (
          old.phase !== "blocked" ||
          old.importStatus !== "pending" ||
          old.operationId === v.operationId
        )
          return old;
      }
      const { doc } = await frozen(tx, workId, true);
      if (doc.sha256 !== v.sha256)
        throw new TransferError(
          "TRANSFER_CONFLICT",
          "Documentul s-a modificat.",
          409,
        );
      const groups = stockGroups(doc),
        saved: SagaTransfer = {
          schemaVersion: 1,
          id: ref.id,
          workId,
          fiscalCode: cfg().fiscalCode,
          sha256: doc.sha256,
          number: doc.number,
          mode: p.mode,
          operationId: v.operationId,
          phase: groups.length ? "baseline" : "ready",
          importStatus: "pending",
          stockStatus: groups.length ? "pending" : "not_applicable",
          groups,
          cursor: 0,
          attempts: 0,
          maxAttempts: p.checks,
          intervalMs: p.intervalMs,
          nextAt: now(),
          leaseOwner: null,
          leaseUntil: 0,
          createdAt: old?.createdAt || at(),
          updatedAt: at(),
          createdBy: actor.uid,
          actorRole: actor.role,
          revision: (old?.revision || 0) + 1,
          error: null,
          httpStatus: null,
          reportAvailable: false,
          reportChunks: 0,
          reportTruncated: false,
          reportSha256: null,
        };
      tx.set(ref, saved);
      return saved;
    });
    return { mode: p.mode, transfer: publicTransfer(value) };
  }
  async function recheck(actor: Actor, workId: string) {
    await authorize(actor);
    activation();
    const ref = records().doc(jobId(workId));
    const v = await db.runTransaction(async (tx) => {
      await authorize(actor, tx);
      const d = (await tx.get(ref)).data() as SagaTransfer | undefined;
      if (
        !d ||
        d.fiscalCode !== cfg().fiscalCode ||
        d.mode !== policy().mode ||
        d.importStatus === "pending" ||
        d.importStatus === "sending" ||
        !d.groups.length ||
        d.groups.some((g) => !g.before)
      )
        throw new TransferError(
          "RECHECK_UNAVAILABLE",
          "Nu există o citire inițială completă pentru reverificare.",
          409,
        );
      if (transferPending(d)) return d;
      const p = policy(),
        saved = {
          ...d,
          phase: "after" as const,
          stockStatus: "checking" as const,
          cursor: 0,
          attempts: 0,
          maxAttempts: p.checks,
          intervalMs: p.intervalMs,
          groups: d.groups.map((g) => ({
            ...g,
            after: null,
            delta: null,
            matches: false,
          })),
          error: null,
          nextAt: now(),
          updatedAt: at(),
          revision: d.revision + 1,
        };
      tx.set(ref, saved);
      return saved;
    });
    return { mode: policy().mode, transfer: publicTransfer(v) };
  }
  async function report(actor: Actor, workId: string) {
    await authorize(actor);
    const sim = simulation(),
      t = (await records(sim).doc(jobId(workId)).get()).data() as
        | SagaTransfer
        | undefined;
    if (!t || t.fiscalCode !== cfg().fiscalCode || !t.reportAvailable)
      throw new TransferError("NOT_FOUND", "Raportul nu este disponibil.", 404);
    const pieces = await Promise.all(
      Array.from({ length: t.reportChunks }, (_, i) =>
        reportRef(t.id, sim).collection("chunks").doc(String(i)).get(),
      ),
    );
    const text = pieces.map((x) => x.data()?.text || "").join("");
    if (digest(text) !== t.reportSha256)
      throw new TransferError(
        "REPORT_INVALID",
        "Integritatea raportului necesită verificare.",
        409,
      );
    return { text, filename: `saga-import-${t.id}.txt` };
  }
  async function process(transferId: string, sim: boolean) {
    if (!/^[a-f0-9]{64}$/.test(transferId))
      throw new TransferError("INVALID_INPUT", "Operațiune invalidă.");
    if (sim !== simulation()) return { processed: false };
    activation();
    const ref = records(sim).doc(transferId),
      lock = lockRef(sim),
      owner = randomUUID();
    const claim = await db.runTransaction(async (tx) => {
      const [s, l] = await Promise.all([tx.get(ref), tx.get(lock)]),
        v = s.data() as SagaTransfer | undefined;
      if (
        !v ||
        v.fiscalCode !== cfg().fiscalCode ||
        v.mode !== policy().mode ||
        !transferPending(v) ||
        v.nextAt > now() ||
        v.leaseUntil > now()
      )
        return null;
      if (v.phase === "sending" || v.importStatus === "sending") {
        tx.update(ref, {
          phase: "review",
          importStatus: "unknown",
          stockStatus: v.groups.length ? "not_confirmed" : "not_applicable",
          leaseOwner: null,
          leaseUntil: 0,
          error:
            "Transmiterea a fost întreruptă. Necesită reconciliere; factura nu este retrimisă.",
          updatedAt: at(),
          revision: v.revision + 1,
        });
        if (l.data()?.transferId === v.id) tx.delete(lock);
        return null;
      }
      if (
        l.exists &&
        l.data()!.transferId !== v.id &&
        l.data()!.leaseUntil > now()
      )
        return null;
      const saved = { ...v, leaseOwner: owner, leaseUntil: now() + 90000 };
      tx.update(ref, { leaseOwner: owner, leaseUntil: saved.leaseUntil });
      tx.set(lock, { transferId: v.id, leaseUntil: now() + 120000 });
      return saved;
    });
    if (!claim) {
      const current = (await ref.get()).data() as SagaTransfer | undefined;
      return {
        processed: false,
        pending: !!current && transferPending(current),
        nextAt: current?.nextAt || 0,
      };
    }
    const d: SagaTransfer = claim;
    async function owned(
      change:
        | Partial<SagaTransfer>
        | ((current: SagaTransfer) => Partial<SagaTransfer>),
      release = true,
      importResult?: SagaImportResult,
      validateSources = false,
    ) {
      return db.runTransaction(async (tx) => {
        const [s, l] = await Promise.all([tx.get(ref), tx.get(lock)]),
          current = s.data() as SagaTransfer;
        if (
          !current ||
          current.leaseOwner !== owner ||
          current.leaseUntil <= now() ||
          l.data()?.transferId !== transferId
        )
          throw new TransferError(
            "LEASE_LOST",
            "Procesarea necesită verificare.",
            409,
          );
        if (validateSources) {
          await authorize(
            { uid: current.createdBy, role: current.actorRole },
            tx,
          );
          const checked = await frozen(tx, current.workId, true);
          if (checked.doc.sha256 !== current.sha256)
            throw new TransferError(
              "HASH_CONFLICT",
              "Factura înghețată s-a modificat.",
              409,
            );
        }
        const patch = typeof change === "function" ? change(current) : change,
          saved = {
            ...current,
            ...patch,
            revision: current.revision + 1,
            updatedAt: at(),
            ...(release ? { leaseOwner: null, leaseUntil: 0 } : {}),
          };
        if (importResult) {
          const text = importResult.report,
            chunks: string[] = [];
          let chunk = "";
          let bytes = 0;
          for (const char of text) {
            const count = Buffer.byteLength(char, "utf8");
            if (bytes + count > 180000) {
              chunks.push(chunk);
              chunk = "";
              bytes = 0;
            }
            chunk += char;
            bytes += count;
          }
          if (chunk) chunks.push(chunk);
          saved.reportChunks = chunks.length;
          saved.reportSha256 = digest(text);
          saved.reportAvailable = chunks.length > 0;
          saved.reportTruncated = importResult.truncated;
          chunks.forEach((text, i) =>
            tx.set(
              reportRef(transferId, sim).collection("chunks").doc(String(i)),
              { text },
            ),
          );
        }
        tx.set(ref, saved);
        if (release && !transferPending(saved)) tx.delete(lock);
        else tx.set(lock, { transferId, leaseUntil: now() + 120000 });
        return saved;
      });
    }
    function afterPatch(
      groups: StockGroup[],
      error: string | null,
    ): Partial<SagaTransfer> {
      if (d.cursor + 1 < groups.length)
        return { groups, cursor: d.cursor + 1, nextAt: now(), error };
      const attempts = d.attempts + 1,
        matched = groups.every((g) => g.matches),
        done = matched || attempts >= d.maxAttempts;
      return {
        groups,
        cursor: 0,
        attempts,
        nextAt: now() + d.intervalMs,
        error: matched ? null : error,
        stockStatus: matched ? "observed" : done ? "not_confirmed" : "checking",
        phase: done
          ? d.importStatus === "imported"
            ? "done"
            : "review"
          : "after",
      };
    }
    const actor = { uid: d.createdBy, role: d.actorRole };
    try {
      await authorize(actor);
      if (d.phase === "baseline" || d.phase === "after") {
        const g = d.groups[d.cursor];
        if (!g)
          throw new TransferError(
            "INVALID_OPERATION",
            "Poziția verificării nu este validă.",
            409,
          );
        const reading: StockReading = sim
          ? {
              quantity:
                d.phase === "baseline" ? decimalSum(g.expected, "8") : "8",
              checkedAt: at(),
            }
          : await gateway
              .readForInvoice(actor, {
                kind: "stock",
                code: g.code,
                warehouse: g.warehouse,
              })
              .then((v) => {
                if (v.quantity === undefined)
                  throw new TransferError(
                    "INVALID_STOCK",
                    "Stocul SAGA nu poate fi interpretat.",
                  );
                decimalSum(v.quantity, "0");
                return { quantity: v.quantity, checkedAt: v.checkedAt };
              });
        const groups = d.groups.map((x, i) =>
          i === d.cursor
            ? { ...x, [d.phase === "baseline" ? "before" : "after"]: reading }
            : x,
        );
        if (d.phase === "baseline") {
          if (decimalLess(reading.quantity, g.expected))
            await owned({
              groups,
              phase: "blocked",
              stockStatus: "blocked",
              error: `Stoc insuficient pentru ${g.code}, gestiunea ${g.warehouse}: ${reading.quantity} disponibil, ${g.expected} necesar.`,
            });
          else
            await owned({
              groups,
              cursor: d.cursor + 1 < groups.length ? d.cursor + 1 : 0,
              phase: d.cursor + 1 < groups.length ? "baseline" : "ready",
              nextAt: now(),
            });
        } else {
          const delta = decimalSum(g.before!.quantity, reading.quantity, true);
          groups[d.cursor] = {
            ...groups[d.cursor],
            delta,
            matches: decimalSum(delta, g.expected, true) === "0",
          };
          await owned(afterPatch(groups, d.error));
        }
      } else if (d.phase === "ready") {
        if (
          d.groups.some(
            (g) => !g.before || now() - Date.parse(g.before.checkedAt) > 600000,
          )
        )
          await owned({
            phase: "blocked",
            stockStatus: "blocked",
            error:
              "Citirile inițiale sunt prea vechi. Reia verificarea înainte de trimitere.",
          });
        else {
          const { doc, file } = await db.runTransaction((tx) =>
            frozen(tx, d.workId, true),
          );
          if (doc.sha256 !== d.sha256)
            throw new TransferError(
              "HASH_CONFLICT",
              "Factura înghețată s-a modificat.",
              409,
            );
          const beforeSend = async () => {
            activation();
            await owned(
              { phase: "sending", importStatus: "sending" },
              false,
              undefined,
              true,
            );
          };
          let result: SagaImportResult;
          if (sim) {
            await beforeSend();
            result = {
              outcome: "imported",
              httpStatus: 200,
              report:
                "Simulare locală: import reușit. Niciun document nu a fost transmis către SAGA.",
              checkedAt: at(),
              truncated: false,
            };
          } else
            result = await gateway.importForInvoice(actor, file, beforeSend);
          const inspect =
            ["imported", "partial"].includes(result.outcome) &&
            d.groups.length > 0;
          await owned(
            {
              phase: inspect
                ? "after"
                : result.outcome === "imported"
                  ? "done"
                  : result.outcome === "failed"
                    ? "blocked"
                    : "review",
              importStatus: result.outcome,
              httpStatus: result.httpStatus,
              stockStatus: inspect
                ? "checking"
                : d.groups.length
                  ? "not_confirmed"
                  : "not_applicable",
              cursor: 0,
              attempts: 0,
              nextAt: now(),
              error:
                result.outcome === "imported"
                  ? null
                  : result.outcome === "partial"
                    ? "Import parțial; este necesară reconcilierea."
                    : result.outcome === "failed"
                      ? "Importul a fost respins. Consultă raportul."
                      : "Rezultatul importului este incert. Necesită reconciliere.",
            },
            true,
            result,
          );
        }
      }
    } catch (e) {
      const code = e instanceof SagaError ? e.code : "UNAVAILABLE",
        message =
          e instanceof SagaError
            ? e.message
            : "Procesarea SAGA a fost întreruptă. Verifică operațiunea.";
      await owned((current) => {
        if (current.phase === "sending" || current.importStatus === "sending")
          return {
            phase: "review",
            importStatus: "unknown",
            stockStatus: current.groups.length
              ? "not_confirmed"
              : "not_applicable",
            error:
              "Rezultatul trimiterii este incert. Necesită reconciliere; nu se retransmite automat.",
          };
        if (code === "BUSY") return { nextAt: now() + 2000 };
        if (d.phase === "after")
          return afterPatch(
            d.groups.map((g, i) =>
              i === d.cursor
                ? { ...g, after: null, delta: null, matches: false }
                : g,
            ),
            message,
          );
        return {
          phase: "blocked",
          stockStatus: d.groups.length ? "blocked" : "not_applicable",
          error: message,
        };
      });
    }
    const final = (await ref.get()).data() as SagaTransfer;
    return {
      processed: true,
      pending: transferPending(final),
      nextAt: final.nextAt,
    };
  }
  return { state, start, recheck, report, process };
}
