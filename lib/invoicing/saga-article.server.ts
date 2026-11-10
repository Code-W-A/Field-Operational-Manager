import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { SagaError, type SagaReadResult } from "@/lib/saga/contracts";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import type { SagaProduct, SagaWarehouse } from "@/lib/saga/catalog";
import { normalizeReference } from "@/lib/saga/references";
import { commercialReferenceId } from "./commercial.server";
import { commercialDecimal } from "./commercial";
import { invoiceEditReason, type InvoiceLine } from "./draft";

type Actor = { uid: string; role: string };
type Read = (actor: Actor, input: unknown) => Promise<SagaReadResult>;
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fail = (message: string, status = 400) =>
  new SagaError("SAGA_ARTICLE", message, status);
const conflict = () =>
  fail(
    "Datele s-au modificat. Preia din nou articolul; editările facturii sunt păstrate.",
    409,
  );
const text = (s: unknown) => {
  if (
    typeof s !== "string" ||
    !s.trim() ||
    s.length > 100 ||
    /[\x00-\x1f\x7f]/.test(s)
  )
    throw fail("Introdu un cod valid, exact ca în SAGA.");
  return s.trim();
};
const ident = (s: unknown) => {
  const v = text(s);
  if (v.includes("/")) throw fail("Identificator invalid.");
  return v;
};
export function createInvoiceSagaArticleService(
  db: Firestore,
  read: Read,
  config: () => SagaConfig = sagaConfig,
  now = () => Date.now(),
) {
  const root = () => db.doc(`sagaCatalogs/${config().fiscalCode}`);
  async function authorize(tx: Transaction, actor: Actor, workId: string) {
    if (!actor?.uid || !["admin", "dispecer"].includes(actor.role))
      throw fail("Nu ai acces.", 403);
    const [u, w, invoice, draft, policy] = await Promise.all([
      tx.get(db.doc(`users/${ident(actor.uid)}`)),
      tx.get(db.doc(`lucrari/${ident(workId)}`)),
      tx.get(db.doc(`invoices/${workId}`)),
      tx.get(db.doc(`invoiceDrafts/${workId}`)),
      tx.get(root().collection("commercialPolicy").doc("current")),
    ]);
    if (!u.exists || u.data()!.disabled || u.data()!.role !== actor.role)
      throw fail("Nu ai acces.", 403);
    if (!config().readsEnabled)
      throw fail("Consultările SAGA sunt dezactivate.", 409);
    if (!w.exists) throw fail("Tichetul nu există.", 404);
    const reason = invoiceEditReason(w.data()!);
    if (reason || invoice.exists)
      throw fail(reason || "Factura este deja înghețată.", 409);
    if (!policy.data()?.enabled || (draft.exists && !draft.data()?.commercial))
      throw fail(
        "Activează și aplică regulile SAGA înainte de adăugarea produsului.",
        409,
      );
    if (
      draft.exists &&
      draft.data()!.commercial.policyRevision !== policy.data()!.revision
    )
      throw conflict();
    return (
      draft.data() || {
        revision: 0,
        commercial: { policyRevision: policy.data()!.revision },
      }
    );
  }
  async function sources(tx: Transaction, code: string) {
    const r = root(),
      articleId = commercialReferenceId("articles", code);
    const [products, article, binding, ws] = await Promise.all([
      tx.get(r.collection("products").where("code", "==", code).limit(2)),
      tx.get(r.collection("referenceItems").doc(articleId)),
      tx.get(r.collection("commercialBindings").doc(articleId)),
      tx.get(r.collection("warehouses").orderBy("__name__").limit(501)),
    ]);
    if (products.size > 1 || ws.size > 500)
      throw fail("Catalogul necesită verificare administrativă.", 409);
    const product = products.empty
      ? null
      : ({
          ...products.docs[0].data(),
          id: products.docs[0].id,
        } as SagaProduct);
    const warehouses = await Promise.all(
      ws.docs.map(async (d) => {
        const id = commercialReferenceId("warehouses", d.data().code);
        const [a, b] = await Promise.all([
          tx.get(r.collection("referenceItems").doc(id)),
          tx.get(r.collection("commercialBindings").doc(id)),
        ]);
        return {
          warehouse: { ...d.data(), id: d.id } as SagaWarehouse,
          reference: a.data() || null,
          binding: b.data() || null,
        };
      }),
    );
    return {
      product,
      article: article.data() || null,
      binding: binding.data() || null,
      warehouses,
    };
  }
  function allowed(s: Awaited<ReturnType<typeof sources>>) {
    return s.warehouses.filter(
      (v) =>
        v.warehouse.active &&
        (!s.product || s.product.warehouseIds.includes(v.warehouse.id)),
    );
  }
  function issues(
    s: Awaited<ReturnType<typeof sources>>,
    a: NonNullable<SagaReadResult["article"]>,
  ) {
    const result: string[] = [];
    if (s.product && (!s.product.active || s.product.unit !== a.unit))
      result.push(
        "Articolul este dezactivat sau UM diferă. Cere corectare administrativă.",
      );
    const currency =
      s.article?.exportData?.currency ||
      s.article?.operatorConfirmation?.currency;
    if (currency && currency !== "RON")
      result.push(
        "Moneda articolului nu este RON. Cere corectare administrativă.",
      );
    if (!a.price || !/^\d+(?:\.\d+)?$/.test(a.price) || Number(a.price) <= 0)
      result.push("Articolul nu are un preț de vânzare pozitiv în SAGA.");
    if (a.vat === "" || a.vat == null)
      result.push("Cota TVA lipsește în SAGA.");
    if (s.binding && (!s.product || s.binding.targetId !== s.product.id))
      result.push("Asocierea articolului necesită corectare administrativă.");
    return { issues: result, currency: currency || "" };
  }
  async function preview(actor: Actor, workId: string, input: any) {
    const code = text(input?.code);
    const draft = await db.runTransaction((tx) => authorize(tx, actor, workId));
    if (input.expectedRevision !== draft.revision) throw conflict();
    const result = await read(actor, { kind: "article", code });
    const a = result.article;
    if (!a?.name || !a.unit || a.unit.length > 40)
      throw fail("SAGA nu a returnat denumirea și UM valide.", 502);
    const ref = root().collection("articleLookups").doc(randomUUID());
    return db.runTransaction(async (tx) => {
      const current = await authorize(tx, actor, workId);
      if (current.revision !== draft.revision) throw conflict();
      const s = await sources(tx, code),
        state = issues(s, a);
      const quote = {
        workId,
        uid: actor.uid,
        code,
        article: a,
        checkedAt: result.checkedAt,
        expiresAt: now() + 600000,
        draftRevision: current.revision,
        policyRevision: current.commercial.policyRevision,
        fingerprint: digest(s),
        sources: s,
      };
      if (Buffer.byteLength(JSON.stringify(quote)) > 512 * 1024)
        throw fail(
          "Catalogul este prea mare pentru această consultare. Cere verificare administrativă.",
        );
      tx.create(ref, quote);
      return {
        fiscalCode: root().id,
        previewId: ref.id,
        code,
        article: a,
        checkedAt: result.checkedAt,
        expiresAt: quote.expiresAt,
        kind: s.product?.kind || null,
        currencyConfirmed: state.currency === "RON",
        issues: state.issues,
        warehouses: allowed(s).map((v) => v.warehouse),
      };
    });
  }
  async function quoteIn(
    tx: Transaction,
    actor: Actor,
    workId: string,
    previewId: unknown,
  ) {
    const draft = await authorize(tx, actor, workId);
    const ref = root().collection("articleLookups").doc(ident(previewId)),
      quote = (await tx.get(ref)).data();
    if (!quote || quote.workId !== workId || quote.uid !== actor.uid)
      throw fail("Preluarea articolului nu este disponibilă.", 404);
    if (
      quote.expiresAt <= now() ||
      quote.draftRevision !== draft.revision ||
      quote.policyRevision !== draft.commercial.policyRevision
    )
      throw conflict();
    return { ref, quote };
  }
  async function stock(actor: Actor, workId: string, input: any) {
    const selection = await db.runTransaction(async (tx) => {
      const { quote } = await quoteIn(tx, actor, workId, input?.previewId),
        s = await sources(tx, quote.code);
      if (digest(s) !== quote.fingerprint) throw conflict();
      if (s.product?.kind === "service" || input.kind === "service")
        throw fail("Stoc neaplicabil pentru serviciu.");
      const w = allowed(s).find(
        (v) => v.warehouse.id === input.warehouseId,
      )?.warehouse;
      if (!w) throw fail("Alege o gestiune permisă.");
      return { code: quote.code, warehouse: w.code };
    });
    const result = await read(actor, { kind: "stock", ...selection });
    await db.runTransaction(async (tx) => {
      const { quote } = await quoteIn(tx, actor, workId, input.previewId);
      if (digest(await sources(tx, quote.code)) !== quote.fingerprint)
        throw conflict();
    });
    return result;
  }
  async function apply(actor: Actor, workId: string, input: any) {
    if (
      !input ||
      Object.keys(input).some(
        (k) =>
          ![
            "previewId",
            "quantity",
            "warehouseId",
            "kind",
            "confirmRON",
          ].includes(k),
      )
    )
      throw fail("Date de articol invalide.");
    const quantity = commercialDecimal(input.quantity, 999999999, 4);
    if (
      !quantity ||
      Number(quantity) <= 0 ||
      !["goods", "service"].includes(input.kind)
    )
      throw fail("Alege tipul și introdu o cantitate pozitivă.");
    return db.runTransaction(async (tx) => {
      const { ref: quoteRef, quote } = await quoteIn(
        tx,
        actor,
        workId,
        input.previewId,
      );
      const selectionHash = digest(input);
      if (quote.result) {
        if (quote.selectionHash !== selectionHash) throw conflict();
        return { line: quote.result as InvoiceLine };
      }
      const s = await sources(tx, quote.code);
      if (digest(s) !== quote.fingerprint) throw conflict();
      const state = issues(s, quote.article);
      if (state.issues.length) throw fail(state.issues.join(" "), 409);
      if (input.confirmRON !== true && state.currency !== "RON")
        throw fail("Confirmă că prețul este în RON.");
      if (s.product && s.product.kind !== input.kind)
        throw fail("Tipul articolului diferă de configurația existentă.", 409);
      const w = allowed(s).find((v) => v.warehouse.id === input.warehouseId);
      if (input.kind === "goods" && !w) throw fail("Alege o gestiune permisă.");
      if (input.kind === "service" && input.warehouseId)
        throw fail("Serviciile nu folosesc gestiune.");
      if (w && input.kind === "goods") {
        if (w.reference && w.reference.code !== w.warehouse.code)
          throw conflict();
        if (w.binding && w.binding.targetId !== w.warehouse.id)
          throw conflict();
      }
      // Complete all reads before the first write; existing admin configurations are preserved.
      const stamp = new Date(now()).toISOString(),
        r = root();
      const productId =
        s.product?.id || commercialReferenceId("articles", quote.code);
      const articleId = commercialReferenceId("articles", quote.code);
      const apiSnapshot = {
        name: quote.article.name,
        unit: quote.article.unit,
        vat: commercialDecimal(quote.article.vat, 100, 4),
        price: commercialDecimal(quote.article.price),
        checkedAt: quote.checkedAt,
      };
      const confirmed = s.article?.operatorConfirmation;
      const sameApi =
        s.article?.apiSnapshot &&
        ["name", "unit", "vat", "price"].every(
          (key) =>
            s.article!.apiSnapshot[key] ===
            apiSnapshot[key as keyof typeof apiSnapshot],
        );
      const retainedApi = sameApi ? s.article!.apiSnapshot : apiSnapshot;
      const changes = !s.article || !sameApi || (!confirmed && !state.currency);
      const entry = {
        ...(s.article || {}),
        id: articleId,
        kind: "articles",
        code: quote.code,
        name: s.article?.name || apiSnapshot.name,
        exportData: s.article?.exportData || {
          code: quote.code,
          name: apiSnapshot.name,
        },
        apiSnapshot: retainedApi,
        operatorConfirmation: confirmed || {
          currency: "RON",
          kind: input.kind,
          uid: actor.uid,
          at: stamp,
        },
        revision: (s.article?.revision || 0) + (changes ? 1 : 0),
        source: s.article?.source || "Preluare API din factura FOM",
        importId: s.article?.importId || "",
        importedAt: s.article?.importedAt || stamp,
        updatedAt: stamp,
        updatedBy: actor.uid,
        codeSearch: normalizeReference(quote.code),
        nameSearch: normalizeReference(s.article?.name || apiSnapshot.name),
      };
      const product = s.product || {
        id: productId,
        name: apiSnapshot.name,
        code: quote.code,
        unit: apiSnapshot.unit,
        articleName: apiSnapshot.name,
        kind: input.kind,
        warehouseIds: w && input.kind === "goods" ? [w.warehouse.id] : [],
        active: true,
        revision: 1,
        verifiedAt: quote.checkedAt,
        updatedAt: stamp,
        updatedBy: actor.uid,
      };
      const binding = {
        id: articleId,
        kind: "articles",
        targetId: productId,
        referenceRevision: entry.revision,
        revision:
          (s.binding?.revision || 0) +
          (!s.binding || s.binding.referenceRevision !== entry.revision
            ? 1
            : 0),
        updatedAt: stamp,
        updatedBy: actor.uid,
      };
      if (!s.product)
        tx.create(r.collection("products").doc(productId), product);
      if (changes) tx.set(r.collection("referenceItems").doc(articleId), entry);
      if (!s.binding || s.binding.referenceRevision !== entry.revision)
        tx.set(r.collection("commercialBindings").doc(articleId), binding);
      if (w && input.kind === "goods") {
        const id = commercialReferenceId("warehouses", w.warehouse.code);
        const wr = w.reference || {
          id,
          kind: "warehouses",
          code: w.warehouse.code,
          name: w.warehouse.name,
          exportData: { code: w.warehouse.code, name: w.warehouse.name },
          apiSnapshot: null,
          revision: 1,
          source: "Gestiune configurată de admin în FOM",
          importId: "",
          importedAt: stamp,
          updatedAt: stamp,
          updatedBy: actor.uid,
          codeSearch: normalizeReference(w.warehouse.code),
          nameSearch: normalizeReference(w.warehouse.name),
        };
        if (!w.reference) tx.create(r.collection("referenceItems").doc(id), wr);
        if (!w.binding || w.binding.referenceRevision !== wr.revision)
          tx.set(r.collection("commercialBindings").doc(id), {
            id,
            kind: "warehouses",
            targetId: w.warehouse.id,
            referenceRevision: wr.revision,
            revision: (w.binding?.revision || 0) + 1,
            updatedAt: stamp,
            updatedBy: actor.uid,
          });
      }
      const line: InvoiceLine = {
        id: randomUUID(),
        name: apiSnapshot.name,
        um: apiSnapshot.unit,
        quantity,
        price: apiSnapshot.price,
        vatPercent: apiSnapshot.vat,
        extraInfo: "",
        commercial: {
          referenceId: articleId,
          referenceRevision: entry.revision,
          bindingRevision: binding.revision,
          checkedAt: retainedApi.checkedAt,
        },
        saga: {
          fiscalCode: r.id,
          productId,
          revision: product.revision,
          warehouseId: input.kind === "goods" ? w!.warehouse.id : "",
          ...(input.kind === "goods"
            ? { warehouseRevision: w!.warehouse.revision }
            : {}),
          snapshot: {
            code: quote.code,
            name: apiSnapshot.name,
            unit: apiSnapshot.unit,
            kind: input.kind,
            warehouseCode: input.kind === "goods" ? w!.warehouse.code : "",
            warehouseName: input.kind === "goods" ? w!.warehouse.name : "",
          },
        },
      };
      tx.update(quoteRef, { result: line, selectionHash });
      return { line };
    });
  }
  return { preview, apply, stock };
}
