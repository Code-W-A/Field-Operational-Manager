import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import {
  FOM_PUSH_PROJECT_ID,
  NOTIFICATION_COLLECTIONS as C,
  type NotificationPage,
  type TicketNotification,
} from "@/packages/fom-domain";
import { inboxEvent } from "./inbox";
import { overdueConfigFromSettings } from "@/packages/fom-domain/ticket-dashboard";
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
  // Fetch the owner's event set so relevance and unread totals use the same
  // predicate, including legacy documents without dismissal fields. Work reads
  // are deduplicated and chunked; no migration or new Firestore index is needed.
  async function inbox(uid: string) {
    const [rows, user, settings] = await Promise.all([
      events
        .where("uid", "==", uid)
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc")
        .get(),
      db.collection("users").doc(uid).get(),
      db.collection("predefinedSettings").get(),
    ]);
    const actor = {
      uid,
      displayName: String(user.data()?.displayName || ""),
      role: "tehnician",
    };
    const candidates = rows.docs.filter((row) => !row.data().dismissedAt);
    const ids = [
      ...new Set(
        candidates.flatMap((row) => {
          const data = row.data();
          return data.workId ? [data.workId] : data.workIds || [];
        }),
      ),
    ] as string[];
    const works = new Map<string, Record<string, any>>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const snapshots = await db.getAll(
        ...ids
          .slice(offset, offset + 100)
          .map((id) => db.collection("lucrari").doc(id)),
      );
      snapshots.forEach((row) => {
        if (row.exists) works.set(row.id, row.data()!);
      });
    }
    const config = overdueConfigFromSettings(
      settings.docs.map((row) => ({ id: row.id, ...row.data() })),
    );
    const now = clock();
    const visible = candidates.flatMap((row) => {
      const event = inboxEvent(
        publicEvent(row.id, row.data()),
        actor,
        works,
        config,
        now,
      );
      return event ? [event] : [];
    });
    return { rows, visible };
  }
  async function list(uid: string, cursor?: string): Promise<NotificationPage> {
    const { rows, visible } = await inbox(uid);
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
    const now = new Date().toISOString();
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
    const rows = await events
      .where("uid", "==", uid)
      .where("createdAt", "<=", now)
      .get();
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
    const event = (await inbox(uid)).visible.find(
      (event) => event.id === notificationId,
    );
    if (!event) fail("Notificarea nu mai este relevantă.", 404);
    return { event: event!, assigned: true };
  }

  return { register, unregister, revokeWithProof, list, read, open, action };
}
