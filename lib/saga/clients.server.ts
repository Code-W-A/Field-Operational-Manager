import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "./config.server";
import { SagaError } from "./contracts";
import {
  CLIENT_IMPORT_BATCH,
  clientTaxId,
  normalizeTaxId,
  sameFiscalIdentity,
  validateClientRows,
  type ClientAssociation,
  type ClientImport,
  type SagaClientEntry,
  type SagaClientLink,
  type SagaClientRow,
} from "./clients";
type Actor = { uid: string; role: string };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const digest = (v: unknown) => hash(JSON.stringify(v));
const invalid = (s: string) => new SagaError("INVALID_CLIENT_LINK", s);
const conflict = () =>
  new SagaError(
    "CLIENT_CONFLICT",
    "Datele au fost modificate între timp. Reîncarcă și confirmă din nou asocierea.",
    409,
  );
export function createSagaClientsService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
) {
  const root = () => db.collection("sagaCatalogs").doc(config().fiscalCode);
  const control = () => root().collection("clientImports").doc("control");
  const id = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !v ||
      v.length > 200 ||
      /[\/\x00-\x1f]/.test(v)
    )
      throw invalid("Identificator invalid.");
    return v;
  };
  async function checkUser(actor: Actor, write = false, tx?: Transaction) {
    if (
      !actor?.uid ||
      !(write ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw new SagaError(
        "FORBIDDEN",
        "Nu ai acces la această operațiune.",
        403,
      );
    const ref = db.collection("users").doc(actor.uid);
    const u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled === true || u.role !== actor.role)
      throw new SagaError(
        "FORBIDDEN",
        "Nu ai acces la această operațiune.",
        403,
      );
    if (write && !config().readsEnabled)
      throw new SagaError(
        "READS_DISABLED",
        "Integrarea SAGA nu este activată. Administratorul trebuie să finalizeze configurarea.",
        409,
      );
    return u;
  }
  async function preview(actor: Actor, input: unknown) {
    await checkUser(actor, true);
    return { rows: validateClientRows(input) };
  }
  async function search(
    actor: Actor,
    query = "",
    country = "",
    exactTax = false,
  ) {
    await checkUser(actor);
    if (query.length > 100 || (country && !/^[A-Z]{2}$/.test(country)))
      throw invalid("Căutare invalidă.");
    const snapshot = await root().collection("clients").get();
    const q = query.trim().toLocaleLowerCase("ro");
    const matches = snapshot.docs
      .map((d) => d.data() as SagaClientEntry)
      .filter(
        (row) =>
          (!country || row.country === country) &&
          (exactTax
            ? !!country &&
              !!q &&
              normalizeTaxId(row.taxId, row.country).toLowerCase() ===
                normalizeTaxId(q, country).toLowerCase()
            : !q ||
              `${row.code} ${row.name} ${row.taxId} ${normalizeTaxId(row.taxId, row.country)}`
                .toLocaleLowerCase("ro")
                .includes(q)),
      )
      .sort((a, b) => a.code.localeCompare(b.code));
    const state = (await control().get()).data();
    return {
      entries: matches.slice(0, 100),
      total: matches.length,
      runningImport: state?.active || null,
    };
  }
  async function begin(actor: Actor, input: unknown) {
    await checkUser(actor, true);
    const v = input as { total?: unknown; hashes?: unknown; source?: unknown };
    if (
      !v ||
      !Number.isSafeInteger(v.total) ||
      Number(v.total) < 1 ||
      Number(v.total) > 5000 ||
      !Array.isArray(v.hashes) ||
      v.hashes.length !== Math.ceil(Number(v.total) / CLIENT_IMPORT_BATCH) ||
      v.hashes.some((h) => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h))
    )
      throw invalid("Manifest de import invalid.");
    if (
      typeof v.source !== "string" ||
      !v.source.trim() ||
      v.source.length > 300
    )
      throw invalid("Numele sursei nu este valid.");
    const source = v.source.trim(),
      total = Number(v.total),
      hashes = v.hashes as string[];
    const fingerprint = digest({ source, total, hashes }),
      importId = randomUUID();
    const ref = root().collection("clientImports").doc(importId);
    return db.runTransaction(async (tx) => {
      await checkUser(actor, true, tx);
      const lock = await tx.get(control());
      if (lock.data()?.active) {
        if (lock.data()!.fingerprint !== fingerprint)
          throw new SagaError(
            "IMPORT_BUSY",
            "Există un import în curs. Reia-l sau anulează-l înainte de un alt import.",
            409,
          );
        const existing = (
          await tx.get(
            root().collection("clientImports").doc(lock.data()!.active),
          )
        ).data();
        if (!existing || existing.status !== "running") throw conflict();
        return publicImport(existing);
      }
      const job = {
        id: importId,
        source,
        total,
        next: 0,
        chunks: hashes.length,
        hashes,
        status: "running",
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(ref, job);
      tx.set(control(), { active: importId, fingerprint });
      return publicImport(job);
    });
  }
  function publicImport(data: Record<string, any>): ClientImport {
    const { id, source, total, next, chunks, status, updatedAt, updatedBy } =
      data;
    return { id, source, total, next, chunks, status, updatedAt, updatedBy };
  }
  async function progress(actor: Actor, importId?: string) {
    await checkUser(actor);
    const active = importId || (await control().get()).data()?.active;
    if (!active) return { job: null };
    const job = (
      await root().collection("clientImports").doc(id(active)).get()
    ).data();
    return { job: job ? publicImport(job) : null };
  }
  async function batch(actor: Actor, importId: string, input: unknown) {
    await checkUser(actor, true);
    const v = input as { index: number; rows: unknown },
      rows = validateClientRows(v?.rows);
    if (
      !Number.isSafeInteger(v.index) ||
      v.index < 0 ||
      rows.length > CLIENT_IMPORT_BATCH
    )
      throw invalid("Lot invalid.");
    const r = root(),
      ref = r.collection("clientImports").doc(id(importId));
    return db.runTransaction(async (tx) => {
      await checkUser(actor, true, tx);
      const [jobDoc, lock] = await Promise.all([
        tx.get(ref),
        tx.get(control()),
      ]);
      const job = jobDoc.data();
      if (
        !job ||
        job.status === "cancelled" ||
        job.hashes[v.index] !== digest(rows)
      )
        throw conflict();
      if (v.index < job.next) return publicImport(job);
      if (
        job.next !== v.index ||
        lock.data()?.active !== importId ||
        job.status !== "running"
      )
        throw conflict();
      const refs = rows.map((row) =>
        r.collection("clients").doc(hash(row.code)),
      );
      const previous = await Promise.all(refs.map((ref) => tx.get(ref)));
      if (
        rows.length !==
        Math.min(CLIENT_IMPORT_BATCH, job.total - v.index * CLIENT_IMPORT_BATCH)
      )
        throw invalid("Numărul rândurilor din lot nu corespunde importului.");
      const now = new Date().toISOString();
      rows.forEach((row, i) => {
        const old = previous[i].data();
        const changed =
          !old ||
          ["name", "taxId", "country"].some(
            (key) => old[key] !== row[key as keyof SagaClientRow],
          );
        if (old?.importId === importId && changed)
          throw new SagaError(
            "DUPLICATE_CODE",
            `Codul ${row.code} are date contradictorii în import.`,
          );
        tx.set(refs[i], {
          ...row,
          importId,
          id: refs[i].id,
          revision: (old?.revision || 0) + (changed ? 1 : 0),
          source: job.source,
          origin: "export",
          importedAt: now,
          updatedBy: actor.uid,
        });
      });
      const next = job.next + 1,
        status = next === job.chunks ? "completed" : "running";
      tx.update(ref, { next, status, updatedAt: now });
      if (status === "completed") tx.set(control(), { active: null });
      return publicImport({ ...job, next, status, updatedAt: now });
    });
  }
  async function cancel(actor: Actor, importId: string) {
    await checkUser(actor, true);
    return db.runTransaction(async (tx) => {
      await checkUser(actor, true, tx);
      const ref = root().collection("clientImports").doc(id(importId));
      const [job, lock] = await Promise.all([tx.get(ref), tx.get(control())]);
      if (
        !job.exists ||
        job.data()!.status !== "running" ||
        lock.data()?.active !== importId
      )
        throw conflict();
      tx.update(ref, {
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      });
      tx.set(control(), { active: null });
      return { cancelled: true };
    });
  }
  async function association(
    actor: Actor,
    clientId: string,
  ): Promise<ClientAssociation> {
    await checkUser(actor);
    const r = root(),
      client = await db.collection("clienti").doc(id(clientId)).get();
    if (!client.exists)
      throw new SagaError("NOT_FOUND", "Clientul FOM nu există.", 404);
    const link = (
      await r.collection("clientLinks").doc(clientId).get()
    ).data() as SagaClientLink | undefined;
    const entry = link?.active
      ? ((await r.collection("clients").doc(link.sagaClientId).get()).data() as
          | SagaClientEntry
          | undefined)
      : undefined;
    const issues: string[] = [];
    if (!link?.active) issues.push("Clientul FOM nu este asociat cu SAGA.");
    else if (!entry)
      issues.push(
        "Clientul SAGA asociat nu mai este disponibil în lista de referință.",
      );
    else {
      const mismatch = sameFiscalIdentity(client.data()!, entry, link.country);
      if (mismatch) issues.push(mismatch);
      if (
        link.sagaRevision !== entry.revision ||
        clientTaxId(client.data()!, link.country).normalized !== link.fomTaxId
      )
        issues.push(
          "Asocierea necesită reconfirmare: datele fiscale sau lista SAGA s-au modificat.",
        );
    }
    return {
      fiscalCode: r.id,
      clientId,
      clientName: client.data()!.nume || "",
      taxId: clientTaxId(client.data()!, link?.country || "").raw,
      revision: link?.revision || 0,
      link: link?.active ? link : null,
      entry: entry || null,
      issues,
    };
  }
  async function link(actor: Actor, clientId: string, input: unknown) {
    await checkUser(actor, true);
    const v = input as {
      expectedRevision: number;
      sagaClientId?: string | null;
      sagaRevision?: number;
      country?: string;
      missingTaxConfirmed?: boolean;
      manualClient?: SagaClientRow;
      manualConfirmed?: boolean;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0
    )
      throw invalid("Revizie invalidă.");
    const manual =
      v.manualClient === undefined
        ? null
        : validateClientRows([v.manualClient])[0];
    if (manual && (v.manualConfirmed !== true || v.sagaClientId !== undefined))
      throw invalid(
        "Confirmă că ai verificat codul, denumirea și CUI-ul în SAGA.",
      );
    const r = root(),
      ref = r.collection("clientLinks").doc(id(clientId));
    await db.runTransaction(async (tx) => {
      const operator = await checkUser(actor, true, tx);
      const [client, previous, importing] = await Promise.all([
        tx.get(db.collection("clienti").doc(clientId)),
        tx.get(ref),
        tx.get(control()),
      ]);
      if (!client.exists)
        throw new SagaError("NOT_FOUND", "Clientul FOM nu există.", 404);
      if ((previous.data()?.revision || 0) !== v.expectedRevision)
        throw conflict();
      if (importing.data()?.active)
        throw new SagaError(
          "IMPORT_BUSY",
          "Așteaptă finalizarea importului înainte de asociere.",
          409,
        );
      const common = {
        clientId,
        revision: v.expectedRevision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid,
        confirmedByName: String(
          operator.displayName || operator.nume || operator.name || actor.uid,
        ).slice(0, 200),
      };
      if (v.sagaClientId === null) {
        tx.set(ref, { ...common, active: false });
        return;
      }
      const country = String(v.country || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{2}$/.test(country))
        throw invalid("Confirmă țara fiscală a clientului FOM.");
      const entryRef = r
        .collection("clients")
        .doc(manual ? hash(manual.code) : id(v.sagaClientId));
      const existing = (await tx.get(entryRef)).data() as
        | SagaClientEntry
        | undefined;
      if (
        manual &&
        existing &&
        (existing.name.trim().toLocaleLowerCase("ro") !==
          manual.name.toLocaleLowerCase("ro") ||
          existing.country !== manual.country ||
          normalizeTaxId(existing.taxId, existing.country) !==
            normalizeTaxId(manual.taxId, manual.country))
      )
        throw new SagaError(
          "CLIENT_CONFLICT",
          "Codul există deja în lista FOM cu alte date. Caută-l în listă și verifică datele înainte de asociere.",
          409,
        );
      const entry: SagaClientEntry | undefined = manual
        ? existing || {
            ...manual,
            id: entryRef.id,
            revision: 1,
            source: "Introducere manuală — neverificată online",
            origin: "manual",
            importedAt: common.updatedAt,
            updatedBy: actor.uid,
          }
        : existing;
      if (!entry || (!manual && entry.revision !== v.sagaRevision))
        throw conflict();
      const mismatch = sameFiscalIdentity(client.data()!, entry, country);
      if (mismatch) throw invalid(mismatch);
      const tax = clientTaxId(client.data()!, country).normalized;
      const missing = !tax || !normalizeTaxId(entry.taxId, country);
      if (missing && v.missingTaxConfirmed !== true)
        throw invalid(
          "Confirmă explicit asocierea fără identificator fiscal complet.",
        );
      if (manual && !existing) tx.set(entryRef, entry);
      tx.set(ref, {
        ...common,
        active: true,
        sagaClientId: entry.id,
        sagaRevision: entry.revision,
        country,
        fomTaxId: tax,
        missingTaxConfirmed: missing,
        confirmationMethod:
          manual || entry.origin === "manual" ? "manual" : "export",
      });
    });
    return association(actor, clientId);
  }
  async function forWork(
    actor: Actor,
    workId: string,
  ): Promise<ClientAssociation> {
    await checkUser(actor);
    const work = (await db.collection("lucrari").doc(id(workId)).get()).data();
    if (!work) throw new SagaError("NOT_FOUND", "Tichetul nu există.", 404);
    let clientId = String(work.clientId || work.clientInfo?.id || "").trim();
    if (!clientId && work.client) {
      const matches = await db
        .collection("clienti")
        .where("nume", "==", work.client)
        .limit(2)
        .get();
      if (matches.size === 1) clientId = matches.docs[0].id;
    }
    if (!clientId)
      return {
        fiscalCode: config().fiscalCode,
        clientId: null,
        clientName: "",
        taxId: "",
        revision: 0,
        link: null,
        entry: null,
        issues: [
          "Clientul tichetului lipsește sau este ambiguu. Corectează clientul din tichet.",
        ],
      };
    return association(actor, clientId);
  }
  return {
    preview,
    search,
    begin,
    progress,
    batch,
    cancel,
    association,
    link,
    forWork,
  };
}
