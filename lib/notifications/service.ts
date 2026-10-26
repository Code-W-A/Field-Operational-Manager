import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import {
  FOM_PUSH_PROJECT_ID,
  activeNotificationWork,
  assigned,
  hasTicketCompletionDocument,
  NOTIFICATION_COLLECTIONS as C,
  type NotificationPage,
  type TicketNotification,
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
export function notificationService(db: Firestore, clock = () => new Date()) {
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
    const rows = await events
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .get();
    // Legacy deletions are reads. Convert lazily, rechecking transactionally so
    // an old client's concurrent restore cannot be overwritten by this snapshot.
    const legacy = rows.docs.filter(
      (row) => row.data().dismissedAt && !row.data().readAt,
    );
    for (let offset = 0; offset < legacy.length; offset += 200) {
      await db.runTransaction(async (tx) => {
        const snapshots = await tx.getAll(
          ...legacy.slice(offset, offset + 200).map((row) => row.ref),
        );
        for (const row of snapshots) {
          const data = row.data();
          if (data?.uid === uid && data.dismissedAt && !data.readAt)
            tx.update(row.ref, { readAt: data.dismissedAt });
        }
      });
    }
    const visible = rows.docs
      .filter((row) => !row.data().readAt && !row.data().dismissedAt)
      .map((row) => publicEvent(row.id, row.data()));
    // Enrich copy without using the work's status or existence as a list filter.
    const workIds = [
      ...new Set(
        visible.flatMap((event) => (event.workId ? [event.workId] : [])),
      ),
    ];
    for (let offset = 0; offset < workIds.length; offset += 100) {
      const works = await db.getAll(
        ...workIds
          .slice(offset, offset + 100)
          .map((id) => db.collection("lucrari").doc(id)),
      );
      const numbers = new Map(
        works.map((work) => [work.id, work.data()?.nrLucrare]),
      );
      for (const event of visible) {
        const number = event.workId && numbers.get(event.workId);
        if (number) event.workNumber = String(number);
      }
    }
    let after = visible;
    if (cursor) {
      if (!/^[a-f0-9]{64}$/.test(cursor)) fail("Cursor invalid.");
      const anchor = rows.docs.find((row) => row.id === cursor);
      if (!anchor) fail("Cursor invalid.");
      const createdAt = String(anchor!.data().createdAt);
      after = visible.filter(
        (row) =>
          row.createdAt < createdAt ||
          (row.createdAt === createdAt && row.id < cursor),
      );
    }
    const page = after.slice(0, 30);
    return {
      items: page,
      cursor: after.length > 30 ? page[page.length - 1].id : null,
      unreadCount: visible.filter((row) => !row.readAt).length,
    };
  }
  async function action(
    uid: string,
    input: { action?: string; id?: string; token?: string },
  ): Promise<{ ok: boolean; token?: string; changed?: number }> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      fail("Acțiune invalidă.");
    const now = clock().toISOString();
    if (input.action === "dismiss" || input.action === "restore") {
      if (!/^[a-f0-9]{64}$/.test(input.id || "")) fail("Notificare invalidă.");
      const ref = events.doc(input.id!);
      const token = randomUUID();
      return db.runTransaction(async (tx) => {
        const row = await tx.get(ref);
        if (!row.exists || row.data()!.uid !== uid)
          fail("Notificarea nu este disponibilă.", 404);
        const data = row.data()!;
        if (input.action === "restore") {
          if (
            !data.dismissedAt &&
            input.token &&
            data.lastRestoreToken === input.token
          )
            return { ok: true };
          if (
            !data.dismissedAt ||
            !input.token ||
            data.dismissalToken !== input.token ||
            Date.now() - Date.parse(data.dismissedAt) > 15000
          )
            fail("Anularea nu mai este disponibilă.", 409);
          tx.update(ref, {
            dismissedAt: null,
            dismissalToken: null,
            lastRestoreToken: input.token,
          });
          return { ok: true };
        }
        // A retry must not replace a newer dismissal or reset its undo window.
        if (data.dismissedAt) return { ok: true, token: data.dismissalToken };
        tx.update(ref, { dismissedAt: now, dismissalToken: token });
        return { ok: true, token };
      });
    }
    if (!["readAll", "dismissAll"].includes(input.action || ""))
      fail("Acțiune invalidă.");
    // The query snapshot freezes existing events. Event timestamps can use a
    // different clock/precision, so a timestamp cutoff can skip visible rows.
    const rows = await events.where("uid", "==", uid).get();
    let changed = 0;
    // Freeze the set at request start. Re-read in transactions so concurrent reads
    // and deletions cannot be overwritten by an old batch snapshot.
    for (let offset = 0; offset < rows.size; offset += 200) {
      changed += await db.runTransaction(async (tx) => {
        const snapshots = await tx.getAll(
          ...rows.docs.slice(offset, offset + 200).map((row) => row.ref),
        );
        let count = 0;
        snapshots.forEach((row) => {
          const data = row.data();
          if (!data || data.uid !== uid || data.dismissedAt) return;
          if (input.action === "readAll" && !data.readAt) {
            tx.update(row.ref, { readAt: now });
            count++;
          }
          if (input.action === "dismissAll") {
            tx.update(row.ref, { dismissedAt: now, dismissalToken: null });
            count++;
          }
        });
        return count;
      });
    }
    return { ok: true, changed };
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
    if (row.data()!.dismissedAt) fail("Notificarea nu este disponibilă.", 404);
    const event = publicEvent(row.id, row.data());
    if (event.kind === "withdrawn")
      fail("Notificarea nu mai este relevantă.", 404);
    const ids = event.workId ? [event.workId] : event.workIds || [];
    const accessible = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const works = await db.getAll(
        ...ids
          .slice(offset, offset + 100)
          .map((id) => db.collection("lucrari").doc(id)),
      );
      for (const work of works) {
        const data = work.data();
        if (
          data &&
          assigned(data, actor) &&
          activeNotificationWork(data) &&
          !hasTicketCompletionDocument(data) &&
          data.statusLucrare !== "Finalizat"
        ) {
          accessible.push(work.id);
          if (event.workId && data.nrLucrare)
            event.workNumber = String(data.nrLucrare);
        }
      }
    }
    if (!accessible.length) fail("Notificarea nu mai este relevantă.", 404);
    if (!event.workId) event.workIds = accessible;
    return { event, assigned: true };
  }

  return { register, unregister, revokeWithProof, list, read, open, action };
}
