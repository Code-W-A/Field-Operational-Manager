import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import {
  cleanReference,
  normalizeReference,
  type IssuerConfiguration,
  type ReferenceEntry,
} from "@/lib/saga/references";
import { commercialReferenceId } from "./commercial.server";
import {
  formatInvoiceNumber,
  nextInvoiceNumber,
  parseLastNumber,
  InvoiceNumberingError,
  type NumberingCounter,
} from "./numbering";

type Actor = { uid: string; role: string };
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const seriesId = (s: string) =>
  createHash("sha256")
    .update(normalizeReference(s).replace(/\s+/g, " "))
    .digest("hex");
const error = (message: string, status = 409) =>
  new InvoiceNumberingError("ISSUER_SETUP_CONFLICT", message, status);
const ident = (v: string) => {
  if (typeof v !== "string" || !v || v.length > 200 || /[\/\x00-\x1f]/.test(v))
    throw error("Utilizator invalid.", 400);
  return v;
};
export type IssuerSetupInput = {
  expectedRevision: number;
  prefix: string;
  lastVerifiedNumber: string;
  agent:
    | { id: string; revision: number }
    | { code: string; name: string; confirmed: boolean };
  exclusiveConfirmed: boolean;
  lastNumberConfirmed: boolean;
  confirmationHash?: string;
};
export function createIssuerSetupService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const root = () => db.doc(`sagaCatalogs/${config().fiscalCode}`),
    modeRef = () =>
      db.doc(`invoiceNumbering/${config().fiscalCode}/userNumbering/mode`);
  async function authorize(tx: Transaction, actor: Actor, write = false) {
    if (actor.role !== "admin" || !actor.uid)
      throw error("Doar administratorul configurează facturarea.", 403);
    const u = (await tx.get(db.doc(`users/${ident(actor.uid)}`))).data();
    if (!u || u.disabled || u.role !== "admin")
      throw error("Nu ai acces.", 403);
    if (write && !config().readsEnabled)
      throw error("Configurarea integrării nu este activată.");
  }
  async function read(tx: Transaction, actor: Actor, uid: string) {
    await authorize(tx, actor);
    ident(uid);
    const profileRef = root().collection("issuerProfiles").doc(uid),
      userRef = db.doc(`users/${uid}`);
    const [u, p, m] = await Promise.all([
      tx.get(userRef),
      tx.get(profileRef),
      tx.get(modeRef()),
    ]);
    const user = u.data(),
      profile = p.data() as IssuerConfiguration | undefined;
    if (!user || user.disabled || !["admin", "dispecer"].includes(user.role))
      throw error("Selectează un admin/dispecer activ.", 400);
    const counter = profile
      ? ((
          await tx.get(
            db.doc(
              `invoiceCounters/${hash([config().fiscalCode, profile.prefix])}`,
            ),
          )
        ).data() as NumberingCounter | undefined)
      : undefined;
    return {
      user: {
        uid,
        name: String(user.displayName || user.name || uid),
        role: user.role,
      },
      profile: profile || null,
      counter: counter || null,
      mode: m.data() || null,
    };
  }
  async function get(actor: Actor, uid: string) {
    return db.runTransaction(async (tx) => ({
      ...(await read(tx, actor, uid)),
      writesEnabled: config().readsEnabled,
      fiscalCode: config().fiscalCode,
    }));
  }
  async function prepareIn(
    tx: Transaction,
    actor: Actor,
    uid: string,
    raw: unknown,
  ) {
    const state = await read(tx, actor, uid),
      v = raw as IssuerSetupInput;
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0 ||
      !v.agent
    )
      throw error("Date de configurare invalide.", 400);
    if ((state.profile?.revision || 0) !== v.expectedRevision)
      throw error(
        "Profilul s-a modificat. Reîncarcă datele; editările sunt păstrate.",
      );
    const prefix = cleanReference(v.prefix, 32, true),
      last = cleanReference(v.lastVerifiedNumber, 18, true),
      seed = parseLastNumber(last);
    if (
      state.profile?.numbering &&
      (prefix !== state.profile.prefix ||
        last !== state.profile.lastVerifiedNumber)
    )
      throw error(
        "Seria și valoarea inițială ale profilului activ nu se schimbă. Corecțiile contorului se fac numai înainte, din administrare avansată.",
      );
    const claimRef = root().collection("issuerSeries").doc(seriesId(prefix)),
      counterRef = db.doc(
        `invoiceCounters/${hash([config().fiscalCode, prefix])}`,
      );
    const [claim, c, control] = await Promise.all([
      tx.get(claimRef),
      tx.get(counterRef),
      tx.get(root().collection("referenceControl").doc("import")),
    ]);
    if (control.data()?.active)
      throw error("Așteaptă finalizarea importului de referințe.");
    if (claim.exists && claim.data()!.uid !== uid)
      throw error("Seria este deja atribuită altui utilizator.");
    const counter = c.data() as NumberingCounter | undefined;
    if (
      counter &&
      (counter.fiscalCode !== config().fiscalCode || counter.prefix !== prefix)
    )
      throw error("Contor incompatibil.");
    if (
      state.profile?.numbering &&
      (!counter ||
        state.profile.numbering.counterId !== counterRef.id ||
        !claim.exists)
    )
      throw error("Profilul activ necesită reconciliere administrativă.");
    if (
      counter &&
      !state.profile?.numbering &&
      (counter.lastNumber !== seed.number || counter.width !== seed.width)
    )
      throw error(
        "Ultima valoare verificată nu corespunde contorului existent; acesta nu va fi resetat.",
      );
    let agentRef,
      agent: ReferenceEntry,
      manual = false;
    if ("id" in v.agent) {
      agentRef = root().collection("referenceItems").doc(ident(v.agent.id));
      const a = (await tx.get(agentRef)).data() as ReferenceEntry | undefined;
      if (!a || a.kind !== "agents" || a.revision !== v.agent.revision)
        throw error("Agentul s-a modificat. Alege din nou agentul.");
      agent = a;
    } else {
      const code = cleanReference(v.agent.code, 100, true),
        name = cleanReference(v.agent.name, 300, true);
      agentRef = root()
        .collection("referenceItems")
        .doc(commercialReferenceId("agents", code));
      const old = (await tx.get(agentRef)).data() as ReferenceEntry | undefined;
      if (
        old &&
        (old.kind !== "agents" ||
          old.code !== code ||
          normalizeReference(old.name) !== normalizeReference(name))
      )
        throw error(
          "Codul agentului există cu altă denumire. Selectează referința existentă.",
        );
      agent = old || {
        id: agentRef.id,
        kind: "agents",
        code,
        name,
        exportData: { code, name },
        apiSnapshot: null,
        revision: 1,
        source: "Confirmat de admin",
        importId: "manual",
        importedAt: "",
        updatedAt: "",
        updatedBy: actor.uid,
      };
      manual = !old;
    }
    const oldClaimRef =
      state.profile && state.profile.prefix !== prefix
        ? root().collection("issuerSeries").doc(seriesId(state.profile.prefix))
        : null;
    const oldClaim = oldClaimRef ? (await tx.get(oldClaimRef)).data() : null;
    const nextNumber = formatInvoiceNumber(
      prefix,
      nextInvoiceNumber(counter?.lastNumber || seed.number),
      counter?.width || seed.width,
    );
    const normalized = {
      expectedRevision: v.expectedRevision,
      prefix,
      lastVerifiedNumber: last,
      agent: v.agent,
      exclusiveConfirmed: v.exclusiveConfirmed === true,
      lastNumberConfirmed: v.lastNumberConfirmed === true,
    };
    const confirmationHash = hash({
      firm: config().fiscalCode,
      state,
      claim: claim.data() || null,
      counter: counter || null,
      agent,
      oldClaim: oldClaim || null,
      input: normalized,
    });
    return {
      state,
      input: normalized,
      seed,
      agent,
      manual,
      agentRef,
      claimRef,
      counterRef,
      counter,
      oldClaimRef,
      oldClaim,
      nextNumber,
      confirmationHash,
    };
  }
  async function preview(actor: Actor, uid: string, input: unknown) {
    return db.runTransaction(async (tx) => {
      const p = await prepareIn(tx, actor, uid, input);
      return {
        confirmationHash: p.confirmationHash,
        nextNumber: p.nextNumber,
        firstActivation: p.state.mode?.mode !== "per_user",
        active: !!p.state.profile?.numbering,
        agent: {
          code: p.agent.code,
          name: p.agent.name,
          source: p.agent.source,
        },
      };
    });
  }
  async function save(actor: Actor, uid: string, raw: unknown) {
    return db.runTransaction(async (tx) => {
      await authorize(tx, actor, true);
      const p = await prepareIn(tx, actor, uid, raw),
        v = raw as IssuerSetupInput;
      if (p.confirmationHash !== v.confirmationHash)
        throw error(
          "Configurarea s-a modificat. Verifică noua previzualizare.",
        );
      if (
        !p.input.exclusiveConfirmed ||
        !p.input.lastNumberConfirmed ||
        (!("id" in v.agent) && v.agent.confirmed !== true)
      )
        throw error(
          "Confirmă seria exclusivă, ultimul număr și datele agentului.",
          400,
        );
      const at = now().toISOString();
      const profile: IssuerConfiguration = {
        uid,
        prefix: p.input.prefix,
        lastVerifiedNumber: p.input.lastVerifiedNumber,
        agentId: p.agent.id,
        agentCode: p.agent.code,
        agentName: p.agent.name,
        agentRevision: p.agent.revision,
        revision: (p.state.profile?.revision || 0) + 1,
        status: "prepared",
        exclusiveConfirmed: true,
        lastNumberConfirmed: true,
        updatedAt: at,
        updatedBy: actor.uid,
        numbering: p.state.profile?.numbering || {
          counterId: p.counterRef.id,
          activatedAt: at,
          activatedBy: actor.uid,
        },
      };
      if (p.manual)
        tx.create(p.agentRef, {
          ...p.agent,
          codeSearch: normalizeReference(p.agent.code),
          nameSearch: normalizeReference(p.agent.name),
          importedAt: at,
          updatedAt: at,
          adminConfirmation: { uid: actor.uid, at },
        });
      if (!p.counter)
        tx.create(p.counterRef, {
          fiscalCode: config().fiscalCode,
          prefix: profile.prefix,
          width: p.seed.width,
          lastNumber: p.seed.number,
          allocationCount: 0,
          revision: 1,
          updatedAt: at,
        } satisfies NumberingCounter);
      tx.set(root().collection("issuerProfiles").doc(uid), profile);
      tx.set(p.claimRef, { uid, prefix: profile.prefix });
      if (
        p.oldClaimRef &&
        p.oldClaimRef.path !== p.claimRef.path &&
        p.oldClaim?.uid === uid
      )
        tx.delete(p.oldClaimRef);
      if (!p.state.profile?.numbering || p.state.mode?.mode !== "per_user")
        tx.set(modeRef(), {
          mode: "per_user",
          revision: (p.state.mode?.revision || 0) + 1,
          updatedAt: at,
          updatedBy: actor.uid,
        });
      tx.create(modeRef().collection("audit").doc(randomUUID()), {
        reason: "Configurare din utilizator",
        uid,
        before: p.state,
        after: profile,
        updatedAt: at,
        updatedBy: actor.uid,
      });
      return { profile, nextNumber: p.nextNumber };
    });
  }
  return { get, preview, save };
}
