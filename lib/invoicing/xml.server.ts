import { createEurRateService } from "./eur-rate.server";
import { createCommercialService } from "./commercial.server";
import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { createSagaCatalogService } from "@/lib/saga/catalog.server";
import {
  clientTaxId,
  normalizeTaxId,
  sameFiscalIdentity,
  type SagaClientEntry,
  type SagaClientLink,
} from "@/lib/saga/clients";
import { unitsMatch } from "@/lib/saga/catalog";
import {
  calculateInvoiceTotals,
  invoiceEditReason,
  parseInvoiceContent,
  type InvoiceDraft,
} from "./draft";
import { createInvoiceNumberingService } from "./numbering.server";
import {
  calculateXmlLines,
  invoiceXml,
  parseIssuer,
  validCounty,
  InvoiceXmlError,
  type IssuerProfile,
  type InvoiceXmlSnapshot,
  type PreparedInvoice,
  type XmlPreview,
} from "./xml";
type Actor = { uid: string; role: string };
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function createInvoiceXmlService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const profileRef = () =>
    db.collection("invoiceIssuerProfiles").doc(config().fiscalCode);
  const numbering = createInvoiceNumberingService(db, config, now);
  const commercial = createCommercialService(db, config, now);
  const eur = createEurRateService(db, { now });
  const catalog = createSagaCatalogService(
    db,
    async () => {
      throw new Error("XML preparation never calls SAGA");
    },
    config,
  );
  const fail = (message: string, code = "INVALID_XML_INVOICE", status = 400) =>
    new InvoiceXmlError(code, message, status);
  const conflict = () =>
    fail(
      "Datele s-au modificat. Salvează și reia previzualizarea; editările locale sunt păstrate.",
      "XML_CONFLICT",
      409,
    );
  const id = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !v ||
      v.length > 200 ||
      /[\/\x00-\x1f]/.test(v)
    )
      throw fail("Identificator invalid.");
    return v;
  };
  async function authorize(
    actor: Actor,
    tx?: Transaction,
    admin = false,
    write = false,
  ) {
    if (
      !actor?.uid ||
      !(admin ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw fail("Nu ai acces la documentele facturii.", "FORBIDDEN", 403);
    const ref = db.collection("users").doc(actor.uid),
      user = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!user || user.disabled === true || user.role !== actor.role)
      throw fail("Nu ai acces la documentele facturii.", "FORBIDDEN", 403);
    if (write && !config().readsEnabled)
      throw fail(
        "Pregătirea documentelor nu este activată. Administratorul trebuie să finalizeze configurarea.",
        "XML_DISABLED",
        409,
      );
  }
  async function profile(actor: Actor) {
    await authorize(actor);
    const p = (await profileRef().get()).data() as IssuerProfile | undefined;
    return {
      fiscalCode: config().fiscalCode,
      profile: p || null,
      writesEnabled: config().readsEnabled,
    };
  }
  async function saveProfile(actor: Actor, input: unknown) {
    await authorize(actor, undefined, true, true);
    const v = input as { expectedRevision: number; profile: unknown };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0
    )
      throw fail("Revizie profil invalidă.");
    const data = parseIssuer(v.profile, config().fiscalCode);
    return db.runTransaction(async (tx) => {
      await authorize(actor, tx, true, true);
      const old = await tx.get(profileRef());
      if ((old.data()?.revision || 0) !== v.expectedRevision) throw conflict();
      const saved = {
        ...data,
        revision: v.expectedRevision + 1,
        updatedAt: now().toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(profileRef(), saved);
      return {
        fiscalCode: config().fiscalCode,
        profile: saved,
        writesEnabled: config().readsEnabled,
      };
    });
  }
  async function readPrepared(tx: Transaction, workId: string) {
    const data = (
      await tx.get(db.collection("invoices").doc(workId))
    ).data() as PreparedInvoice | undefined;
    if (data && data.fiscalCode !== config().fiscalCode)
      throw fail(
        "Documentul tichetului aparține altei firme emitente.",
        "COMPANY_CONFLICT",
        409,
      );
    return data || null;
  }
  async function document(actor: Actor, workId: string) {
    await authorize(actor);
    id(workId);
    return {
      document: await db.runTransaction((tx) => readPrepared(tx, workId)),
    };
  }
  async function sources(
    tx: Transaction,
    workId: string,
    revision: number,
    actor: Actor,
  ) {
    const [w, d, p] = await Promise.all([
      tx.get(db.collection("lucrari").doc(workId)),
      tx.get(db.collection("invoiceDrafts").doc(workId)),
      tx.get(profileRef()),
    ]);
    if (!w.exists || !d.exists)
      throw fail(
        "Salvează ciorna înainte de pregătirea XML.",
        "DRAFT_REQUIRED",
        409,
      );
    const reason = invoiceEditReason(w.data()!);
    if (reason) throw fail(reason, "DRAFT_READ_ONLY", 409);
    const draft = d.data() as InvoiceDraft;
    if (draft.revision !== revision) throw conflict();
    if (!p.exists)
      throw fail("Completează datele firmei emitente în editorul facturii.");
    const issuer = {
      ...parseIssuer(p.data(), config().fiscalCode),
      revision: p.data()!.revision,
      updatedAt: p.data()!.updatedAt,
      updatedBy: p.data()!.updatedBy,
    };
    const content = await commercial.validateIn(
      tx,
      actor,
      w.data()!,
      parseInvoiceContent(draft),
      draft,
      true,
    );
    const eurReference = await eur.resolveIn(
      tx,
      content.eurReference,
      content.date,
      actor,
      draft.eurReference,
      true,
    );
    content.eurReference = eurReference;
    const commercialContext = content.commercial
      ? await commercial.contextIn(tx, actor, w.data()!)
      : null;
    const b = content.beneficiary;
    if (
      !content.date ||
      !b.name ||
      !b.address ||
      !b.city ||
      !b.country ||
      !/^[A-Z]{2}$/.test(b.country) ||
      !validCounty(b.country, b.county || "")
    )
      throw fail(
        "Completează data, denumirea și adresa fiscală structurată a beneficiarului (județul prin cod, ex. IF).",
      );
    let clientId = String(
      w.data()!.clientId || w.data()!.clientInfo?.id || "",
    ).trim();
    if (!clientId && w.data()!.client) {
      const matches = await tx.get(
        db.collection("clienti").where("nume", "==", w.data()!.client).limit(2),
      );
      if (matches.size === 1) clientId = matches.docs[0].id;
    }
    if (!clientId) throw fail("Clientul tichetului lipsește sau este ambiguu.");
    id(clientId);
    const root = db.collection("sagaCatalogs").doc(config().fiscalCode);
    const [clientDoc, linkDoc, importDoc] = await Promise.all([
      tx.get(db.collection("clienti").doc(clientId)),
      tx.get(root.collection("clientLinks").doc(clientId)),
      tx.get(root.collection("clientImports").doc("control")),
    ]);
    const link = linkDoc.data() as SagaClientLink | undefined;
    if (!clientDoc.exists || !link?.active)
      throw fail(
        "Asociază clientul FOM cu clientul SAGA înainte de pregătire.",
      );
    if (importDoc.data()?.active) throw conflict();
    const entry = (
      await tx.get(root.collection("clients").doc(id(link.sagaClientId)))
    ).data() as SagaClientEntry | undefined;
    if (!entry || entry.revision !== link.sagaRevision) throw conflict();
    const client = clientDoc.data()!,
      tax = clientTaxId(client, link.country);
    if (
      tax.conflict ||
      sameFiscalIdentity(client, entry, link.country) ||
      tax.normalized !== link.fomTaxId
    )
      throw fail(
        "Asocierea fiscală a clientului necesită reconfirmare.",
        "CLIENT_CONFLICT",
        409,
      );
    if (b.country !== link.country)
      throw fail("Țara beneficiarului diferă de asocierea fiscală confirmată.");
    const invoiceTax = normalizeTaxId(b.cui, b.country),
      sagaTax = normalizeTaxId(entry.taxId, entry.country),
      ticketTax = clientTaxId(w.data()!.clientInfo || {}, link.country);
    if (
      !tax.normalized &&
      !sagaTax &&
      (ticketTax.conflict ||
        (ticketTax.normalized && invoiceTax !== ticketTax.normalized))
    )
      throw fail(
        "Tichetul conține un identificator fiscal cunoscut. Verifică CUI/CIF-ul beneficiarului.",
      );
    if (
      (tax.normalized && invoiceTax !== tax.normalized) ||
      (sagaTax && invoiceTax !== sagaTax) ||
      (!invoiceTax && !tax.normalized && !sagaTax && !link.missingTaxConfirmed)
    )
      throw fail(
        "CUI/CIF-ul beneficiarului nu corespunde identității fiscale confirmate.",
      );
    for (const line of content.lines) {
      if (!line.saga)
        throw fail("Asociază toate produsele și serviciile cu SAGA.");
      line.saga = await catalog.resolve(tx, line.saga);
      const s = line.saga.snapshot!;
      if (!unitsMatch(line.um, s.unit))
        throw fail(`UM incompatibilă pentru ${line.name}.`);
      if (s.kind === "goods" && !s.warehouseCode)
        throw fail(`Alege gestiunea pentru ${line.name}.`);
    }
    const totals = calculateInvoiceTotals(content),
      lines = calculateXmlLines(content);
    const snapshot: InvoiceXmlSnapshot = {
      schemaVersion: 1,
      generatorVersion: 4,
      eurReference,
      ...(commercialContext?.agent ? { agent: commercialContext.agent } : {}),
      fiscalCode: config().fiscalCode,
      workId,
      ticketNumber: draft.references.ticketNumber,
      draftRevision: revision,
      issuer,
      content,
      clientId,
      clientCode: entry.code,
      clientRevision: entry.revision,
      linkRevision: link.revision,
      lines,
      totals,
    };
    const numbers = await numbering.stateIn(tx, actor);
    if (!numbers.config || !numbers.estimatedNumber)
      throw fail("Configurează numerotarea facturilor înainte de pregătire.");
    if (numbers.user) snapshot.numbering = numbers.user;
    const previewHash = hash({
      snapshot,
      numberingRevision: numbers.config.revision,
      numberingCounterRevision: numbers.counter?.revision,
      estimatedNumber: numbers.estimatedNumber,
      prefix: numbers.config.prefix,
      width: numbers.config.width,
    });
    return {
      snapshot,
      previewHash,
      estimatedNumber: numbers.estimatedNumber,
    } satisfies XmlPreview;
  }
  function request(input: unknown) {
    const v = input as {
      expectedRevision: number;
      previewHash?: string;
      operationId?: string;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 1
    )
      throw fail("Revizia ciornei nu este validă.");
    return v;
  }
  async function previewIn(
    tx: Transaction,
    actor: Actor,
    workId: string,
    input: unknown,
  ) {
    await authorize(actor, tx);
    id(workId);
    const v = request(input);
    const existing = await readPrepared(tx, workId);
    if (existing) return { document: existing };
    return sources(tx, workId, v.expectedRevision, actor);
  }
  async function preview(actor: Actor, workId: string, input: unknown) {
    await authorize(actor);
    return db.runTransaction((tx) => previewIn(tx, actor, workId, input));
  }
  function boundedSize(data: unknown) {
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 512 * 1024)
      throw fail(
        "Documentul depășește limita de 512 KiB. Redu textele sau numărul pozițiilor.",
        "DOCUMENT_TOO_LARGE",
      );
  }
  // Internal composition point: stage performs reads before reserveIn writes;
  // its returned callback may only write, so document + transfer commit together.
  async function prepareIn(
    tx: Transaction,
    actor: Actor,
    workId: string,
    input: unknown,
    stage?: (
      tx: Transaction,
      existing: PreparedInvoice | null,
    ) => Promise<(doc: PreparedInvoice) => void>,
  ) {
    id(workId);
    const v = request(input);
    id(v.operationId);
    if (typeof v.previewHash !== "string" || v.previewHash.length !== 64)
      throw conflict();
    await authorize(actor, tx, false, true);
    const existing = await readPrepared(tx, workId);
    if (existing) {
      const commit = await stage?.(tx, existing);
      commit?.(existing);
      return { document: existing };
    }
    const p = await sources(tx, workId, v.expectedRevision, actor);
    if (p.previewHash !== v.previewHash) throw conflict();
    const commit = await stage?.(tx, null);
    // All source reads precede the allocator's writes; XML generation remains pure.
    const reservation = await numbering.reserveIn(tx, actor, {
      workId,
      operationId: v.operationId!,
      expectedDraftRevision: v.expectedRevision,
    });
    if (reservation.draftRevision !== v.expectedRevision) throw conflict();
    if (
      p.snapshot.numbering &&
      (reservation.allocatedBy !== actor.uid ||
        reservation.prefix !== p.snapshot.numbering.prefix ||
        JSON.stringify(reservation.userNumbering) !==
          JSON.stringify(p.snapshot.numbering))
    )
      throw fail(
        "Rezervarea existentă necesită reconciliere. Nu a fost alocat alt număr.",
        "RESERVATION_RECONCILIATION",
        409,
      );
    const artifact = invoiceXml(p.snapshot, reservation.fullNumber),
      sha256 = createHash("sha256").update(artifact.xml, "utf8").digest("hex");
    const doc: PreparedInvoice = {
      workId,
      fiscalCode: config().fiscalCode,
      number: reservation.fullNumber,
      state: "prepared_local",
      compatibility: "unverified",
      stock: "not_checked",
      snapshot: p.snapshot,
      sha256,
      filename: artifact.filename,
      operationId: reservation.operationId,
      preparedAt: now().toISOString(),
      preparedBy: actor.uid,
    };
    const storedArtifact = {
      workId,
      fiscalCode: config().fiscalCode,
      xml: artifact.xml,
      sha256,
      filename: artifact.filename,
    };
    boundedSize(doc);
    boundedSize(storedArtifact);
    tx.set(db.collection("invoices").doc(workId), doc);
    tx.set(db.collection("invoiceArtifacts").doc(workId), storedArtifact);
    commit?.(doc);
    return { document: doc };
  }
  async function prepare(actor: Actor, workId: string, input: unknown) {
    await authorize(actor, undefined, false, true);
    return db.runTransaction((tx) => prepareIn(tx, actor, workId, input));
  }
  async function download(actor: Actor, workId: string) {
    await authorize(actor);
    id(workId);
    return db.runTransaction(async (tx) => {
      const doc = await readPrepared(tx, workId);
      if (!doc)
        throw fail("Documentul XML nu este pregătit.", "NOT_FOUND", 404);
      const a = (
        await tx.get(db.collection("invoiceArtifacts").doc(workId))
      ).data();
      if (
        !a ||
        typeof a.xml !== "string" ||
        a.fiscalCode !== config().fiscalCode ||
        a.sha256 !== doc.sha256 ||
        createHash("sha256").update(a.xml, "utf8").digest("hex") !== doc.sha256
      )
        throw fail(
          "Integritatea documentului XML necesită verificare.",
          "ARTIFACT_INVALID",
          409,
        );
      return { xml: a.xml as string, filename: doc.filename };
    });
  }
  return {
    profile,
    saveProfile,
    document,
    preview,
    prepare,
    download,
    authorizeIn: (tx: Transaction, actor: Actor) => authorize(actor, tx),
    previewIn,
    prepareIn,
  };
}
