import * as functions from "firebase-functions";
import { createHash, randomUUID } from "node:crypto";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  NOTIFICATION_COLLECTIONS as C, FOM_PUSH_PROJECT_ID,
  detectTicketNotifications, notificationRecipients, notificationCopy,
  activeNotificationWork, reminderEligible, dueReminder, overdueReminder,
  scheduleKey, locationKey, normalizedText,
  type NotificationWork, type NotificationUser, type NotificationKind, type NotificationChange,
} from "./notification-domain/notifications";
import { bucharestCalendar, ticketSchedule, overdueConfigFromSettings } from "./notification-domain/ticket-dashboard";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const enabled = () => process.env.FOM_NOTIFICATIONS_ENABLED === "true";
const live = () => enabled() && process.env.FOM_PUSH_SEND_ENABLED === "true" && !process.env.FUNCTIONS_EMULATOR && !process.env.FIRESTORE_EMULATOR_HOST;
const region = "europe-west1", zone = "Europe/Bucharest";
const titles = ["schedule", "location", "instructions"];
export const notificationId = (key: string, uid: string) => digest(`${key}:${uid}`);
type EventInput = {
  uid: string; kind: NotificationKind; workId?: string; workIds?: string[];
  changes?: NotificationChange[]; schedule?: string; location?: string; instructions?: string;
  createdAt: string; key: string;
};
type QueueRecord = { eventId: string; uid: string; deviceId: string; tokenHash: string; state: string; attempts: number; nextAttemptAt: string; ticketId?: string; receiptStartedAt?: string };

