import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  type Firestore,
  type Transaction,
  type Query,
} from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "./config.server";
import type { SagaReadResult } from "./contracts";
import {
  parseLastNumber,
  nextInvoiceNumber,
  formatInvoiceNumber,
} from "@/lib/invoicing/numbering";
import {
  REFERENCE_BATCH,
  referenceKind,
  referenceError,
  cleanReference,
  normalizeReference,
  referenceDecimal,
  validateReferenceRows,
  type ReferenceKind,
  type ReferenceRow,
  type ReferenceEntry,
  type ReferenceImport,
  type IssuerConfiguration,
  type IssuerUser,
} from "./references";
type Actor = { uid: string; role: string };
const hash = (v: string) => createHash("sha256").update(v).digest("hex"),
  digest = (v: unknown) => hash(JSON.stringify(v));
const conflict = () =>
  referenceError(
    "Datele s-au modificat. Reîncarcă și confirmă din nou.",
    "REFERENCE_CONFLICT",
    409,
  );
export function createSagaReferencesService(
  db: Firestore,
  read: (actor: Actor, input: unknown) => Promise<SagaReadResult>,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const root = () => db.collection("sagaCatalogs").doc(config().fiscalCode),
    items = () => root().collection("referenceItems"),
    imports = () => root().collection("referenceImports"),
    control = () => root().collection("referenceControl").doc("import"),
    profiles = () => root().collection("issuerProfiles"),
    series = () => root().collection("issuerSeries");
  const stamp = () => now().toISOString(),
    entryId = (kind: ReferenceKind, code: string) =>
      hash(JSON.stringify([kind, code]));
  const id = (v: unknown) => {
    const value = cleanReference(v, 200, true);
    if (value.includes("/")) throw referenceError("Identificator invalid.");
    return value;
  };
  async function authorize(
    actor: Actor,
    admin = false,
    write = false,
    tx?: Transaction,
  ) {
    if (
      !actor?.uid ||
      !(admin ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw referenceError(
        "Nu ai acces la această operațiune.",
        "FORBIDDEN",
        403,
      );
    const ref = db.collection("users").doc(id(actor.uid)),
      u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled === true || u.role !== actor.role)
      throw referenceError(
        "Nu ai acces la această operațiune.",
        "FORBIDDEN",
        403,
      );
    if (write && !config().readsEnabled)
      throw referenceError(
        "Scrierile SAGA sunt dezactivate. Activează integrarea după publicarea regulilor de protecție.",
        "READS_DISABLED",
        409,
      );
  }
  async function knownClients(rows: ReferenceRow[], tx?: Transaction) {
    const refs = rows.map((r) =>
        root().collection("clients").doc(hash(r.code)),
      ),
      snapshots = tx
        ? await Promise.all(refs.map((r) => tx.get(r)))
        : await db.getAll(...refs);
    const result = new Map<string, { id: string; name: string }>();
    rows.forEach((row, i) => {
      const v = snapshots[i].data();
      if (!v || v.code !== row.code)
        throw referenceError(
          `Clientul SAGA ${row.code} nu există în lista de clienți importată.`,
        );
      result.set(row.code, { id: snapshots[i].id, name: String(v.name) });
    });
    return result;
  }
  async function preview(actor: Actor, rawKind: unknown, input: unknown) {
    await authorize(actor, true, true);
    const kind = referenceKind(rawKind),
      rows = validateReferenceRows(kind, input);
    if (kind === "clientTerms") {
      for (let i = 0; i < rows.length; i += REFERENCE_BATCH)
        await knownClients(rows.slice(i, i + REFERENCE_BATCH));
    }
    return { rows };
  }
  function publicJob(v: Record<string, any>): ReferenceImport {
    const {
      id,
      kind,
      source,
      total,
      next,
      chunks,
      status,
      updatedAt,
      updatedBy,
    } = v;
    return {
      id,
      kind,
      source,
      total,
      next,
      chunks,
      status,
      updatedAt,
      updatedBy,
    };
  }
  async function begin(actor: Actor, rawKind: unknown, input: unknown) {
    await authorize(actor, true, true);
    const kind = referenceKind(rawKind),
      v = input as { source: string; total: number; hashes: string[] };
    if (
      !v ||
      !Number.isInteger(v.total) ||
      v.total < 1 ||
      v.total > 5000 ||
      !Array.isArray(v.hashes) ||
      v.hashes.length !== Math.ceil(v.total / REFERENCE_BATCH) ||
      v.hashes.some((x) => typeof x !== "string" || !/^[a-f0-9]{64}$/.test(x))
    )
      throw referenceError("Manifest de import invalid.");
    const source = cleanReference(v.source, 300, true),
      fingerprint = digest({ kind, source, total: v.total, hashes: v.hashes }),
      ref = imports().doc(randomUUID());
    return db.runTransaction(async (tx) => {
      await authorize(actor, true, true, tx);
      const locked = (await tx.get(control())).data();
      if (locked?.active) {
        if (locked.fingerprint !== fingerprint)
          throw referenceError(
            "Există un import de referință în curs. Reia-l sau anulează-l.",
            "IMPORT_BUSY",
            409,
          );
        const old = (await tx.get(imports().doc(id(locked.active)))).data();
        if (!old || old.status !== "running") throw conflict();
        return publicJob(old);
      }
      const job = {
        id: ref.id,
        kind,
        source,
        total: v.total,
        hashes: v.hashes,
        next: 0,
        chunks: v.hashes.length,
        status: "running",
        updatedAt: stamp(),
        updatedBy: actor.uid,
      };
      tx.set(ref, job);
      tx.set(control(), { active: ref.id, fingerprint });
      return publicJob(job);
    });
  }
  async function progress(actor: Actor, rawKind: unknown, jobId?: string) {
    await authorize(actor);
    const kind = referenceKind(rawKind),
      active = jobId || (await control().get()).data()?.active;
    if (!active) return { job: null };
    const v = (await imports().doc(id(active)).get()).data();
    return { job: v && v.kind === kind ? publicJob(v) : null };
  }
  async function batch(
    actor: Actor,
    rawKind: unknown,
    jobId: string,
    input: unknown,
  ) {
    await authorize(actor, true, true);
    const kind = referenceKind(rawKind),
      v = input as { index: number; rows: unknown };
    if (!v || !Number.isInteger(v.index) || v.index < 0)
      throw referenceError("Lot invalid.");
    const rows = validateReferenceRows(kind, v.rows);
    if (rows.length > REFERENCE_BATCH)
      throw referenceError("Lotul depășește 200 de rânduri.");
    const ref = imports().doc(id(jobId));
    return db.runTransaction(async (tx) => {
      await authorize(actor, true, true, tx);
      const [jobDoc, lock] = await Promise.all([
          tx.get(ref),
          tx.get(control()),
        ]),
        job = jobDoc.data();
      if (
        !job ||
        job.kind !== kind ||
        job.status === "cancelled" ||
        job.hashes[v.index] !== digest(rows)
      )
        throw conflict();
      if (v.index < job.next) return publicJob(job);
      if (
        job.status !== "running" ||
        lock.data()?.active !== ref.id ||
        job.next !== v.index
      )
        throw conflict();
      if (
        rows.length !==
        Math.min(REFERENCE_BATCH, job.total - v.index * REFERENCE_BATCH)
      )
        throw referenceError("Numărul rândurilor nu corespunde manifestului.");
      const refs = rows.map((row) => items().doc(entryId(kind, row.code))),
        old = await Promise.all(refs.map((r) => tx.get(r))),
        clients = kind === "clientTerms" ? await knownClients(rows, tx) : null;
      rows.forEach((row, i) => {
        const previous = old[i].data(),
          changed = !previous || digest(previous.exportData) !== digest(row);
        if (previous?.importId === ref.id && changed)
          throw referenceError(
            `Codul ${row.code} este contradictoriu în import.`,
            "DUPLICATE_CODE",
          );
        const name = clients?.get(row.code)?.name || row.name;
        const saved = {
          id: refs[i].id,
          kind,
          code: row.code,
          name,
          codeSearch: normalizeReference(row.code),
          nameSearch: normalizeReference(name),
          exportData: row,
          apiSnapshot: previous?.apiSnapshot || null,
          ...(previous?.operatorConfirmation
            ? { operatorConfirmation: previous.operatorConfirmation }
            : {}),
          revision: (previous?.revision || 0) + (changed ? 1 : 0),
          source: job.source,
          importedAt: stamp(),
          updatedAt: stamp(),
          updatedBy: actor.uid,
          importId: ref.id,
          ...(clients ? { clientId: clients.get(row.code)!.id } : {}),
        };
        tx.set(refs[i], saved);
      });
      const next = job.next + 1,
        status = next === job.chunks ? "completed" : "running",
        saved = {
          ...job,
          next,
          status,
          updatedAt: stamp(),
          updatedBy: actor.uid,
        };
      tx.update(ref, {
        next,
        status,
        updatedAt: saved.updatedAt,
        updatedBy: actor.uid,
      });
      if (status === "completed") tx.set(control(), { active: null });
      return publicJob(saved);
    });
  }
  async function cancel(actor: Actor, rawKind: unknown, jobId: string) {
    await authorize(actor, true, true);
    const kind = referenceKind(rawKind),
      ref = imports().doc(id(jobId));
    return db.runTransaction(async (tx) => {
      await authorize(actor, true, true, tx);
      const [d, l] = await Promise.all([tx.get(ref), tx.get(control())]),
        job = d.data();
      if (!job || job.kind !== kind)
        throw referenceError("Import inexistent.", "NOT_FOUND", 404);
      if (job.status === "running") {
        tx.update(ref, {
          status: "cancelled",
          updatedAt: stamp(),
          updatedBy: actor.uid,
        });
        if (l.data()?.active === ref.id) tx.set(control(), { active: null });
      }
      return { cancelled: job.status === "running" };
    });
  }
  type PageInput = {
    q?: string;
    field?: string;
    cursor?: string;
    limit?: string;
  };
  async function list(actor: Actor, rawKind: unknown, input: PageInput = {}) {
    await authorize(actor);
    const kind = referenceKind(rawKind),
      q = normalizeReference(cleanReference(input.q || "", 100)),
      field = input.field || "code",
      limit = Number(input.limit || 25);
    if (
      !["code", "name"].includes(field) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw referenceError("Paginare invalidă.");
    const searchField = field === "code" ? "codeSearch" : "nameSearch";
    let query: Query = items()
      .where("kind", "==", kind)
      .orderBy(searchField)
      .orderBy(FieldPath.documentId());
    if (q) query = query.startAt(q).endAt(q + "\uf8ff");
    if (input.cursor) {
      let c: any;
      try {
        if (input.cursor.length > 2048) throw new Error();
        c = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      } catch {
        throw referenceError("Cursor invalid.");
      }
      if (
        c.kind !== kind ||
        c.q !== q ||
        c.field !== field ||
        c.fiscalCode !== config().fiscalCode ||
        typeof c.value !== "string" ||
        (q && !c.value.startsWith(q)) ||
        typeof c.id !== "string" ||
        !/^[a-f0-9]{64}$/.test(c.id)
      )
        throw referenceError("Cursorul nu corespunde căutării.");
      query = query.startAfter(c.value, c.id);
    }
    const docs = (await query.limit(limit + 1).get()).docs,
      visible = docs.slice(0, limit),
      last = visible.at(-1);
    return {
      fiscalCode: config().fiscalCode,
      writesEnabled: config().readsEnabled,
      entries: visible.map((d) => d.data() as ReferenceEntry),
      nextCursor:
        docs.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                kind,
                q,
                field,
                fiscalCode: config().fiscalCode,
                value: last.data()[searchField],
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  async function verify(actor: Actor, referenceId: string, input: unknown) {
    await authorize(actor, true, true);
    const v = input as { expectedRevision: number };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 1
    )
      throw referenceError("Revizie invalidă.");
    const ref = items().doc(id(referenceId)),
      before = (await ref.get()).data() as ReferenceEntry | undefined;
    if (!before || before.kind !== "articles")
      throw referenceError(
        "Articol de referință inexistent.",
        "NOT_FOUND",
        404,
      );
    if (before.revision !== v.expectedRevision) throw conflict();
    const result = await read(actor, { kind: "article", code: before.code }),
      a = result.article;
    if (!a?.name || !a.unit)
      throw referenceError(
        "SAGA nu a confirmat articolul.",
        "INVALID_RESPONSE",
        502,
      );
    const apiSnapshot = {
      name: cleanReference(a.name, 1000, true),
      unit: cleanReference(a.unit, 100, true),
      vat: referenceDecimal(a.vat, true),
      price: referenceDecimal(a.price),
      checkedAt: result.checkedAt,
    };
    return db.runTransaction(async (tx) => {
      await authorize(actor, true, true, tx);
      const current = (await tx.get(ref)).data() as ReferenceEntry | undefined;
      if (
        !current ||
        current.revision !== v.expectedRevision ||
        current.code !== before.code
      )
        throw conflict();
      const saved = {
        ...current,
        apiSnapshot,
        revision: current.revision + 1,
        updatedAt: stamp(),
        updatedBy: actor.uid,
      };
      tx.set(ref, saved);
      return { entry: saved };
    });
  }
  function userSummary(uid: string, value: Record<string, any>): IssuerUser {
    return {
      uid,
      name: String(value.displayName || value.name || value.nume || uid),
      role: String(value.role || ""),
      disabled: value.disabled === true,
    };
  }
  async function users(actor: Actor, cursor = "") {
    await authorize(actor, true);
    let q: Query = db.collection("users").orderBy(FieldPath.documentId());
    if (cursor) q = q.startAfter(id(cursor));
    const docs = (
      await q
        .select("displayName", "name", "nume", "role", "disabled")
        .limit(51)
        .get()
    ).docs;
    return {
      users: docs.slice(0, 50).map((d) => userSummary(d.id, d.data())),
      nextCursor: docs.length > 50 ? docs[49].id : null,
    };
  }
  async function profile(actor: Actor, uid: string) {
    await authorize(actor);
    id(uid);
    if (actor.role !== "admin" && actor.uid !== uid)
      throw referenceError(
        "Poți consulta doar propriul profil.",
        "FORBIDDEN",
        403,
      );
    const [u, p] = await Promise.all([
      db.collection("users").doc(uid).get(),
      profiles().doc(uid).get(),
    ]);
    if (!u.exists)
      throw referenceError("Cont FOM inexistent.", "NOT_FOUND", 404);
    const value = p.data() as IssuerConfiguration | undefined,
      agent = value
        ? (await items().doc(id(value.agentId)).get()).data()
        : null;
    return {
      fiscalCode: config().fiscalCode,
      writesEnabled: config().readsEnabled,
      user: userSummary(uid, u.data()!),
      profile: value || null,
      agentIsCurrent:
        !!value &&
        !!agent &&
        agent.kind === "agents" &&
        agent.revision === value.agentRevision,
    };
  }
  async function saveProfile(actor: Actor, uid: string, input: unknown) {
    await authorize(actor, true, true);
    id(uid);
    const v = input as {
      expectedRevision: number;
      prefix: string;
      lastVerifiedNumber: string;
      agentId: string;
      agentRevision: number;
      exclusiveConfirmed: boolean;
      lastNumberConfirmed: boolean;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0 ||
      !Number.isSafeInteger(v.agentRevision) ||
      v.agentRevision < 1 ||
      v.exclusiveConfirmed !== true ||
      v.lastNumberConfirmed !== true
    )
      throw referenceError(
        "Confirmă seria exclusivă și ultima valoare verificată.",
      );
    const prefix = cleanReference(v.prefix, 32, true),
      lastVerifiedNumber = cleanReference(v.lastVerifiedNumber, 18, true);
    let exampleNextNumber: string;
    try {
      const n = parseLastNumber(lastVerifiedNumber);
      exampleNextNumber = formatInvoiceNumber(
        prefix,
        nextInvoiceNumber(n.number),
        n.width,
      );
    } catch {
      throw referenceError(
        "Ultima valoare numerică verificată nu este validă sau plaja este epuizată.",
      );
    }
    const newClaim = series().doc(
        hash(normalizeReference(prefix).replace(/\s+/g, " ")),
      ),
      ref = profiles().doc(uid),
      agentRef = items().doc(id(v.agentId));
    const result = await db.runTransaction(async (tx) => {
      await authorize(actor, true, true, tx);
      const [u, p, a, c] = await Promise.all([
          tx.get(db.collection("users").doc(uid)),
          tx.get(ref),
          tx.get(agentRef),
          tx.get(newClaim),
        ]),
        old = p.data() as IssuerConfiguration | undefined,
        agent = a.data() as ReferenceEntry | undefined;
      if (!u.exists || u.data()!.disabled === true)
        throw referenceError("Selectează un cont FOM existent și activ.");
      if ((old?.revision || 0) !== v.expectedRevision) throw conflict();
      if (
        !agent ||
        agent.kind !== "agents" ||
        agent.revision !== v.agentRevision
      )
        throw conflict();
      if (c.exists && c.data()!.uid !== uid)
        throw referenceError(
          "Seria este atribuită altui profil.",
          "SERIES_IN_USE",
          409,
        );
      if (
        old?.numbering &&
        (prefix !== old.prefix || lastVerifiedNumber !== old.lastVerifiedNumber)
      )
        throw referenceError(
          "Profilul este activ. Seria și valoarea inițială sunt blocate; corectează contorul din numerotare.",
          "NUMBERING_ACTIVE",
          409,
        );
      const oldClaim = old
          ? series().doc(
              hash(normalizeReference(old.prefix).replace(/\s+/g, " ")),
            )
          : null,
        oldValue =
          oldClaim && oldClaim.path !== newClaim.path
            ? (await tx.get(oldClaim)).data()
            : null;
      const saved: IssuerConfiguration = {
        ...(old?.numbering ? { numbering: old.numbering } : {}),
        uid,
        prefix,
        lastVerifiedNumber,
        agentId: agent.id,
        agentCode: agent.code,
        agentName: agent.name,
        agentRevision: agent.revision,
        revision: v.expectedRevision + 1,
        status: "prepared",
        exclusiveConfirmed: true,
        lastNumberConfirmed: true,
        updatedAt: stamp(),
        updatedBy: actor.uid,
      };
      tx.set(ref, saved);
      tx.set(newClaim, { uid, prefix });
      if (oldClaim && oldClaim.path !== newClaim.path && oldValue?.uid === uid)
        tx.delete(oldClaim);
      return saved;
    });
    return { profile: result, exampleNextNumber };
  }
  return {
    preview,
    begin,
    progress,
    batch,
    cancel,
    list,
    verify,
    users,
    profile,
    saveProfile,
  };
}
