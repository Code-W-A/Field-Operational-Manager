import { createUserNumberingService } from "./user-numbering.server";
import { createHash, randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "@/lib/saga/config.server";
import { invoiceEditReason } from "./draft";
import {
  candidateNumbering,
  formatInvoiceNumber,
  nextInvoiceNumber,
  parseNumberingInput,
  InvoiceNumberingError,
  type NumberingConfig,
  type NumberingCounter,
  type NumberingPreview,
  type NumberingState,
  type NumberReservation,
} from "./numbering";
type Actor = { uid: string; role: string };
const key = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createInvoiceNumberingService(
  db: Firestore,
  config: () => SagaConfig = sagaConfig,
  now = () => new Date(),
) {
  const users = createUserNumberingService(db, config, now);
  const company = () => config().fiscalCode;
  const configRef = () => db.collection("invoiceNumbering").doc(company());
  const counterRef = (prefix: string) =>
    db.collection("invoiceCounters").doc(key([company(), prefix]));
  const reservationRef = (workId: string) =>
    db.collection("invoiceNumberReservations").doc(key([company(), workId]));
  const conflict = () =>
    new InvoiceNumberingError(
      "NUMBERING_CONFLICT",
      "Numerotarea s-a schimbat între timp. Reîncarcă și confirmă noua previzualizare.",
      409,
    );
  const id = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      v.length > 200 ||
      /[\/\x00-\x1f]/.test(v)
    )
      throw new InvoiceNumberingError(
        "INVALID_INPUT",
        "Identificator invalid.",
      );
    return v;
  };
  async function authorize(
    actor: Actor,
    admin = false,
    tx?: Transaction,
    write = false,
  ) {
    if (
      !actor?.uid ||
      !(admin ? ["admin"] : ["admin", "dispecer"]).includes(actor.role)
    )
      throw new InvoiceNumberingError(
        "FORBIDDEN",
        "Nu ai acces la numerotarea facturilor.",
        403,
      );
    const ref = db.collection("users").doc(actor.uid),
      user = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!user || user.disabled === true || user.role !== actor.role)
      throw new InvoiceNumberingError(
        "FORBIDDEN",
        "Nu ai acces la numerotarea facturilor.",
        403,
      );
    if (write && !config().readsEnabled)
      throw new InvoiceNumberingError(
        "NUMBERING_DISABLED",
        "Numerotarea nu este activată. Administratorul trebuie să finalizeze configurarea.",
        409,
      );
  }
  async function stateIn(
    tx: Transaction,
    actor?: Actor,
  ): Promise<NumberingState> {
    const mode = await users.modeIn(tx);
    if (mode?.mode === "per_user" && actor)
      return users.stateIn(tx, actor, mode);
    const c = (await tx.get(configRef())).data() as NumberingConfig | undefined;
    const counter = c
      ? ((await tx.get(counterRef(c.prefix))).data() as
          | NumberingCounter
          | undefined)
      : undefined;
    if (
      c &&
      (!counter ||
        c.counterId !== counterRef(c.prefix).id ||
        counter.fiscalCode !== company() ||
        counter.prefix !== c.prefix)
    )
      throw new InvoiceNumberingError(
        "INVALID_STATE",
        "Numerotarea necesită verificarea administratorului.",
        409,
      );
    return {
      mode: mode?.mode || "legacy",
      fiscalCode: company(),
      writesEnabled: config().readsEnabled,
      config: c || null,
      counter: counter || null,
      estimatedNumber: counter
        ? formatInvoiceNumber(
            counter.prefix,
            nextInvoiceNumber(counter.lastNumber),
            counter.width,
          )
        : null,
    };
  }
  async function get(actor: Actor) {
    await authorize(actor);
    return db.runTransaction((tx) => stateIn(tx, actor));
  }
  async function prepare(
    tx: Transaction,
    raw: unknown,
  ): Promise<NumberingPreview> {
    if ((await users.modeIn(tx))?.mode === "per_user")
      throw new InvoiceNumberingError(
        "USER_MODE_ACTIVE",
        "Numerotarea pe utilizator este activă. Folosește configurarea profilurilor și corecția contorului.",
        409,
      );
    const input = parseNumberingInput(raw),
      current = await stateIn(tx);
    const target =
      current.config?.prefix === input.prefix
        ? current.counter
        : ((await tx.get(counterRef(input.prefix))).data() as
            | NumberingCounter
            | undefined);
    const candidate = candidateNumbering(input, current.config, target || null);
    return {
      input,
      width: candidate.width,
      previousNumber: current.counter
        ? formatInvoiceNumber(
            current.counter.prefix,
            current.counter.lastNumber,
            current.counter.width,
          )
        : null,
      nextNumber: candidate.nextNumber,
      confirmationHash: key({
        fiscalCode: company(),
        input,
        config: current.config,
        counter: target || null,
        currentCounter: current.counter,
      }),
    };
  }
  async function preview(actor: Actor, input: unknown) {
    await authorize(actor, true);
    return db.runTransaction((tx) => prepare(tx, input));
  }
  async function put(actor: Actor, raw: unknown) {
    await authorize(actor, true, undefined, true);
    const body = raw as { confirmationHash?: unknown };
    return db.runTransaction(async (tx) => {
      await authorize(actor, true, tx, true);
      const p = await prepare(tx, raw);
      if (!body || body.confirmationHash !== p.confirmationHash)
        throw conflict();
      const state = await stateIn(tx),
        ref = counterRef(p.input.prefix);
      const priorCounter = (await tx.get(ref)).data() as
        | NumberingCounter
        | undefined;
      const candidate = candidateNumbering(
          p.input,
          state.config,
          priorCounter || null,
        ),
        at = now().toISOString();
      const counter: NumberingCounter = {
        fiscalCode: company(),
        prefix: p.input.prefix,
        width: candidate.width,
        lastNumber: candidate.lastNumber,
        allocationCount: priorCounter?.allocationCount || 0,
        revision: (priorCounter?.revision || 0) + 1,
        updatedAt: at,
      };
      const saved: NumberingConfig = {
        fiscalCode: company(),
        prefix: p.input.prefix,
        counterId: ref.id,
        width: candidate.width,
        revision: p.input.expectedRevision + 1,
        hasAllocated: state.config?.hasAllocated || !!counter.allocationCount,
        verifiedLast: candidate.lastNumber,
        verifiedAt: at,
        updatedBy: actor.uid,
        reason: p.input.reason,
        exclusiveConfirmed: true,
      };
      tx.set(ref, counter);
      tx.set(configRef(), saved);
      tx.set(configRef().collection("audit").doc(randomUUID()), {
        before: state,
        after: { config: saved, counter },
        reason: p.input.reason,
        updatedAt: at,
        updatedBy: actor.uid,
      });
      return {
        fiscalCode: company(),
        writesEnabled: config().readsEnabled,
        config: saved,
        counter,
        estimatedNumber: candidate.nextNumber,
      } satisfies NumberingState;
    });
  }
  async function estimate(actor: Actor, workId: string) {
    await authorize(actor);
    return db.runTransaction(async (tx) => {
      const work = await tx.get(db.collection("lucrari").doc(id(workId)));
      if (!work.exists)
        throw new InvoiceNumberingError(
          "NOT_FOUND",
          "Tichetul nu există.",
          404,
        );
      const reservation = (await tx.get(reservationRef(workId))).data() as
        | NumberReservation
        | undefined;
      const state = reservation ? null : await stateIn(tx, actor);
      const reason = reservation
        ? ""
        : invoiceEditReason(work.data()!) || state?.reason || "";
      return {
        fiscalCode: company(),
        number:
          reservation?.fullNumber ||
          (reason ? null : state?.estimatedNumber || null),
        reserved: !!reservation,
        issuer: reservation?.userNumbering || state?.user || null,
        reason,
      };
    });
  }
  // INTERNAL ONLY: XML preparation calls reserveIn in its atomic transaction,
  // after full fiscal validation. Draft saves never allocate numbers.
  async function reserve(
    actor: Actor,
    input: {
      workId: string;
      operationId: string;
      expectedDraftRevision: number;
    },
  ): Promise<NumberReservation> {
    await authorize(actor, false, undefined, true);
    id(input.workId);
    id(input.operationId);
    if (
      !Number.isSafeInteger(input.expectedDraftRevision) ||
      input.expectedDraftRevision < 1
    )
      throw new InvoiceNumberingError(
        "INVALID_INPUT",
        "Revizia ciornei este invalidă.",
      );
    return db.runTransaction((tx) => reserveIn(tx, actor, input));
  }
  async function reserveIn(
    tx: Transaction,
    actor: Actor,
    input: {
      workId: string;
      operationId: string;
      expectedDraftRevision: number;
    },
  ): Promise<NumberReservation> {
    await authorize(actor, false, undefined, true);
    const workId = id(input.workId),
      operationId = id(input.operationId);
    if (
      !Number.isSafeInteger(input.expectedDraftRevision) ||
      input.expectedDraftRevision < 1
    )
      throw new InvoiceNumberingError(
        "INVALID_INPUT",
        "Revizia ciornei este invalidă.",
      );
    await authorize(actor, false, tx, true);
    const operationRef = configRef()
      .collection("operations")
      .doc(key(operationId));
    const ref = reservationRef(workId);
    const [operation, existing] = await Promise.all([
      tx.get(operationRef),
      tx.get(ref),
    ]);
    if (operation.exists && operation.data()!.workId !== workId)
      throw conflict();
    if (existing.exists) {
      const reservation = existing.data() as NumberReservation;
      if (!operation.exists)
        tx.set(operationRef, { workId, reservationId: ref.id });
      return reservation;
    }
    if (operation.exists) throw conflict();
    const state = await stateIn(tx, actor);
    if (!state.config || !state.counter)
      throw new InvoiceNumberingError(
        "NOT_CONFIGURED",
        "Configurează numerotarea înainte de alocare.",
        409,
      );
    const [work, draft] = await Promise.all([
      tx.get(db.collection("lucrari").doc(workId)),
      tx.get(db.collection("invoiceDrafts").doc(workId)),
    ]);
    if (!work.exists || !draft.exists)
      throw new InvoiceNumberingError(
        "NOT_FOUND",
        "Tichetul sau ciorna nu există.",
        404,
      );
    if (invoiceEditReason(work.data()!))
      throw new InvoiceNumberingError(
        "DRAFT_READ_ONLY",
        invoiceEditReason(work.data()!),
        409,
      );
    if (draft.data()!.revision !== input.expectedDraftRevision)
      throw conflict();
    const number = nextInvoiceNumber(state.counter.lastNumber),
      at = now().toISOString();
    const reservation: NumberReservation = {
      ...(state.user ? { userNumbering: state.user } : {}),
      fiscalCode: company(),
      workId,
      operationId,
      draftRevision: input.expectedDraftRevision,
      counterId: state.config.counterId,
      prefix: state.counter.prefix,
      number,
      fullNumber: formatInvoiceNumber(
        state.counter.prefix,
        number,
        state.counter.width,
      ),
      allocatedAt: at,
      allocatedBy: actor.uid,
    };
    tx.update(counterRef(state.config.prefix), {
      lastNumber: number,
      allocationCount: state.counter.allocationCount + 1,
      revision: state.counter.revision + 1,
      updatedAt: at,
    });
    if (state.mode !== "per_user")
      tx.update(configRef(), { hasAllocated: true });
    tx.set(ref, reservation);
    tx.set(operationRef, { workId, reservationId: ref.id });
    return reservation;
  }
  return { get, preview, put, estimate, reserve, reserveIn, stateIn, users };
}
