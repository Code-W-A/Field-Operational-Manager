import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { versionOf } from "@/packages/fom-domain";
import { signatures, workDate } from "@/lib/installations/validation";
import { sourceDocument, commitDocument } from "./documents";
import {
  assertActive,
  assertSource,
  check,
  clean,
  CONFIRMATION_TTL,
  DECLARATION,
  DECLARATION_VERSION,
  digest,
  email,
  equalToken,
  identifier,
  INVITATION_TTL,
  target,
  targetKey,
  token,
  validateSignatureImage,
  type Data,
  type Target,
} from "./core";

export type MailStage = "invite" | "confirm" | "final";
export type SigningDependencies = {
  secret: string;
  origin: string;
  now?: () => number;
  send: (
    request: Data,
    stage: MailStage,
    link: string,
  ) => Promise<{ status: "sent" | "simulated"; messageId?: string }>;
};
export function remoteSigning(db: Firestore, deps: SigningDependencies) {
  const now = deps.now || Date.now;
  const requests = db.collection("remoteSignatures"),
    targets = db.collection("remoteSignatureTargets");
  const initialToken = (r: Data) => token(deps.secret, r.id, "invite");
  const confirmationToken = (r: Data) =>
    token(deps.secret, r.id, "confirm", r.challengeNonce);
  const link = (r: Data, phase: "invite" | "confirm") =>
    `${deps.origin}/semneaza#${new URLSearchParams({ id: r.id, phase, token: phase === "invite" ? initialToken(r) : confirmationToken(r) })}`;
  const publicView = (r: Data) => ({
    id: r.id,
    target: r.target,
    status: r.status,
    expiresAt: r.expiresAt,
    hasRevision: r.document.tipLucrare === "Revizie",
    documentHash: r.documentHash,
    beneficiaryName: r.beneficiaryName || "",
    signature: r.signature || "",
    declaration: DECLARATION,
    declarationVersion: DECLARATION_VERSION,
    delivery: r.delivery || {},
    signedAt: r.signedAt || null,
  });
  const privateView = (r: Data) => ({
    ...publicView(r),
    signature: undefined,
    email: r.email,
    url:
      ["invited", "awaiting_confirmation"].includes(r.status) &&
      r.expiresAt > now()
        ? link(r, "invite")
        : undefined,
  });

  async function authorize(tx: any, uid: string, t: Target) {
    const user = (
      await tx.get(db.collection("users").doc(identifier(uid)))
    ).data();
    const work = (await tx.get(db.collection("lucrari").doc(t.workId))).data();
    check(
      user &&
        !user.disabled &&
        work &&
        (["admin", "dispecer"].includes(user.role) ||
          (user.role === "tehnician" &&
            (work.technicianIds?.includes(uid) ||
              work.tehnicieni?.includes(user.displayName)))),
      "Acces neautorizat.",
      403,
    );
  }
  async function latest(uid: string, raw: Data) {
    const t = target(raw);
    return db.runTransaction(async (tx) => {
      await authorize(tx, uid, t);
      const head = (await tx.get(targets.doc(targetKey(t)))).data();
      if (!head) return null;
      const ref = requests.doc(head.id),
        r = (await tx.get(ref)).data();
      if (!r) return null;
      if (["invited", "awaiting_confirmation"].includes(r.status)) {
        let status = r.expiresAt <= now() ? "expired" : r.status;
        if (status !== "expired") {
          try {
            assertSource(
              r,
              (await sourceDocument(db, tx, t, r.requesterUid)).source,
            );
          } catch (e) {
            if ((e as any).status && (e as any).status < 500)
              status = "invalidated";
            else throw e;
          }
        }
        if (status !== r.status) {
          tx.update(ref, { status, invalidatedAt: now() });
          r.status = status;
        }
      }
      return privateView(r);
    });
  }
  async function create(uid: string, input: Data) {
    const id = identifier(input.requestId),
      t = target(input),
      recipient = email(input.email),
      ref = requests.doc(id);
    await validateSignatureImage(input.technicianSignature);
    // Validate PNG bytes with the same validator used by official installation documents.
    signatures(
      {
        technicianSignature: input.technicianSignature,
        beneficiarySignature: input.technicianSignature,
        beneficiaryName: "Validare",
      },
      "",
    );
    const inputHash = digest({
      target: t,
      email: recipient,
      technicianSignature: input.technicianSignature,
      observations: input.observations || "",
      expectedVersion: input.expectedVersion ?? null,
    });
    const r = await db.runTransaction(async (tx) => {
      const prior = (await tx.get(ref)).data();
      if (prior) {
        check(
          prior.requesterUid === uid &&
            digest(prior.target) === digest(t) &&
            prior.email === recipient &&
            prior.inputHash === inputHash,
          "Identificator reutilizat cu alte date.",
          409,
        );
        await authorize(tx, uid, t);
        return prior;
      }
      const current = await sourceDocument(db, tx, t, uid);
      if (input.expectedVersion != null)
        check(
          String(input.expectedVersion) ===
            String(
              t.kind === "sheet"
                ? current.sheet!.revision
                : versionOf(current.work),
            ),
          "Documentul s-a modificat. Salvează și verifică din nou.",
          409,
        );
      const tr = targets.doc(targetKey(t)),
        head = (await tx.get(tr)).data();
      const oldRef = head ? requests.doc(head.id) : null;
      const old = oldRef ? (await tx.get(oldRef)).data() : null;
      check(
        !head || now() - head.createdAt >= 60000,
        "Așteaptă un minut înainte de o solicitare nouă.",
        429,
      );
      const observations = String(input.observations || "").trim();
      check(observations.length <= 12000, "Observațiile sunt prea lungi.");
      const document = clean({
        ...current.document,
        ...(t.kind === "completion"
          ? { observations, workDate: workDate(new Date(now())) }
          : {}),
        ...(t.kind === "report"
          ? {
              semnaturaTehnician: input.technicianSignature,
              numeTehnician: current.technicianName,
            }
          : {
              technicianSignature: input.technicianSignature,
              technicianName: current.technicianName,
            }),
      });
      const record = {
        id,
        inputHash,
        target: t,
        requesterUid: uid,
        email: recipient,
        technicianName: current.technicianName,
        technicianSignature: input.technicianSignature,
        sourceHash: digest(current.source),
        documentHash: digest(document),
        document,
        status: "invited",
        createdAt: now(),
        expiresAt: now() + INVITATION_TTL,
        declarationVersion: DECLARATION_VERSION,
        delivery: {},
      };
      check(
        Buffer.byteLength(JSON.stringify(record)) < 300000,
        "Documentul depășește limita semnării prin email.",
      );
      if (
        oldRef &&
        old &&
        ["invited", "awaiting_confirmation"].includes(old.status)
      )
        tx.update(oldRef, {
          status: "cancelled",
          cancelledAt: now(),
          cancelledBy: uid,
        });
      tx.create(ref, record);
      tx.set(tr, { id, createdAt: now() });
      return record;
    });
    await deliver(r.id, "invite");
    return latest(uid, t);
  }
  async function access(idValue: string, supplied: string, phase: string) {
    const id = identifier(idValue);
    return db.runTransaction(async (tx) => {
      const r = (await tx.get(requests.doc(id))).data();
      check(r && ["invite", "confirm"].includes(phase), "Link invalid.", 404);
      const expected =
        phase === "invite"
          ? initialToken(r)
          : r.challengeNonce
            ? confirmationToken(r)
            : "";
      check(expected && equalToken(expected, supplied), "Link invalid.", 404);
      check(r.expiresAt > now(), "Linkul a expirat.", 410);
      check(
        !["cancelled", "invalidated", "expired"].includes(r.status),
        "Solicitarea a fost anulată sau documentul modificat. Cereți un link nou.",
        409,
      );
      if (r.status !== "signed") {
        assertActive(r, now());
        assertSource(
          r,
          (await sourceDocument(db, tx, r.target, r.requesterUid)).source,
        );
      }
      // GET is strictly read-only, including links visited by email scanners.
      return r;
    });
  }
  async function submit(id: string, supplied: string, input: Data) {
    const r = await access(id, supplied, "invite");
    check(
      email(input.email) === r.email,
      "Introdu adresa exactă la care a fost trimisă solicitarea.",
    );
    check(input.accepted === true, "Confirmarea declarației este obligatorie.");
    const sig = signatures(
      {
        technicianSignature: r.technicianSignature,
        beneficiarySignature: input.signature,
        beneficiaryName: input.beneficiaryName,
      },
      r.technicianName,
    );
    await validateSignatureImage(sig.beneficiarySignature);
    const signatureHash = digest({
      signature: sig.beneficiarySignature,
      name: sig.beneficiaryName,
    });
    await db.runTransaction(async (tx) => {
      const ref = requests.doc(id),
        fresh = (await tx.get(ref)).data()!;
      assertActive(fresh, now());
      assertSource(
        fresh,
        (await sourceDocument(db, tx, fresh.target, fresh.requesterUid)).source,
      );
      if (
        fresh.submittedHash === signatureHash &&
        fresh.confirmExpiresAt > now()
      )
        return;
      check(
        !fresh.submittedAt || now() - fresh.submittedAt >= 60000,
        "Așteaptă un minut înainte de a înlocui semnătura.",
        429,
      );
      const nonce = randomUUID();
      tx.update(ref, {
        status: "awaiting_confirmation",
        signature: sig.beneficiarySignature,
        beneficiaryName: sig.beneficiaryName,
        submittedHash: signatureHash,
        submittedAt: now(),
        challengeNonce: nonce,
        confirmTokenHash: digest(token(deps.secret, id, "confirm", nonce)),
        confirmExpiresAt: Math.min(fresh.expiresAt, now() + CONFIRMATION_TTL),
        declarationAcceptedAt: now(),
        "delivery.confirm": { status: "pending", generation: nonce },
      });
    });
    await deliver(id, "confirm");
    return publicView(await access(id, supplied, "invite"));
  }
  async function confirm(id: string, supplied: string, accepted: boolean) {
    check(accepted === true, "Confirmarea explicită este obligatorie.");
    await db.runTransaction(async (tx) => {
      const ref = requests.doc(identifier(id)),
        r = (await tx.get(ref)).data();
      check(
        r && equalToken(r.confirmTokenHash || "", digest(supplied)),
        "Link de confirmare invalid.",
        404,
      );
      if (r.status === "signed") return;
      assertActive(r, now());
      check(
        r.status === "awaiting_confirmation" && r.confirmExpiresAt > now(),
        "Confirmarea a expirat. Solicită un email nou din pagina inițială.",
        410,
      );
      const current = await sourceDocument(db, tx, r.target, r.requesterUid);
      assertSource(r, current.source);
      const signedAt = new Date(now()).toISOString();
      const document = commitDocument(db, tx, r, current, signedAt);
      tx.update(ref, {
        status: "signed",
        signedAt,
        finalDocument: document,
        "delivery.final": { status: "pending" },
        confirmation: {
          accepted: true,
          at: signedAt,
          method: "email_link_and_button",
          declarationVersion: DECLARATION_VERSION,
          signatureHash: digest(r.signature),
          documentHash: r.documentHash,
        },
      });
    });
    await deliver(id, "final");
    return publicView(await access(id, supplied, "confirm"));
  }
  async function cancel(uid: string, id: string) {
    await db.runTransaction(async (tx) => {
      const ref = requests.doc(identifier(id)),
        r = (await tx.get(ref)).data();
      check(r, "Solicitare inexistentă.", 404);
      await authorize(tx, uid, r.target);
      check(r.status !== "signed", "Documentul este deja semnat.", 409);
      tx.update(ref, {
        status: "cancelled",
        cancelledAt: now(),
        cancelledBy: uid,
      });
    });
  }
  async function resend(uid: string, id: string) {
    const r = await db.runTransaction(async (tx) => {
      const r = (await tx.get(requests.doc(identifier(id)))).data();
      check(r, "Solicitare inexistentă.", 404);
      await authorize(tx, uid, r.target);
      if (r.status !== "signed") {
        assertActive(r, now());
        assertSource(
          r,
          (await sourceDocument(db, tx, r.target, r.requesterUid)).source,
        );
      }
      return r;
    });
    await deliver(id, r.status === "signed" ? "final" : "invite", true);
    return latest(uid, r.target);
  }
  async function resendConfirmation(id: string, supplied: string) {
    await access(id, supplied, "invite");
    await db.runTransaction(async (tx) => {
      const ref = requests.doc(id),
        r = (await tx.get(ref)).data()!;
      assertActive(r, now());
      check(r.signature, "Desenează semnătura mai întâi.");
      assertSource(
        r,
        (await sourceDocument(db, tx, r.target, r.requesterUid)).source,
      );
      check(
        now() - (r.confirmResentAt || r.submittedAt || 0) >= 60000,
        "Așteaptă un minut înainte de retrimitere.",
        429,
      );
      const nonce = randomUUID();
      tx.update(ref, {
        challengeNonce: nonce,
        confirmTokenHash: digest(token(deps.secret, id, "confirm", nonce)),
        confirmResentAt: now(),
        confirmExpiresAt: Math.min(r.expiresAt, now() + CONFIRMATION_TTL),
        "delivery.confirm": { status: "pending", generation: nonce },
      });
    });
    await deliver(id, "confirm");
    return publicView(await access(id, supplied, "invite"));
  }
  async function deliver(id: string, stage: MailStage, explicitRetry = false) {
    const claimId = randomUUID(),
      ref = requests.doc(id);
    const r = await db.runTransaction(async (tx) => {
      const r = (await tx.get(ref)).data()!;
      const state = r.delivery?.[stage];
      if (
        !explicitRetry &&
        state &&
        ["sent", "simulated", "sending", "unknown", "failed"].includes(
          state.status,
        )
      )
        return null;
      check(
        !state?.attemptAt || now() - state.attemptAt >= 60000,
        "Așteaptă un minut înainte de retrimitere.",
        429,
      );
      check(
        !state ||
          state.status !== "sending" ||
          now() - state.attemptAt > 120000,
        "Emailul este încă în curs de trimitere.",
        409,
      );
      check(
        (state?.attempts || 0) < 10,
        "Limita de retrimiteri a fost atinsă.",
        429,
      );
      if (stage === "final")
        check(r.status === "signed", "Documentul nu este semnat.", 409);
      else assertActive(r, now());
      tx.update(ref, {
        [`delivery.${stage}`]: {
          status: "sending",
          claimId,
          attemptAt: now(),
          attempts: (state?.attempts || 0) + 1,
        },
      });
      return r;
    });
    if (!r) return;
    let result: Data;
    try {
      result = await deps.send(
        r,
        stage,
        stage === "confirm" ? link(r, "confirm") : link(r, "invite"),
      );
    } catch {
      result = {
        status: "unknown",
        error:
          "Trimiterea emailului nu a putut fi confirmată. Poți reîncerca explicit; emailul anterior poate să fi ajuns.",
      };
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()!;
      if (current.delivery?.[stage]?.claimId !== claimId) return;
      tx.update(ref, {
        [`delivery.${stage}`]: {
          ...current.delivery[stage],
          ...clean(result),
          completedAt: now(),
        },
      });
    });
  }
  return {
    create,
    latest,
    cancel,
    resend,
    access,
    publicView,
    submit,
    confirm,
    resendConfirmation,
  };
}
