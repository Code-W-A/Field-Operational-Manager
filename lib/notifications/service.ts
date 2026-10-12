import { createHash, timingSafeEqual } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import {
  FOM_PUSH_PROJECT_ID,
  NOTIFICATION_COLLECTIONS as C,
  type NotificationPage,
  type TicketNotification,
  activeNotificationWork,
  assigned,
} from "@/packages/fom-domain";
import { TechnicianError } from "@/lib/technician/service";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const fail = (message: string, status = 400): never => {
  throw new TechnicianError(message, status);
};
export function validateDevice(input: any, registering = true) {
  if (
    !Number.isSafeInteger(input?.generation) ||
    input.generation < 1 ||
    !input ||
    !/^[a-zA-Z0-9_-]{20,100}$/.test(input.installationId || "") ||
    !/^[a-f0-9]{64}$/.test(input.installationSecret || "")
  )
    fail("Instalare invalidă.");
  if (
    registering &&
    (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(
      input.expoToken || "",
    ) ||
      !["android", "ios"].includes(input.platform) ||
      input.projectId !== FOM_PUSH_PROJECT_ID)
  )
    fail("Token push sau proiect invalid.");
  return {
    deviceId: hash(`${FOM_PUSH_PROJECT_ID}:${input.installationId}`),
    secretHash: hash(input.installationSecret),
  };
}
export function ownsDeviceProof(stored: string, proof: string) {
  return (
    /^[a-f0-9]{64}$/.test(stored) &&
    /^[a-f0-9]{64}$/.test(proof) &&
    timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(proof, "hex"))
  );
}
function publicEvent(id: string, data: any): TicketNotification {
  return {
    id,
    uid: data.uid,
    kind: data.kind,
    title: data.title,
    body: data.body,
    createdAt: data.createdAt,
    readAt: data.readAt || null,
    ...(data.workId ? { workId: data.workId } : {}),
    ...(data.workIds ? { workIds: data.workIds } : {}),
    ...(data.changes ? { changes: data.changes } : {}),
  };
}
export function notificationService(db: Firestore) {
  const events = db.collection(C.events);
  async function register(uid: string, input: any) {
    const { deviceId, secretHash } = validateDevice(input);
    const ref = db.collection(C.devices).doc(deviceId);
    await db.runTransaction(async (tx) => {
      const old = await tx.get(ref);
      const duplicates = await tx.get(
        db.collection(C.devices).where("expoToken", "==", input.expoToken),
      );
      if (old.exists && !ownsDeviceProof(old.data()!.secretHash, secretHash))
        fail("Instalarea nu poate fi modificată.", 403);
      if (old.exists && (old.data()!.generation || 0) >= input.generation)
        fail("Înregistrare push depășită. Reîncearcă.", 409);
      for (const row of duplicates.docs)
        if (row.id !== deviceId)
          tx.update(row.ref, {
            enabled: false,
            updatedAt: new Date().toISOString(),
          });
      tx.set(ref, {
        uid,
        generation: input.generation,
        secretHash,
        expoToken: input.expoToken,
        projectId: input.projectId,
        platform: input.platform,
        enabled: !(
          old.data()?.disabledReason === "invalid_token" &&
          old.data()?.expoToken === input.expoToken
        ),
        disabledReason:
          old.data()?.disabledReason === "invalid_token" &&
          old.data()?.expoToken === input.expoToken
            ? "invalid_token"
            : null,
        updatedAt: new Date().toISOString(),
      });
    });
    return { deviceId };
  }
  async function unregister(_uid: string, input: any) {
    const { deviceId, secretHash } = validateDevice(input, false);
    if (typeof input.expectedUid !== "string" || !input.expectedUid)
      fail("Proprietar invalid.");
    await db.runTransaction(async (tx) => {
      const ref = db.collection(C.devices).doc(deviceId),
        snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          uid: input.expectedUid,
          generation: input.generation,
          secretHash,
          enabled: false,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      const data = snap.data()!;
      // The installation proof permits deferred cleanup after an account switch;
      // expectedUid prevents an old queued logout from disabling the new owner.
      if (!ownsDeviceProof(data.secretHash, secretHash))
        fail("Instalarea nu poate fi modificată.", 403);
      if (
        data.uid === input.expectedUid &&
        (data.generation || 0) <= input.generation
      )
        tx.update(ref, {
          enabled: false,
          generation: input.generation,
          updatedAt: new Date().toISOString(),
        });
    });
    return { ok: true };
  }
  async function revokeWithProof(input: any) {
    const { deviceId, secretHash } = validateDevice(input, false);
    if (typeof input.expectedUid !== "string" || !input.expectedUid)
      fail("Proprietar invalid.");
    const revoked = await db.runTransaction(async (tx) => {
      const ref = db.collection(C.devices).doc(deviceId),
        row = await tx.get(ref);
      const data = row.data();
      // This logout-only capability never creates records, reads user data or
      // enables a token. A wrong proof and a missing installation look alike.
      if (!data || !ownsDeviceProof(data.secretHash, secretHash)) return false;
      if (
        data.uid === input.expectedUid &&
        (data.generation || 0) <= input.generation
      )
        tx.update(ref, {
          enabled: false,
          generation: input.generation,
          updatedAt: new Date().toISOString(),
        });
      return true;
    });
    return { ok: true, revoked };
  }
  async function list(uid: string, cursor?: string): Promise<NotificationPage> {
    let q = events
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      if (!/^[a-f0-9]{64}$/.test(cursor)) fail("Cursor invalid.");
      const row = await events.doc(cursor).get();
      if (!row.exists || row.data()!.uid !== uid) fail("Cursor invalid.");
      q = q.startAfter(row);
    }
    const [rows, count] = await Promise.all([
      q.limit(31).get(),
      events.where("uid", "==", uid).where("readAt", "==", null).count().get(),
    ]);
    const page = rows.docs.slice(0, 30);
    return {
      items: page.map((row) => publicEvent(row.id, row.data())),
      cursor: rows.size > 30 ? page[page.length - 1].id : null,
      unreadCount: count.data().count,
    };
  }
  async function read(uid: string, notificationId: string) {
    if (!/^[a-f0-9]{64}$/.test(notificationId)) fail("Notificare invalidă.");
    const ref = events.doc(notificationId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()!.uid !== uid)
        fail("Notificarea nu este disponibilă.", 404);
      if (!snap.data()!.readAt)
        tx.update(ref, { readAt: new Date().toISOString() });
    });
    return { ok: true };
  }
  async function open(
    uid: string,
    notificationId: string,
    actor: { uid: string; displayName: string; role: string },
  ) {
    if (!/^[a-f0-9]{64}$/.test(notificationId)) fail("Notificare invalidă.");
    const row = await events.doc(notificationId).get();
    if (!row.exists || row.data()!.uid !== uid)
      fail("Notificarea nu este disponibilă.", 404);
    const event = publicEvent(row.id, row.data());
    const work = event.workId
      ? await db.collection("lucrari").doc(event.workId).get()
      : null;
    return {
      event,
      assigned:
        !!work?.exists &&
        assigned(work.data()!, actor) &&
        activeNotificationWork(work.data()!),
    };
  }
  return { register, unregister, revokeWithProof, list, read, open };
}
