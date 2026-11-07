import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "./config.server";
import { SagaError, type SagaReadResult } from "./contracts";
import {
  parseInvoiceSagaLink,
  type InvoiceSagaLink,
  type SagaCatalog,
  type SagaProduct,
  type SagaWarehouse,
} from "./catalog";
import { bucharestDate, invoiceEditReason } from "../invoicing/draft";

type Actor = { uid: string; role: string };
type Read = (actor: Actor, input: unknown) => Promise<SagaReadResult>;
export function createSagaCatalogService(
  db: Firestore,
  read: Read,
  config: () => SagaConfig = sagaConfig,
) {
  const root = () => db.collection("sagaCatalogs").doc(config().fiscalCode);
  const invalid = (message = "Date de catalog invalide.") =>
    new SagaError("INVALID_CATALOG", message);
  async function authorize(actor: Actor, write = false) {
    if (
      !actor?.uid ||
      !(write ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw new SagaError(
        "FORBIDDEN",
        "Nu ai acces la această operațiune.",
        403,
      );
    const u = (await db.doc(`users/${actor.uid}`).get()).data();
    if (!u || u.disabled === true || u.role !== actor.role)
      throw new SagaError(
        "FORBIDDEN",
        "Nu ai acces la această operațiune.",
        403,
      );
  }
  const text = (v: unknown, max = 100) => {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      v.length > max ||
      /[\x00-\x1f\x7f]/.test(v)
    )
      throw invalid();
    return v.trim();
  };
  const id = (v: unknown) => {
    const s = text(v);
    if (s.includes("/")) throw invalid();
    return s;
  };
  const conflict = () =>
    new SagaError(
      "CATALOG_CONFLICT",
      "Asocierea a fost modificată. Reîncarcă catalogul și selectează din nou asocierea; editările ciornei sunt păstrate.",
      409,
    );
  async function list(actor: Actor): Promise<SagaCatalog> {
    await authorize(actor);
    const r = root();
    const [products, warehouses] = await Promise.all([
      r.collection("products").get(),
      r.collection("warehouses").get(),
    ]);
    return {
      fiscalCode: r.id,
      products: products.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as SagaProduct,
      ),
      warehouses: warehouses.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as SagaWarehouse,
      ),
    };
  }
  async function save(
    actor: Actor,
    kind: string,
    input: unknown,
    resourceId?: string,
  ) {
    await authorize(actor, true);
    if (!config().readsEnabled)
      throw new SagaError(
        "READS_DISABLED",
        "Integrarea SAGA nu este activată. Administratorul trebuie să finalizeze configurarea.",
        409,
      );
    if (!["products", "warehouses"].includes(kind)) throw invalid();
    const body = input as Record<string, unknown>;
    if (
      !body ||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 0 ||
      typeof body.active !== "boolean"
    )
      throw invalid();
    const r = root(),
      ref = r.collection(kind).doc(resourceId ? id(resourceId) : randomUUID());
    const before = await ref.get();
    const previous = before.data();
    if (
      (previous?.revision || 0) !== body.expectedRevision ||
      (!resourceId && body.expectedRevision !== 0) ||
      (resourceId && !before.exists)
    )
      throw conflict();
    const code = text(body.code),
      name = text(body.name, 300);
    let details: Partial<SagaProduct> = {};
    if (kind === "products") {
      if (
        !["goods", "service"].includes(String(body.kind)) ||
        !Array.isArray(body.warehouseIds) ||
        body.warehouseIds.length > 100
      )
        throw invalid();
      const warehouseIds = [...new Set(body.warehouseIds.map(id))];
      if (body.kind === "service" && warehouseIds.length)
        throw invalid("Serviciile nu au gestiuni de marfă.");
      let article = previous
        ? { name: previous.articleName, unit: previous.unit }
        : undefined;
      let verifiedAt = previous?.verifiedAt;
      if (!previous || previous.code !== code) {
        const result = await read(actor, { kind: "article", code });
        article = result.article;
        verifiedAt = result.checkedAt;
      }
      if (!article?.name || !article.unit)
        throw invalid("Articolul nu a fost confirmat de SAGA.");
      details = {
        kind: body.kind as SagaProduct["kind"],
        warehouseIds,
        articleName: article.name,
        unit: article.unit,
        verifiedAt,
      };
    }
    const codeRef = (value: string) =>
      r
        .collection("codes")
        .doc(`${kind}-${createHash("sha256").update(value).digest("hex")}`);
    return db.runTransaction(async (tx) => {
      const [current, user, existingCode] = await Promise.all([
        tx.get(ref),
        tx.get(db.doc(`users/${actor.uid}`)),
        tx.get(codeRef(code)),
      ]);
      if (user.data()?.role !== "admin" || user.data()?.disabled === true)
        throw new SagaError("FORBIDDEN", "Nu ai acces.", 403);
      if (
        (current.data()?.revision || 0) !== body.expectedRevision ||
        current.exists !== before.exists
      )
        throw conflict();
      if (existingCode.exists && existingCode.data()!.resourceId !== ref.id)
        throw invalid(
          "Codul există deja în catalog. Editează asocierea existentă.",
        );
      for (const warehouseId of details.warehouseIds || []) {
        const warehouse = await tx.get(
          r.collection("warehouses").doc(warehouseId),
        );
        if (!warehouse.exists || (body.active && !warehouse.data()!.active))
          throw invalid("Selectează gestiuni active din catalog.");
      }
      const saved = {
        id: ref.id,
        code,
        name,
        active: body.active,
        ...details,
        revision: Number(body.expectedRevision) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(ref, saved);
      if (previous?.code && previous.code !== code)
        tx.delete(codeRef(previous.code));
      tx.set(codeRef(code), { resourceId: ref.id });
      return saved;
    });
  }
  async function resolve(
    tx: Transaction,
    link: InvoiceSagaLink,
  ): Promise<InvoiceSagaLink> {
    if (link.fiscalCode !== config().fiscalCode) throw conflict();
    const r = root(),
      p = (
        await tx.get(r.collection("products").doc(id(link.productId)))
      ).data() as SagaProduct | undefined;
    if (!p || !p.active || p.revision !== link.revision) throw conflict();
    let warehouse: SagaWarehouse | undefined;
    if (link.warehouseId) {
      if (p.kind !== "goods" || !p.warehouseIds.includes(link.warehouseId))
        throw invalid("Gestiunea nu este permisă pentru produs.");
      warehouse = (
        await tx.get(r.collection("warehouses").doc(id(link.warehouseId)))
      ).data() as SagaWarehouse | undefined;
      if (
        !warehouse?.active ||
        (link.warehouseRevision !== undefined &&
          link.warehouseRevision !== warehouse.revision)
      )
        throw conflict();
    }
    return {
      fiscalCode: r.id,
      productId: link.productId,
      revision: p.revision,
      warehouseId: link.warehouseId,
      ...(warehouse ? { warehouseRevision: warehouse.revision } : {}),
      snapshot: {
        code: p.code,
        name: p.articleName,
        unit: p.unit,
        kind: p.kind,
        warehouseCode: warehouse?.code || "",
        warehouseName: warehouse?.name || "",
      },
    };
  }
  async function stock(actor: Actor, workId: string, input: unknown) {
    await authorize(actor);
    const link = parseInvoiceSagaLink(input);
    if (!link) throw invalid();
    const resolved = await db.runTransaction(async (tx) => {
      const work = await tx.get(db.doc(`lucrari/${id(workId)}`));
      if (!work.exists)
        throw new SagaError("NOT_FOUND", "Tichetul nu există.", 404);
      const reason = invoiceEditReason(work.data()!);
      if (reason) throw new SagaError("DRAFT_READ_ONLY", reason, 409);
      return resolve(tx, link);
    });
    if (resolved.snapshot!.kind !== "goods" || !resolved.warehouseId)
      throw invalid("Alege o gestiune pentru consultarea stocului de marfă.");
    // Uses the same per-company lease and encrypted token rotation as Settings.
    const result = await read(actor, {
      kind: "stock",
      code: resolved.snapshot!.code,
      warehouse: resolved.snapshot!.warehouseCode,
      date: bucharestDate(),
    });
    // A catalog change while awaiting SAGA must not produce a usable stale result.
    await db.runTransaction((tx) => resolve(tx, link));
    return { ...result, association: resolved };
  }
  return { list, save, resolve, stock };
}
