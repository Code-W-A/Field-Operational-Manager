import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import {
  normalizeReference,
  type IssuerConfiguration,
} from "@/lib/saga/references";
import {
  InvoiceNumberingError,
  parseLastNumber,
  nextInvoiceNumber,
  formatInvoiceNumber,
  type NumberingCounter,
  type NumberingState,
  type UserNumberingIdentity,
} from "./numbering";
type Actor = { uid: string; role: string };
const key = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fail = (message: string, code = "INVALID_USER_NUMBERING", status = 409) =>
  new InvoiceNumberingError(code, message, status);
export function createUserNumberingService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const firm = () => config().fiscalCode,
    root = () => db.collection("sagaCatalogs").doc(firm()),
    profiles = () => root().collection("issuerProfiles"),
    modeRef = () =>
      db
        .collection("invoiceNumbering")
        .doc(firm())
        .collection("userNumbering")
        .doc("mode"),
    counterRef = (prefix: string) =>
      db.collection("invoiceCounters").doc(key([firm(), prefix]));
  const stamp = () => now().toISOString();
  const uid = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !v ||
      v.length > 200 ||
      /[\/\x00-\x1f\x7f]/.test(v)
    )
      throw fail("UID invalid.", "INVALID_INPUT", 400);
    return v;
  };
  const conflict = () =>
    fail(
      "Numerotarea s-a modificat. Reîncarcă previzualizarea.",
      "NUMBERING_CONFLICT",
    );
  async function authorize(actor: Actor, tx?: Transaction, write = false) {
    if (!actor?.uid || actor.role !== "admin")
      throw fail("Operațiune rezervată administratorului.", "FORBIDDEN", 403);
    const ref = db.collection("users").doc(uid(actor.uid)),
      u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled || u.role !== "admin")
      throw fail("Nu ai acces.", "FORBIDDEN", 403);
    if (write && !config().readsEnabled)
      throw fail("Numerotarea nu este activată.", "NUMBERING_DISABLED");
  }
  async function modeIn(tx: Transaction) {
    return (await tx.get(modeRef())).data() as
      | { mode: "per_user"; revision: number }
      | undefined;
  }
  async function stateIn(
    tx: Transaction,
    actor: Actor,
    mode: { revision: number },
  ): Promise<NumberingState> {
    const [p, u] = await Promise.all([
      tx.get(profiles().doc(uid(actor.uid))),
      tx.get(db.collection("users").doc(actor.uid)),
    ]);
    const profile = p.data() as IssuerConfiguration | undefined;
    const empty: NumberingState = {
      fiscalCode: firm(),
      writesEnabled: config().readsEnabled,
      config: null,
      counter: null,
      estimatedNumber: null,
      mode: "per_user",
      reason: `Lipsește profilul de facturare pentru ${String(u.data()?.displayName || u.data()?.name || actor.uid)}. Un administrator îl configurează din Utilizatori → Editează utilizatorul → Facturare SAGA.`,
    };
    if (
      !u.exists ||
      u.data()!.disabled ||
      u.data()!.role !== actor.role ||
      !["admin", "dispecer"].includes(actor.role)
    )
      throw fail("Nu ai acces.", "FORBIDDEN", 403);
    if (!profile?.numbering) return empty;
    const ref = counterRef(profile.prefix),
      c = (await tx.get(ref)).data() as NumberingCounter | undefined;
    const claim = (
      await tx.get(
        root()
          .collection("issuerSeries")
          .doc(
            createHash("sha256")
              .update(normalizeReference(profile.prefix).replace(/\s+/g, " "))
              .digest("hex"),
          ),
      )
    ).data();
    if (
      !c ||
      profile.numbering.counterId !== ref.id ||
      c.fiscalCode !== firm() ||
      c.prefix !== profile.prefix ||
      claim?.uid !== actor.uid
    )
      throw fail("Profilul activ necesită verificarea administratorului.");
    const user: UserNumberingIdentity = {
      mode: "per_user",
      uid: actor.uid,
      name: String(u.data()!.displayName || u.data()!.name || actor.uid),
      profileRevision: profile.revision,
      modeRevision: mode.revision,
      counterRevision: c.revision,
      counterId: ref.id,
      prefix: c.prefix,
      width: c.width,
    };
    return {
      fiscalCode: firm(),
      writesEnabled: config().readsEnabled,
      mode: "per_user",
      user,
      counter: c,
      estimatedNumber: formatInvoiceNumber(
        c.prefix,
        nextInvoiceNumber(c.lastNumber),
        c.width,
      ),
      config: {
        fiscalCode: firm(),
        prefix: c.prefix,
        counterId: ref.id,
        width: c.width,
        revision: profile.revision,
        hasAllocated: !!c.allocationCount,
        verifiedLast: parseLastNumber(profile.lastVerifiedNumber).number,
        verifiedAt: profile.numbering.activatedAt,
        updatedBy: profile.updatedBy,
        reason: "Profil utilizator activ",
        exclusiveConfirmed: true,
      },
    };
  }
  async function list(actor: Actor, cursor = "") {
    await authorize(actor);
    if (cursor) uid(cursor);
    let q = profiles().orderBy(FieldPath.documentId());
    if (cursor) q = q.startAfter(cursor);
    const docs = (await q.limit(26).get()).docs,
      m = (await modeRef().get()).data();
    const entries = await Promise.all(
      docs.slice(0, 25).map(async (p) => {
        const profile = p.data() as IssuerConfiguration;
        const [u, c] = await Promise.all([
          db.doc(`users/${p.id}`).get(),
          counterRef(profile.prefix).get(),
        ]);
        return {
          profile,
          user: {
            uid: p.id,
            name: String(u.data()?.displayName || u.data()?.name || p.id),
            role: String(u.data()?.role || ""),
            disabled: !u.exists || u.data()?.disabled === true,
          },
          counter: c.data() || null,
        };
      }),
    );
    return {
      fiscalCode: firm(),
      writesEnabled: config().readsEnabled,
      mode: m?.mode || "legacy",
      revision: m?.revision || 0,
      entries,
      nextCursor: docs.length > 25 ? docs[24].id : null,
    };
  }
  function request(raw: unknown) {
    const v = raw as {
      expectedRevision: number;
      profiles: { uid: string; expectedRevision: number }[];
      correction?: { uid: string; lastVerifiedNumber: string; reason: string };
      confirmationHash?: string;
    };
    if (
      !v ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0 ||
      !Array.isArray(v.profiles) ||
      v.profiles.length > 20 ||
      (!v.profiles.length && !v.correction)
    )
      throw fail(
        "Selectează 1–20 de profiluri sau o corecție.",
        "INVALID_INPUT",
        400,
      );
    const selected = v.profiles.map((p) => {
      uid(p.uid);
      if (!Number.isSafeInteger(p.expectedRevision) || p.expectedRevision < 1)
        throw conflict();
      return { uid: p.uid, expectedRevision: p.expectedRevision };
    });
    if (new Set(selected.map((p) => p.uid)).size !== selected.length)
      throw fail("Profil duplicat.", "INVALID_INPUT", 400);
    if (v.correction) {
      uid(v.correction.uid);
      parseLastNumber(v.correction.lastVerifiedNumber);
      if (
        typeof v.correction.reason !== "string" ||
        !v.correction.reason.trim() ||
        v.correction.reason.length > 500
      )
        throw fail("Completează motivul corecției.", "INVALID_INPUT", 400);
      if (selected.length)
        throw fail(
          "Corecția se face separat de activare.",
          "INVALID_INPUT",
          400,
        );
    }
    return { ...v, profiles: selected };
  }
  async function prepareIn(tx: Transaction, raw: unknown) {
    const input = request(raw),
      mode = await modeIn(tx);
    if ((mode?.revision || 0) !== input.expectedRevision) throw conflict();
    const selected = input.correction
      ? [{ uid: input.correction.uid, expectedRevision: undefined }]
      : input.profiles;
    const entries = [];
    // Read all relevant sources before any transactional write.
    for (const s of selected) {
      const [p, u] = await Promise.all([
          tx.get(profiles().doc(s.uid)),
          tx.get(db.doc(`users/${s.uid}`)),
        ]),
        profile = p.data() as IssuerConfiguration | undefined;
      if (
        !profile ||
        profile.uid !== s.uid ||
        (!input.correction && profile.revision !== s.expectedRevision)
      )
        throw conflict();
      if (
        !u.exists ||
        u.data()!.disabled ||
        !["admin", "dispecer"].includes(u.data()!.role)
      )
        throw fail("Profilul trebuie să aparțină unui admin/dispecer activ.");
      if (
        profile.exclusiveConfirmed !== true ||
        profile.lastNumberConfirmed !== true
      )
        throw fail(
          "Confirmă seria exclusivă și ultima valoare verificată în profil.",
        );
      const claim = (
        await tx.get(
          root()
            .collection("issuerSeries")
            .doc(
              createHash("sha256")
                .update(normalizeReference(profile.prefix).replace(/\s+/g, " "))
                .digest("hex"),
            ),
        )
      ).data();
      if (claim?.uid !== s.uid) throw conflict();
      const ref = counterRef(profile.prefix),
        counter = (await tx.get(ref)).data() as NumberingCounter | undefined,
        seed = parseLastNumber(profile.lastVerifiedNumber);
      if (
        counter &&
        (counter.fiscalCode !== firm() || counter.prefix !== profile.prefix)
      )
        throw fail("Contor incompatibil.");
      if (input.correction) {
        if (
          !profile.numbering ||
          profile.numbering.counterId !== ref.id ||
          !counter
        )
          throw fail("Corecția necesită un profil activ.");
        const value = parseLastNumber(input.correction.lastVerifiedNumber);
        if (BigInt(value.number) <= BigInt(counter.lastNumber))
          throw fail("Corecția trebuie să mărească valoarea contorului.");
      } else if (profile.numbering) {
        if (profile.numbering.counterId !== ref.id || !counter)
          throw fail("Profil activ inconsistent.");
      } else if (
        counter &&
        (counter.lastNumber !== seed.number || counter.width !== seed.width)
      )
        throw fail(
          "Valoarea inițială nu corespunde contorului existent. Corectează profilul înainte de activare.",
        );
      const number = input.correction
          ? parseLastNumber(input.correction.lastVerifiedNumber).number
          : counter?.lastNumber || seed.number,
        width = counter?.width || seed.width;
      entries.push({
        uid: s.uid,
        name: String(u.data()!.displayName || u.data()!.name || s.uid),
        profile,
        counter: counter || null,
        counterId: ref.id,
        lastNumber: number,
        width,
        nextNumber: formatInvoiceNumber(
          profile.prefix,
          nextInvoiceNumber(number),
          width,
        ),
      });
    }
    return {
      input,
      mode: mode || null,
      entries,
      confirmationHash: key({
        firm: firm(),
        input: { ...input, confirmationHash: undefined },
        mode: mode || null,
        entries,
      }),
    };
  }
  async function preview(actor: Actor, raw: unknown) {
    await authorize(actor);
    return db.runTransaction(async (tx) => {
      await authorize(actor, tx);
      return prepareIn(tx, raw);
    });
  }
  async function activate(actor: Actor, raw: unknown) {
    await authorize(actor, undefined, true);
    return db.runTransaction(async (tx) => {
      await authorize(actor, tx, true);
      const p = await prepareIn(tx, raw);
      if (p.input.confirmationHash !== p.confirmationHash) throw conflict();
      const at = stamp();
      for (const e of p.entries) {
        if (!e.counter || p.input.correction) {
          tx.set(counterRef(e.profile.prefix), {
            fiscalCode: firm(),
            prefix: e.profile.prefix,
            width: e.width,
            lastNumber: e.lastNumber,
            allocationCount: e.counter?.allocationCount || 0,
            revision: (e.counter?.revision || 0) + 1,
            updatedAt: at,
          } satisfies NumberingCounter);
        }
        if (!e.profile.numbering)
          tx.update(profiles().doc(e.uid), {
            numbering: {
              counterId: e.counterId,
              activatedAt: at,
              activatedBy: actor.uid,
            },
            revision: e.profile.revision + 1,
            updatedAt: at,
            updatedBy: actor.uid,
          });
      }
      tx.set(modeRef(), {
        mode: "per_user",
        revision: (p.mode?.revision || 0) + 1,
        updatedAt: at,
        updatedBy: actor.uid,
      });
      tx.set(modeRef().collection("audit").doc(randomUUID()), {
        before: p.entries,
        reason: p.input.correction?.reason || "Activare profiluri",
        updatedAt: at,
        updatedBy: actor.uid,
      });
      return {
        activated: true,
        mode: "per_user",
        revision: (p.mode?.revision || 0) + 1,
      };
    });
  }
  return { modeIn, stateIn, list, preview, activate };
}