export function ticketNotificationRuntime(db: Firestore) {
  async function users(): Promise<NotificationUser[]> {
    const rows = await db.collection("users").where("role", "==", "tehnician").get();
    return rows.docs.map(row => ({ uid: row.id, ...row.data() }));
  }
  async function emit(input: EventInput) {
    const eventId = notificationId(input.key, input.uid), ref = db.collection(C.events).doc(eventId);
    const devices = await db.collection(C.devices).where("uid", "==", input.uid).where("enabled", "==", true).get();
    await db.runTransaction(async tx => {
      const headRef = input.workId && ["assigned", "withdrawn", "changed"].includes(input.kind) ? db.collection(C.heads).doc(digest(`${input.uid}:${input.workId}`)) : null;
      const old = await tx.get(ref);
      const head = headRef ? await tx.get(headRef) : null;
      if (old.exists) return;
      if (headRef && (!head?.exists || head.data()!.occurredAt < input.createdAt || (head.data()!.occurredAt === input.createdAt && head.data()!.eventId < eventId))) tx.set(headRef, { occurredAt: input.createdAt, eventId });
      const { key: _key, ...fields } = input;
      tx.create(ref, { ...fields, ...notificationCopy(input.kind, input.changes, input.workIds?.length), readAt: null });
      for (const device of devices.docs) {
        const d = device.data();
        if (d.projectId !== FOM_PUSH_PROJECT_ID) continue;
        tx.create(db.collection(C.deliveries).doc(digest(`${eventId}:${device.id}`)), {
          eventId, uid: input.uid, deviceId: device.id, tokenHash: digest(d.expoToken),
          state: "pending", attempts: 0, nextAttemptAt: new Date().toISOString(),
        });
      }
    });
    return eventId;
  }
  async function workChanged(workId: string, before: NotificationWork | null, after: NotificationWork | null, sourceEventId: string, occurredAt: string) {
    const people = await users();
    for (const change of detectTicketNotifications(before, after, people)) {
      await emit({ ...change, workId, createdAt: occurredAt, key: `change:${sourceEventId}`,
        ...(after ? { schedule: scheduleKey(after), location: locationKey(after), instructions: normalizedText(after.descriere) } : {}) });
    }
  }
  async function reminders(now: Date) {
    const people = await users(), calendar = bucharestCalendar(now);
    const morning = calendar.time >= "08:00:00" && calendar.time < "09:00:00";
    const settings = morning ? await db.collection("predefinedSettings").get() : null;
    const config = overdueConfigFromSettings(settings?.docs.map(row => ({ id: row.id, ...row.data() })) || []);
    const today = new Map<string, string[]>(), overdue = new Map<string, string[]>();
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    do {
      let query = db.collection("lucrari").orderBy("__name__").limit(200);
      if (cursor) query = query.startAfter(cursor);
      const rows = await query.get();
      if (rows.empty) break;
      for (const row of rows.docs) {
        const work = row.data();
        if (!reminderEligible(work)) continue;
        const recipients = notificationRecipients(work, people);
        for (const uid of recipients) {
          if (dueReminder(work, now)) await emit({ uid, kind: "reminder", workId: row.id, schedule: scheduleKey(work), createdAt: now.toISOString(), key: `reminder:${row.id}:${scheduleKey(work)}` });
          if (!morning) continue;
          const scheduled = ticketSchedule(work.dataInterventie);
          if (scheduled?.day === calendar.day && scheduled.time === "00:00:00") today.set(uid, [...(today.get(uid) || []), row.id]);
          if (overdueReminder(work, config, now)) overdue.set(uid, [...(overdue.get(uid) || []), row.id]);
        }
      }
      cursor = rows.docs[rows.docs.length - 1];
      if (rows.size < 200) break;
    } while (cursor);
    for (const [uid, workIds] of today) await emit({ uid, kind: "daily_today", workIds, createdAt: now.toISOString(), key: `daily_today:${calendar.day}` });
    for (const [uid, workIds] of overdue) await emit({ uid, kind: "daily_overdue", workIds, createdAt: now.toISOString(), key: `daily_overdue:${calendar.day}` });
  }
  async function currentRecipient(event: any, uid: string, eventId: string) {
    const profile = await db.collection("users").doc(uid).get();
    if (!profile.exists || profile.data()!.disabled || profile.data()!.role !== "tehnician") return false;
    const people = await users();
    if (event.workId) {
      if (["assigned", "withdrawn", "changed"].includes(event.kind)) {
        const head = await db.collection(C.heads).doc(digest(`${uid}:${event.workId}`)).get();
        if (head.data()?.eventId !== eventId) return false;
      }
      const work = await db.collection("lucrari").doc(event.workId).get();
      const recipient = work.exists && notificationRecipients(work.data()!, people).includes(uid);
      if (event.kind === "withdrawn") return !recipient;
      if (!recipient || !activeNotificationWork(work.data()!)) return false;
      if (event.kind === "reminder") return reminderEligible(work.data()!) && event.schedule === scheduleKey(work.data()!) && dueReminder(work.data()!, new Date());
      if (event.kind === "changed") {
        const w = work.data()!;
        return (event.changes || []).every((change: string) => !titles.includes(change) || ({ schedule: scheduleKey(w), location: locationKey(w), instructions: normalizedText(w.descriere) } as Record<string, string>)[change] === event[change === "schedule" ? "schedule" : change === "location" ? "location" : "instructions"]);
      }
      return true;
    }
    const now = new Date(), calendar = bucharestCalendar(now);
    if (event.createdAt.slice(0, 10) !== now.toISOString().slice(0, 10) || calendar.time >= "09:00:00") return false;
    const rows = await Promise.all((event.workIds || []).map((id: string) => db.collection("lucrari").doc(id).get()));
    const settings = await db.collection("predefinedSettings").get();
    const config = overdueConfigFromSettings(settings.docs.map(row => ({ id: row.id, ...row.data() })));
    const valid = rows.filter(row => row.exists && notificationRecipients(row.data()!, people).includes(uid) && reminderEligible(row.data()!) &&
      (event.kind === "daily_overdue" ? overdueReminder(row.data()!, config, now) : ticketSchedule(row.data()!.dataInterventie)?.day === calendar.day && ticketSchedule(row.data()!.dataInterventie)?.time === "00:00:00"));
    // Avoid a stale summary count after schedule/assignment changes.
    return valid.length === (event.workIds || []).length && valid.length > 0;
  }
  async function claim(id: string, allowedStates: string[], now = new Date()) {
    const lease = randomUUID(), ref = db.collection(C.deliveries).doc(id);
    return db.runTransaction(async tx => {
      const row = await tx.get(ref), data = row.data() as QueueRecord | undefined;
      if (!data || !allowedStates.includes(data.state) || data.nextAttemptAt > now.toISOString()) return null;
      if (data.state === "sending") {
        // An interrupted HTTP submission may already have reached Expo. Keep the
        // inbox event, but never automatically submit this ambiguous send twice.
        tx.update(ref, { state: "unknown", nextAttemptAt: now.toISOString() });
        return null;
      }
      tx.update(ref, { state: ["receipt", "checking_receipt"].includes(data.state) ? "checking_receipt" : "sending", lease, nextAttemptAt: new Date(now.getTime() + 120000).toISOString(), attempts: data.attempts + 1 });
      return { ...data, attempts: data.attempts + 1, id, lease };
    });
  }
  async function finish(job: QueueRecord & { id: string; lease: string }, patch: Record<string, any>) {
    const ref = db.collection(C.deliveries).doc(job.id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.data()?.lease === job.lease) tx.update(ref, { ...patch, lease: null });
    });
  }
  async function invalidate(job: QueueRecord) {
    const ref = db.collection(C.devices).doc(job.deviceId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.data()?.uid === job.uid && typeof snap.data()!.expoToken === "string" && digest(snap.data()!.expoToken) === job.tokenHash) tx.update(ref, { enabled: false, disabledReason: "invalid_token" });
    });
  }
  async function errorResult(job: QueueRecord & { id: string; lease: string }, code: string) {
    if (["DeviceNotRegistered", "InvalidExpoPushToken"].includes(code)) { await invalidate(job); await finish(job, { state: "invalid_token", errorCode: code }); }
    else if (code === "MessageRateExceeded" && job.attempts < 5) await finish(job, { state: "retry", errorCode: code, nextAttemptAt: new Date(Date.now() + 60000 * Math.pow(2, job.attempts)).toISOString() });
    else await finish(job, { state: "failed", errorCode: code });
  }
  async function dispatch(request: typeof fetch = fetch, verifyAuth: (uid: string) => Promise<boolean> = async uid => !(await getAuth().getUser(uid)).disabled) {
    for (const state of ["pending", "retry", "sending"]) {
      const rows = await db.collection(C.deliveries).where("state", "==", state).where("nextAttemptAt", "<=", new Date().toISOString()).limit(100).get();
      for (const row of rows.docs) {
        const job = await claim(row.id, [state]);
        if (!job) continue;
        try {
          const [eventRow, deviceRow] = await Promise.all([db.collection(C.events).doc(job.eventId).get(), db.collection(C.devices).doc(job.deviceId).get()]);
          const event = eventRow.data(), device = deviceRow.data();
          if (!event || !device?.enabled || device.uid !== job.uid || digest(device.expoToken) !== job.tokenHash || !(await verifyAuth(job.uid)) || !(await currentRecipient(event, job.uid, job.eventId))) { await finish(job, { state: "canceled" }); continue; }
          const response = await request("https://exp.host/--/api/v2/push/send", {
            method: "POST", headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
            body: JSON.stringify({ to: device.expoToken, title: event.title, body: event.body, sound: "default", channelId: "fom", priority: "high", ttl: event.kind === "reminder" ? 1800 : 3600, data: { type: "fom.ticket", eventId: job.eventId, uid: job.uid } }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) { await errorResult(job, response.status === 429 || response.status >= 500 ? "MessageRateExceeded" : "PushHttpError"); continue; }
          const payload = await response.json() as any, ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
          if (ticket?.status === "ok" && typeof ticket.id === "string") await finish(job, { state: "receipt", ticketId: ticket.id, receiptStartedAt: new Date().toISOString(), nextAttemptAt: new Date(Date.now() + 15 * 60000).toISOString() });
          else if (ticket?.status === "error") await errorResult(job, ticket.details?.error || "PushRejected");
          else await finish(job, { state: "unknown", errorCode: "InvalidPushResponse" });
        } catch { await finish(job, { state: "unknown", errorCode: "SubmissionUnconfirmed" }); }
      }
    }
  }
  async function receipts(request: typeof fetch = fetch) {
    // Receipt lookups are read-only at Expo and can safely be retried after a crash.
    for (const state of ["receipt", "checking_receipt"]) {
      const rows = await db.collection(C.deliveries).where("state", "==", state).where("nextAttemptAt", "<=", new Date().toISOString()).limit(100).get();
      for (const row of rows.docs) {
        const job = await claim(row.id, [state]);
        if (!job) continue;
        try {
          const response = await request("https://exp.host/--/api/v2/push/getReceipts", { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ ids: [job.ticketId] }), signal: AbortSignal.timeout(15000) });
          const payload = response.ok ? await response.json() as any : null, receipt = payload?.data?.[job.ticketId!];
          if (receipt?.status === "ok") await finish(job, { state: "provider_accepted", confirmedAt: new Date().toISOString() });
          else if (receipt?.status === "error") await errorResult(job, receipt.details?.error || "ReceiptRejected");
          else await finish(job, { state: Date.now() - Date.parse(job.receiptStartedAt!) > 86400000 ? "receipt_expired" : "receipt", nextAttemptAt: new Date(Date.now() + 5 * 60000).toISOString() });
        } catch { await finish(job, { state: "receipt", nextAttemptAt: new Date(Date.now() + 5 * 60000).toISOString() }); }
      }
    }
  }
  return { emit, workChanged, reminders, claim, dispatch, receipts };
}
export const onTicketNotificationChange = functions.region(region).runWith({ timeoutSeconds: 540, failurePolicy: true }).firestore.document("lucrari/{workId}").onWrite(async (change, context) => {
  if (!enabled()) return;
  await ticketNotificationRuntime(getFirestore()).workChanged(context.params.workId, change.before.exists ? change.before.data()! : null, change.after.exists ? change.after.data()! : null, context.eventId, context.timestamp);
});
export const scheduleTicketNotifications = functions.region(region).runWith({ timeoutSeconds: 540 }).pubsub.schedule("every 1 minutes").timeZone(zone).onRun(async () => {
  if (enabled()) await ticketNotificationRuntime(getFirestore()).reminders(new Date());
});
export const deliverTicketNotifications = functions.region(region).runWith({ timeoutSeconds: 540 }).pubsub.schedule("every 1 minutes").timeZone(zone).onRun(async () => {
  if (live()) await ticketNotificationRuntime(getFirestore()).dispatch();
});
export const checkTicketNotificationReceipts = functions.region(region).runWith({ timeoutSeconds: 540 }).pubsub.schedule("every 5 minutes").timeZone(zone).onRun(async () => {
  if (live()) await ticketNotificationRuntime(getFirestore()).receipts();
});
