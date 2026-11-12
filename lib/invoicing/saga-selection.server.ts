import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { SagaError } from "@/lib/saga/contracts";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import {
  selectSagaRows,
  type SagaStockRow,
  type SagaStockSituation,
  type SagaSelectionRow,
} from "@/lib/saga/stock-situation";
import { stockSituationPeriod } from "@/lib/saga/stock-situation.server";
import { invoiceEditReason } from "./draft";

type Actor = { uid: string; role: string };
const fail = (message: string, status = 409) =>
  new SagaError("SAGA_SELECTION", message, status);
const safeId = (v: unknown) => {
  if (typeof v !== "string" || !/^[\w-]{1,128}$/.test(v))
    throw fail("Selecție SAGA invalidă.", 400);
  return v;
};
export function createSagaSelectionService(
  db: Firestore,
  read: (actor: Actor) => Promise<SagaStockSituation>,
  config: () => SagaConfig = sagaConfig,
  now = Date.now,
) {
  async function authorize(actor: Actor, workId: string) {
    if (!actor?.uid || !["admin", "dispecer"].includes(actor.role))
      throw fail("Nu ai acces.", 403);
    const [u, w, invoice] = await Promise.all([
      db.doc(`users/${safeId(actor.uid)}`).get(),
      db.doc(`lucrari/${safeId(workId)}`).get(),
      db.doc(`invoices/${workId}`).get(),
    ]);
    if (!u.exists || u.data()!.disabled || u.data()!.role !== actor.role)
      throw fail("Nu ai acces.", 403);
    if (!w.exists) throw fail("Tichetul nu există.", 404);
    const reason = invoiceEditReason(w.data()!);
    if (reason || invoice.exists)
      throw fail(reason || "Factura este deja pregătită.");
    if (!config().readsEnabled)
      throw fail("Consultările SAGA sunt dezactivate.");
  }
  function canonicalRow(input: any): SagaStockRow {
    const keys = [
      "code",
      "name",
      "typeCode",
      "typeName",
      "warehouseCode",
      "warehouseName",
      "unit",
      "vat",
      "quantity",
      "available",
    ] as const;
    if (
      !input ||
      keys.some(
        (key) => typeof input[key] !== "string" || input[key].length > 2000,
      )
    )
      throw fail("Selecție SAGA invalidă.", 400);
    return Object.fromEntries(
      keys.map((key) => [key, input[key]]),
    ) as SagaStockRow;
  }
  function signature(
    snapshotId: string,
    row: SagaStockRow,
    actor: Actor,
    workId: string,
  ) {
    const settings = config();
    // A domain-specific signing key keeps the proof separate from token encryption.
    const key = createHmac("sha256", settings.encryptionKey)
      .update("fom-saga-live-selection-v1")
      .digest();
    return createHmac("sha256", key)
      .update(
        JSON.stringify([
          settings.fiscalCode,
          actor.uid,
          workId,
          snapshotId,
          canonicalRow(row),
        ]),
      )
      .digest("base64url");
  }
  async function list(
    actor: Actor,
    workId: string,
    query: { type?: string; warehouse?: string; q?: string; offset?: string },
    _refresh = false,
  ) {
    await authorize(actor, workId);
    if (
      [query.type, query.warehouse, query.q].some(
        (v) => v && (v.length > 100 || /[\x00-\x1f]/.test(v)),
      )
    )
      throw fail("Căutare invalidă.", 400);
    const offset = Number(query.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 50000)
      throw fail("Pagină invalidă.", 400);
    const report = await read(actor);
    const snapshotId = `${randomUUID()}_${now() + 600000}_${stockSituationPeriod(now()).end}`;
    const rows: SagaSelectionRow[] = report.rows.map((row) => ({
      ...canonicalRow(row),
      selectionProof: signature(snapshotId, row, actor, workId),
    }));
    const result = {
      ...selectSagaRows(
        rows,
        { snapshotId, checkedAt: report.checkedAt, stale: false },
        query,
      ),
      rows,
    };
    if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024)
      throw fail(
        "Raportul SAGA este prea mare pentru afișare. Contactează administratorul.",
        502,
      );
    return result;
  }
  async function selectedIn(
    _tx: Transaction,
    selection: {
      snapshotId: string;
      code: string;
      typeCode: string;
      warehouseCode: string;
      row?: SagaStockRow;
      selectionProof?: string;
    },
    actor: Actor,
    workId: string,
  ) {
    const snapshotId = safeId(selection.snapshotId);
    const [, expires, end] = snapshotId.split("_");
    if (
      !expires ||
      !/^\d{13}$/.test(expires) ||
      Number(expires) <= now() ||
      Number(expires) > now() + 600000 ||
      end !== stockSituationPeriod(now()).end
    )
      throw fail("Lista SAGA a expirat. Actualizează selecția.");
    const row = canonicalRow(selection.row);
    const expected = signature(snapshotId, row, actor, workId);
    const proof = selection.selectionProof;
    if (
      typeof proof !== "string" ||
      !/^[\w-]{43}$/.test(proof) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(proof)) ||
      row.code !== selection.code ||
      row.typeCode !== selection.typeCode ||
      row.warehouseCode !== selection.warehouseCode
    )
      throw fail("Selecția SAGA s-a modificat. Preia din nou articolul.");
    return row;
  }
  return { list, selectedIn };
}
