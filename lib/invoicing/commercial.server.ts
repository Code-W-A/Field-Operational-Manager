import { normalizeTaxId, clientTaxId } from "@/lib/saga/clients";
import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { createSagaCatalogService } from "@/lib/saga/catalog.server";
import type {
  ReferenceEntry,
  IssuerConfiguration,
} from "@/lib/saga/references";
import {
  invoiceContent,
  invoiceEditReason,
  parseInvoiceContent,
  type InvoiceContent,
  type InvoiceDraft,
  type InvoiceLine,
} from "./draft";
import {
  commercialError,
  dueFromTerm,
  type CommercialBinding,
  type CommercialPolicy,
} from "./commercial";
type Actor = { uid: string; role: string };
const hash = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_k, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
      ),
    )
    .digest("hex");
export const commercialReferenceId = (kind: string, code: string) =>
  hash([kind, code]);
export function createCommercialService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const catalog = createSagaCatalogService(
    db,
    async () => {
      throw Error("No online reads in commercial validation");
    },
    config,
  );
  const root = () => db.collection("sagaCatalogs").doc(config().fiscalCode),
    policyRef = () => root().collection("commercialPolicy").doc("current");
  const conflict = () =>
    commercialError(
      "Sursele comerciale s-au modificat. Actualizează explicit regulile și compară diferențele.",
      409,
      "COMMERCIAL_CONFLICT",
    );
  const ident = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !v ||
      v.length > 200 ||
      /[\/\x00-\x1f]/.test(v)
    )
      throw commercialError("Identificator invalid.");
    return v;
  };
  async function auth(
    actor: Actor,
    admin = false,
    tx?: Transaction,
    write = false,
  ) {
    if (
      !actor?.uid ||
      !(admin ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw commercialError("Nu ai acces.", 403);
    const ref = db.doc(`users/${ident(actor.uid)}`),
      u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled || u.role !== actor.role)
      throw commercialError("Nu ai acces.", 403);
    if (write && !config().readsEnabled)
      throw commercialError("Scrierile integrării sunt dezactivate.", 409);
  }
  async function policyIn(tx?: Transaction): Promise<CommercialPolicy> {
    try {
      config();
    } catch {
      return { enabled: false, revision: 0 };
    }
    const r = policyRef(),
      v = (tx ? await tx.get(r) : await r.get()).data();
    return (v as CommercialPolicy) || { enabled: false, revision: 0 };
  }
  async function policy(actor: Actor) {
    await auth(actor);
    const p = await policyIn();
    let writesEnabled = false;
    try {
      writesEnabled = config().readsEnabled;
    } catch {}
    return { ...p, writesEnabled, canAdmin: actor.role === "admin" };
  }
  async function activate(actor: Actor, raw: unknown) {
    await auth(actor, true, undefined, true);
    const v = raw as { expectedRevision: number; confirmed: boolean };
    if (!v || v.confirmed !== true || !Number.isSafeInteger(v.expectedRevision))
      throw commercialError("Confirmă activarea regulilor comerciale.");
    return db.runTransaction(async (tx) => {
      await auth(actor, true, tx, true);
      const p = await policyIn(tx);
      if (p.revision !== v.expectedRevision) throw conflict();
      if (p.enabled) return p;
      const saved = {
        enabled: true,
        revision: p.revision + 1,
        updatedAt: now().toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(policyRef(), saved);
      return saved;
    });
  }
  async function bind(actor: Actor, referenceId: string, raw: unknown) {
    await auth(actor, true, undefined, true);
    ident(referenceId);
    const v = raw as {
      targetId: string;
      expectedRevision: number;
      expectedReferenceRevision: number;
      expectedTargetRevision: number;
      confirmUnit?: boolean;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0
    )
      throw commercialError("Revizie invalidă.");
    ident(v.targetId);
    return db.runTransaction(async (tx) => {
      await auth(actor, true, tx, true);
      const r = root(),
        ref = r.collection("referenceItems").doc(referenceId),
        br = r.collection("commercialBindings").doc(referenceId),
        [a, b] = await Promise.all([tx.get(ref), tx.get(br)]),
        entry = a.data() as ReferenceEntry | undefined;
      if (
        !entry ||
        !["articles", "warehouses"].includes(entry.kind) ||
        entry.revision !== v.expectedReferenceRevision ||
        (b.data()?.revision || 0) !== v.expectedRevision
      )
        throw conflict();
      const target = r
          .collection(entry.kind === "articles" ? "products" : "warehouses")
          .doc(v.targetId),
        t = (await tx.get(target)).data();
      if (
        !t ||
        !t.active ||
        t.code !== entry.code ||
        t.revision !== v.expectedTargetRevision
      )
        throw commercialError(
          "Alege asocierea activă cu exact același cod SAGA.",
          409,
        );
      if (
        entry.kind === "articles" &&
        entry.apiSnapshot?.unit &&
        t.unit !== entry.apiSnapshot.unit
      ) {
        if (v.confirmUnit !== true)
          throw commercialError(
            "Confirmă actualizarea UM a asocierii din verificarea API.",
          );
        tx.update(target, {
          unit: entry.apiSnapshot.unit,
          articleName: entry.apiSnapshot.name,
          verifiedAt: entry.apiSnapshot.checkedAt,
          revision: t.revision + 1,
          updatedAt: now().toISOString(),
          updatedBy: actor.uid,
        });
      }
      const saved: CommercialBinding = {
        id: referenceId,
        kind: entry.kind as "articles" | "warehouses",
        targetId: v.targetId,
        referenceRevision: entry.revision,
        revision: v.expectedRevision + 1,
        updatedAt: now().toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(br, saved);
      return { binding: saved };
    });
  }
  async function binding(actor: Actor, refId: string) {
    await auth(actor);
    return {
      binding:
        (
          await root().collection("commercialBindings").doc(ident(refId)).get()
        ).data() || null,
    };
  }
  async function quoteIn(tx: Transaction, line: InvoiceLine, refresh = false) {
    if (!line.saga) return null;
    const r = root(),
      p = (
        await tx.get(r.collection("products").doc(ident(line.saga.productId)))
      ).data();
    if (!p?.active) throw conflict();
    const link = await catalog.resolve(
        tx,
        refresh
          ? { ...line.saga, revision: p.revision, warehouseRevision: undefined }
          : line.saga,
      ),
      refId = commercialReferenceId("articles", p.code),
      [a, b] = await Promise.all([
        tx.get(r.collection("referenceItems").doc(refId)),
        tx.get(r.collection("commercialBindings").doc(refId)),
      ]),
      entry = a.data() as ReferenceEntry | undefined,
      bind = b.data() as CommercialBinding | undefined;
    if (
      !entry ||
      !bind ||
      bind.targetId !== p.id ||
      bind.kind !== "articles" ||
      entry.kind !== "articles" ||
      entry.code !== p.code
    )
      return {
        link,
        entry: null,
        source: null,
        um: "",
        price: "",
        vat: "",
        issues: ["Referința articolului nu este asociată explicit."],
      };
    if (bind.referenceRevision > entry.revision) throw conflict(); // API refresh may advance the article revision; the binding remains explicit.
    const issues: string[] = [],
      api = entry.apiSnapshot;
    if (!api) issues.push("Articol neverificat API.");
    if (!api?.price || Number(api.price) <= 0)
      issues.push("Prețul trebuie să fie mai mare decât zero.");
    if (api?.vat === null || api?.vat === undefined)
      issues.push("TVA lipsește.");
    if (
      (entry.exportData.currency || entry.operatorConfirmation?.currency) !==
      "RON"
    )
      issues.push("Moneda prețului nu este confirmată RON.");
    if (api && p.unit !== api.unit)
      issues.push("UM a asocierii necesită reconfirmare administrativă.");
    if (link.snapshot?.kind === "goods") {
      if (!link.warehouseId) issues.push("Alege gestiunea.");
      else {
        const code = link.snapshot.warehouseCode,
          id = commercialReferenceId("warehouses", code),
          [wr, wb] = await Promise.all([
            tx.get(r.collection("referenceItems").doc(id)),
            tx.get(r.collection("commercialBindings").doc(id)),
          ]);
        if (
          !wr.exists ||
          wb.data()?.targetId !== link.warehouseId ||
          wb.data()?.referenceRevision !== wr.data()?.revision
        )
          issues.push("Gestiunea nu este asociată referinței curente.");
      }
    }
    const source = {
      referenceId: entry.id,
      referenceRevision: entry.revision,
      bindingRevision: bind.revision,
      checkedAt: api?.checkedAt || "",
    };
    return {
      link,
      entry,
      source,
      um: api?.unit || "",
      price: api?.price ?? "",
      vat: api?.vat ?? "",
      issues,
    };
  }
  async function contextIn(
    tx: Transaction,
    actor: Actor,
    work: Record<string, any>,
  ) {
    const id = String(work.clientId || work.clientInfo?.id || "");
    let client: any = null,
      clientId = id;
    if (id) {
      const d = await tx.get(db.doc(`clienti/${ident(id)}`));
      if (d.exists) client = { ...d.data(), id };
    } else if (work.client) {
      const found = await tx.get(
        db.collection("clienti").where("nume", "==", work.client).limit(2),
      );
      if (found.size === 1) {
        clientId = found.docs[0].id;
        client = { ...found.docs[0].data(), id: clientId };
      }
    }
    const link = clientId
        ? (await tx.get(root().collection("clientLinks").doc(clientId))).data()
        : null,
      entry = link?.active
        ? (
            await tx.get(
              root().collection("clients").doc(ident(link.sagaClientId)),
            )
          ).data()
        : null,
      term = entry
        ? (
            await tx.get(
              root()
                .collection("referenceItems")
                .doc(commercialReferenceId("clientTerms", entry.code)),
            )
          ).data()
        : null;
    const days =
        term?.exportData.termState === "days"
          ? term.exportData.days
          : term?.exportData.termState === "none"
            ? 0
            : null,
      termKey = hash({
        clientId,
        link: link
          ? { revision: link.revision, sagaClientId: link.sagaClientId }
          : null,
        entry: entry ? { revision: entry.revision, code: entry.code } : null,
        term: term
          ? { revision: term.revision, exportData: term.exportData }
          : null,
      });
    const profile = (
        await tx.get(root().collection("issuerProfiles").doc(actor.uid))
      ).data() as IssuerConfiguration | undefined,
      agent = profile
        ? (
            await tx.get(
              root().collection("referenceItems").doc(profile.agentId),
            )
          ).data()
        : null;
    return {
      clientId,
      client,
      link: link || null,
      entry: entry || null,
      termDays: days as number | null,
      termKey,
      agent:
        profile &&
        agent?.kind === "agents" &&
        agent.revision === profile.agentRevision
          ? {
              code: agent.code,
              name: agent.name,
              id: agent.id,
              revision: agent.revision,
              profileRevision: profile.revision,
            }
          : null,
    };
  }
  async function proposeIn(
    tx: Transaction,
    actor: Actor,
    work: Record<string, any>,
    content: InvoiceContent,
    applyBeneficiary = false,
  ) {
    const p = await policyIn(tx);
    if (!p.enabled)
      throw commercialError("Regulile comerciale nu sunt active.", 409);
    const ctx = await contextIn(tx, actor, work),
      lines: InvoiceLine[] = [],
      issues: string[] = [];
    for (const l of content.lines) {
      const quote = await quoteIn(tx, l, true);
      lines.push({
        ...l,
        price: quote?.price || "",
        um: quote?.um || "",
        vatPercent: quote?.vat || "",
        extraInfo: l.extraInfo || "",
        ...(quote ? { saga: quote.link } : {}),
        ...(quote?.source
          ? { commercial: quote.source }
          : { commercial: undefined }),
      });
      issues.push(...(quote?.issues || ["Asociază articolul SAGA."]));
    }
    const dueMode =
      content.commercial?.dueMode || (content.dueDate ? "manual" : "auto");
    const beneficiary = { ...content.beneficiary };
    if (applyBeneficiary && ctx.client) {
      const c = ctx.client;
      const values = {
        name: c.nume || c.denumire || "",
        cui: c.cui || c.cif || "",
        registration: c.regCom || c.registruComert || c.nrRegCom || "",
        address: c.adresa || "",
        bank: c.banca || "",
        iban: c.iban || c.contBancar || "",
        phone: c.telefon || "",
        email: c.email || "",
        country: ctx.link?.country || "",
      };
      for (const [key, value] of Object.entries(values))
        if (value) (beneficiary as any)[key] = String(value);
    }
    const proposed: InvoiceContent = {
      ...content,
      beneficiary,
      lines,
      vatPercent: "",
      extraInfo: content.extraInfo || "",
      dueDate:
        dueMode === "auto"
          ? dueFromTerm(content.date, ctx.termDays)
          : content.dueDate,
      commercial: {
        version: 2,
        policyRevision: p.revision,
        dueMode,
        termKey: ctx.termKey,
        termDays: ctx.termDays,
      },
    };
    return {
      content: proposed,
      context: ctx,
      issues: [...new Set(issues)],
      confirmationHash: hash({
        policy: p,
        content: proposed,
        client: ctx.client,
        link: ctx.link,
        entry: ctx.entry,
      }),
    };
  }
  async function validateIn(
    tx: Transaction,
    actor: Actor,
    work: Record<string, any>,
    content: InvoiceContent,
    previous: InvoiceDraft | null,
    strict = false,
    approveDiscount = false,
  ) {
    const policy = await policyIn(tx);
    if (!content.commercial) {
      if (strict && policy.enabled)
        throw commercialError(
          "Aplică și confirmă regulile SAGA înainte de pregătirea XML.",
          409,
          "COMMERCIAL_REQUIRED",
        );
      return content;
    }
    if (
      !policy.enabled ||
      content.commercial.policyRevision !== policy.revision
    )
      throw conflict();
    const ctx = await contextIn(tx, actor, work);
    if (
      content.commercial.termKey !== ctx.termKey ||
      content.commercial.termDays !== ctx.termDays
    )
      throw conflict();
    if (
      content.commercial.dueMode === "auto" &&
      content.dueDate !== dueFromTerm(content.date, ctx.termDays)
    )
      throw commercialError(
        "Scadența automată nu corespunde termenului confirmat.",
      );
    if (
      actor.role !== "admin" &&
      content.discountPercent !== (previous?.discountPercent || "0")
    )
      throw commercialError("Numai adminul poate modifica discountul.", 403);
    if (ctx.link?.country) {
      const country = ctx.link.country,
        known = [
          ctx.client ? clientTaxId(ctx.client, country).normalized : "",
          normalizeTaxId(ctx.entry?.taxId || "", country),
        ].filter(Boolean),
        claimed = normalizeTaxId(content.beneficiary.cui, country);
      if (
        (claimed && known.some((id) => id !== claimed)) ||
        (content.beneficiary.country && content.beneficiary.country !== country)
      )
        throw commercialError(
          "Identitatea fiscală diferă de clientul FOM și asocierea confirmată.",
        );
    }
    const priorApproval = previous?.commercial?.discountApproval,
      approval =
        actor.role === "admin" && approveDiscount
          ? {
              percent: content.discountPercent,
              uid: actor.uid,
              at: now().toISOString(),
            }
          : priorApproval?.percent === content.discountPercent
            ? priorApproval
            : undefined;
    if (strict && Number(content.discountPercent) > 0 && !approval)
      throw commercialError(
        "Discountul necesită aprobarea explicită a adminului.",
      );
    const result: InvoiceContent = {
      ...content,
      commercial: {
        ...content.commercial,
        ...(approval ? { discountApproval: approval } : {}),
      },
      lines: [],
    };
    for (const line of content.lines) {
      const quote = await quoteIn(tx, line);
      if (quote?.source) {
        if (JSON.stringify(quote.source) !== JSON.stringify(line.commercial))
          throw conflict();
        if (
          line.price !== quote.price ||
          line.um !== quote.um ||
          line.vatPercent !== quote.vat
        )
          throw commercialError(
            "Prețul, UM și TVA-ul sunt protejate pentru toate rolurile.",
            403,
          );
        if (strict && quote.issues.length)
          throw commercialError(quote.issues.join(" "));
        result.lines.push({
          ...line,
          saga: quote.link,
          commercial: quote.source,
        });
      } else {
        if (
          line.price !== "" ||
          (line.vatPercent || "") !== "" ||
          line.commercial
        )
          throw commercialError(
            "Asociază sursa comercială înainte de completarea valorilor protejate.",
            403,
          );
        if (strict)
          throw commercialError("Lipsește o asociere comercială explicită.");
        result.lines.push(line);
      }
    }
    if (strict) {
      if (
        !ctx.link?.active ||
        !ctx.entry ||
        ctx.entry.revision !== ctx.link.sagaRevision
      )
        throw commercialError("Confirmă asocierea actuală a clientului SAGA.");
      if (!content.dueDate)
        throw commercialError(
          "Termen necunoscut: completează manual scadența.",
        );
      if (!ctx.agent)
        throw commercialError(
          "Confirmă agentul actual în profilul utilizatorului emitent.",
        );
    }
    return result;
  }
  async function context(actor: Actor, workId: string) {
    await auth(actor);
    return db.runTransaction(async (tx) => {
      const w = await tx.get(db.doc(`lucrari/${ident(workId)}`));
      if (!w.exists) throw commercialError("Tichet inexistent.", 404);
      const p = await policyIn(tx);
      return {
        policy: p,
        canAdmin: actor.role === "admin",
        ...(p.enabled ? await contextIn(tx, actor, w.data()!) : {}),
      };
    });
  }
  async function preview(actor: Actor, workId: string, raw: unknown) {
    await auth(actor);
    const v = raw as {
      expectedRevision: number;
      content: unknown;
      applyBeneficiary?: boolean;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0
    )
      throw commercialError("Revizie invalidă.");
    const content = parseInvoiceContent(v.content);
    return db.runTransaction(async (tx) => {
      await auth(actor, false, tx);
      const [w, d, f] = await Promise.all([
        tx.get(db.doc(`lucrari/${ident(workId)}`)),
        tx.get(db.doc(`invoiceDrafts/${workId}`)),
        tx.get(db.doc(`invoices/${workId}`)),
      ]);
      if (!w.exists) throw commercialError("Tichet inexistent.", 404);
      if (f.exists || invoiceEditReason(w.data()!))
        throw commercialError("Ciorna poate fi doar consultată.", 409);
      if ((d.data()?.revision || 0) !== v.expectedRevision) throw conflict();
      return proposeIn(
        tx,
        actor,
        w.data()!,
        content,
        v.applyBeneficiary === true,
      );
    });
  }
  async function products(
    actor: Actor,
    options: { q?: string; field?: string; cursor?: string; limit?: string },
  ) {
    await auth(actor);
    const { createSagaReferencesService } = await import(
      "@/lib/saga/references.server"
    );
    const refs = createSagaReferencesService(
        db,
        async () => {
          throw Error("No online reads");
        },
        config,
      ),
      page = await refs.list(actor, "articles", options);
    const entries = await Promise.all(
      page.entries.map(async (e) =>
        db.runTransaction(async (tx) => {
          const b = (
              await tx.get(root().collection("commercialBindings").doc(e.id))
            ).data() as CommercialBinding | undefined,
            p = b
              ? (
                  await tx.get(root().collection("products").doc(b.targetId))
                ).data()
              : null,
            link = p?.active
              ? {
                  fiscalCode: config().fiscalCode,
                  productId: p.id,
                  revision: p.revision,
                  warehouseId: "",
                }
              : null,
            quote = link
              ? await quoteIn(tx, {
                  id: "lookup",
                  name: e.name,
                  um: "",
                  quantity: "",
                  price: "",
                  saga: link,
                })
              : null;
          return {
            entry: e,
            product: p || null,
            source: quote?.source || null,
            issues: quote?.issues.filter((i) => i !== "Alege gestiunea.") || [
              "Referință neasociată produsului FOM.",
            ],
          };
        }),
      ),
    );
    return { ...page, entries };
  }
  return {
    policyIn,
    policy,
    activate,
    bind,
    binding,
    quoteIn,
    contextIn,
    proposeIn,
    validateIn,
    context,
    preview,
    products,
  };
}
