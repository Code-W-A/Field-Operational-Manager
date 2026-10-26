import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  notificationService,
  validateDevice,
} from "../../lib/notifications/service";
import {
  ticketNotificationRuntime,
  notificationId,
} from "../../firebase-functions/src/ticket-notifications";
import {
  NOTIFICATION_COLLECTIONS as C,
  FOM_PUSH_PROJECT_ID,
  MOBILE_TERMS_VERSION,
} from "../../packages/fom-domain";
import { mobileAccessService } from "../../lib/mobile/access";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199"
)
  throw new Error("Local Emulator only");
const app = initializeApp(
    { projectId: "demo-fom-mobile-auth" },
    `push-${Date.now()}`,
  ),
  db = getFirestore(app);
const service = notificationService(db),
  runtime = ticketNotificationRuntime(db);
const a = "push-test-a",
  b = "push-test-b",
  workId = "push-test-work";
const actor = { uid: a, displayName: "Push A", role: "tehnician" };
const device = {
  installationId: "installation-test-abcdefghijklmnop",
  installationSecret: "a".repeat(64),
  generation: 1,
  expoToken: "ExpoPushToken[LOCAL_ONLY_A]",
  projectId: FOM_PUSH_PROJECT_ID,
  platform: "android",
};
const work = {
  tehnicieni: ["Push A"],
  technicianIds: [a],
  dataInterventie: "12.10.2026 10:00",
  statusLucrare: "Atribuită",
  descriere: "Instruction",
};
async function clear() {
  for (const collection of Object.values(C)) {
    const rows = await db.collection(collection).get();
    for (let offset = 0; offset < rows.size; offset += 400) {
      const batch = db.batch();
      rows.docs
        .slice(offset, offset + 400)
        .forEach((row) => batch.delete(row.ref));
      await batch.commit();
    }
  }
  const works = await db.collection("lucrari").get();
  for (const row of works.docs)
    if (row.id.startsWith("push-test")) await row.ref.delete();
  await db.doc(`lucrari/${workId}`).set(work);
}
before(async () => {
  await db.doc(`users/${a}`).set({ role: "tehnician", displayName: "Push A" });
  await db.doc(`users/${b}`).set({ role: "tehnician", displayName: "Push B" });
});
after(async () => {
  await clear();
  await db.doc(`lucrari/${workId}`).delete();
  await db.doc(`users/${a}`).delete();
  await db.doc(`users/${b}`).delete();
  await deleteApp(app);
});
const mockSend = (calls: any[], status = "ok") =>
  (async (_url: any, options: any) => {
    calls.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({
        data:
          status === "ok"
            ? { status: "ok", id: "receipt-test" }
            : { status: "error", details: { error: status } },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

test("devices support account transfer, token deduplication and generation protection against late logout/register", async () => {
  await clear();
  const registered = await service.register(a, device);
  await service.unregister(b, { ...device, generation: 2, expectedUid: a });
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    false,
  );
  await assert.rejects(() => service.register(a, device), /depășită/);
  await service.register(b, { ...device, generation: 3 });
  await service.unregister(a, { ...device, generation: 2, expectedUid: a });
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.uid,
    b,
  );
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    true,
  );
  await assert.rejects(
    () =>
      service.register(a, {
        ...device,
        generation: 4,
        installationSecret: "b".repeat(64),
      }),
    /modificată/,
  );
  const second = await service.register(b, {
    ...device,
    generation: 1,
    installationId: "installation-second-abcdefghijklmnop",
    installationSecret: "b".repeat(64),
  });
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    false,
  );
  assert.equal(
    (await db.doc(`${C.devices}/${second.deviceId}`).get()).data()!.enabled,
    true,
  );
  await service.register(a, {
    ...device,
    generation: 5,
    expoToken: "ExpoPushToken[LOCAL_ONLY_NEW]",
  });
  assert.equal(
    (await db.collection(C.devices).where("enabled", "==", true).get()).size,
    2,
  );
  assert.throws(() => validateDevice({ ...device, projectId: "foreign" }));
});
test("concurrent duplicate triggers save one event and one job per installation", async () => {
  await clear();
  await service.register(a, device);
  await Promise.all(
    [1, 2, 3].map(() =>
      runtime.workChanged(
        workId,
        null,
        work,
        "same-event",
        new Date().toISOString(),
      ),
    ),
  );
  assert.equal((await db.collection(C.events).get()).size, 1);
  assert.equal((await db.collection(C.deliveries).get()).size, 1);
});
test("out-of-order triggers retain history but send only the latest state", async () => {
  await clear();
  await service.register(a, device);
  const next = { ...work, descriere: "new" };
  await db.doc(`lucrari/${workId}`).set(next);
  await runtime.workChanged(
    workId,
    work,
    next,
    "newer",
    "2026-10-12T08:00:01.000Z",
  );
  await runtime.workChanged(
    workId,
    null,
    work,
    "older",
    "2026-10-12T08:00:00.000Z",
  );
  const calls: any[] = [];
  await runtime.dispatch(mockSend(calls), async () => true);
  assert.equal((await db.collection(C.events).get()).size, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.eventId, notificationId("change:newer", a));
});
test("unread withdrawal stays in the inbox without exposing a foreign ticket", async () => {
  await clear();
  await db
    .doc(`lucrari/${workId}`)
    .set({ ...work, tehnicieni: [], technicianIds: [] });
  await runtime.workChanged(
    workId,
    work,
    { ...work, tehnicieni: [], technicianIds: [] },
    "withdraw",
    new Date().toISOString(),
  );
  const id = notificationId("change:withdraw", a);
  assert.equal((await service.list(a)).unreadCount, 1);
  await assert.rejects(() => service.open(a, id, actor), /relevantă/);
  await assert.rejects(() => service.read(b, id), /disponibilă/);
  await service.read(a, id);
  await service.read(a, id);
  assert.equal((await service.list(a)).unreadCount, 0);
});
test("pagination uses a stable cursor and unread total independent of the page", async () => {
  await clear();
  const batch = db.batch();
  for (let i = 0; i < 105; i++)
    batch.set(db.doc(`${C.events}/${notificationId(`page:${i}`, a)}`), {
      uid: a,
      kind: "changed",
      title: "Test",
      workId,
      body: "Generic",
      createdAt: new Date(1700000000000 + i).toISOString(),
      readAt: null,
    });
  await batch.commit();
  const first = await service.list(a),
    second = await service.list(a, first.cursor!);
  assert.equal(first.items.length, 30);
  assert.equal(first.unreadCount, 105);
  assert.equal(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
    60,
  );
  await assert.rejects(() => service.list(b, first.cursor!), /Cursor/);
});
test("provider receipt is recorded, confirmed jobs are not resent and invalid tokens are disabled", async () => {
  await clear();
  const registered = await service.register(a, device);
  await runtime.workChanged(
    workId,
    null,
    work,
    "receipt",
    new Date().toISOString(),
  );
  const calls: any[] = [];
  await runtime.dispatch(mockSend(calls), async () => true);
  await runtime.dispatch(mockSend(calls), async () => true);
  assert.equal(calls.length, 1);
  const job = (await db.collection(C.deliveries).get()).docs[0];
  await job.ref.update({ nextAttemptAt: "2000-01-01T00:00:00.000Z" });
  await runtime.receipts(
    (async () =>
      new Response(
        JSON.stringify({ data: { "receipt-test": { status: "ok" } } }),
      )) as typeof fetch,
  );
  assert.equal((await job.ref.get()).data()!.state, "provider_accepted");
  await runtime.dispatch(mockSend(calls), async () => true);
  assert.equal(calls.length, 1);
  await runtime.workChanged(
    workId,
    work,
    { ...work, descriere: "badtoken" },
    "badtoken",
    new Date(Date.now() + 1).toISOString(),
  );
  await db.doc(`lucrari/${workId}`).update({ descriere: "badtoken" });
  await runtime.dispatch(
    mockSend(calls, "DeviceNotRegistered"),
    async () => true,
  );
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    false,
  );
});
test("ambiguous network submissions are kept in the inbox and never automatically resent", async () => {
  await clear();
  await service.register(a, device);
  await runtime.workChanged(
    workId,
    null,
    work,
    "unknown",
    new Date().toISOString(),
  );
  let calls = 0;
  const request = (async () => {
    calls++;
    throw new Error("Network lost after submission");
  }) as typeof fetch;
  await runtime.dispatch(request, async () => true);
  await runtime.dispatch(request, async () => true);
  assert.equal(calls, 1);
  assert.equal(
    (await db.collection(C.deliveries).get()).docs[0].data().state,
    "unknown",
  );
  assert.equal((await service.list(a)).items.length, 1);
});
test("reprogramming and account disablement cancel queued delivery", async () => {
  await clear();
  await service.register(a, device);
  await runtime.emit({
    uid: a,
    kind: "reminder",
    workId,
    schedule: "2026-10-12T10:00:00",
    key: "stale-reminder",
    createdAt: new Date().toISOString(),
  });
  await db
    .doc(`lucrari/${workId}`)
    .update({ dataInterventie: "13.10.2026 10:00" });
  const calls: any[] = [];
  await runtime.dispatch(mockSend(calls), async () => true);
  assert.equal(calls.length, 0);
  await runtime.workChanged(
    workId,
    null,
    work,
    "disabled",
    new Date().toISOString(),
  );
  await runtime.dispatch(mockSend(calls), async () => false);
  assert.equal(calls.length, 0);
});
test("08:00 summaries and per-ticket reminders are deduplicated without token registration", async () => {
  await clear();
  await db
    .doc(`lucrari/${workId}`)
    .update({ dataInterventie: "12.10.2026 00:00" });
  await db
    .doc("lucrari/push-test-past")
    .set({ ...work, dataInterventie: "11.10.2026 00:00" });
  await db.doc("lucrari/push-test-done").set({
    ...work,
    dataInterventie: "11.10.2026 00:00",
    raportGenerat: true,
    statusLucrare: "Finalizat",
  });
  await runtime.reminders(new Date("2026-10-12T05:00:00Z"));
  await runtime.reminders(new Date("2026-10-12T05:01:00Z"));
  const summaryService = notificationService(
    db,
    () => new Date("2026-10-12T05:01:00Z"),
  );
  const rows = (await summaryService.list(a)).items;
  assert.deepEqual(rows.map((r) => r.kind).sort(), [
    "daily_overdue",
    "daily_today",
  ]);
  assert.equal((await db.collection(C.deliveries).get()).size, 0);
  await runtime.reminders(new Date("2026-10-12T04:59:59Z"));
  assert.equal((await summaryService.list(a)).items.length, 2);
});
test("notifications API policy needs accepted terms but no attendance session", async () => {
  const access = mobileAccessService(db);
  await access.accept(a, { version: MOBILE_TERMS_VERSION, accepted: true });
  assert.equal((await access.requireAccess(a, false)).activeSessionId, null);
  await assert.rejects(() => access.requireAccess(a), /Pontează/);
});

test("logout capability revokes only the proven installation and preserves new owners", async () => {
  await clear();
  const registered = await service.register(a, device);
  assert.equal(
    (
      await service.revokeWithProof({
        ...device,
        generation: 2,
        expectedUid: a,
        installationSecret: "f".repeat(64),
      })
    ).revoked,
    false,
  );
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    true,
  );
  assert.equal(
    (
      await service.revokeWithProof({
        ...device,
        generation: 2,
        expectedUid: a,
      })
    ).revoked,
    true,
  );
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    false,
  );
  await service.register(b, { ...device, generation: 3 });
  await service.revokeWithProof({ ...device, generation: 2, expectedUid: a });
  assert.equal(
    (await db.doc(`${C.devices}/${registered.deviceId}`).get()).data()!.enabled,
    true,
  );
  const count = (await db.collection(C.devices).get()).size;
  assert.equal(
    (
      await service.revokeWithProof({
        ...device,
        installationId: "unknown-installation-abcdefghijklmnop",
        generation: 4,
        expectedUid: a,
      })
    ).revoked,
    false,
  );
  assert.equal((await db.collection(C.devices).get()).size, count);
});

test("indexed reminder projection follows current schedule and ignores stale trigger order", async () => {
  await clear();
  await runtime.workChanged(
    workId,
    null,
    work,
    "projection",
    new Date().toISOString(),
  );
  assert.equal(
    (await db.doc(`${C.schedules}/${workId}`).get()).data()!.reminderAt,
    "2026-10-12T06:30:00.000Z",
  );
  await runtime.timedReminders(new Date("2026-10-12T06:30:00Z"));
  await runtime.timedReminders(new Date("2026-10-12T06:31:00Z"));
  assert.equal(
    (await service.list(a)).items.filter((r) => r.kind === "reminder").length,
    1,
  );
  const next = { ...work, dataInterventie: "13.10.2026 12:00" };
  await db.doc(`lucrari/${workId}`).set(next);
  await runtime.workChanged(
    workId,
    null,
    work,
    "obsolete-projection",
    new Date().toISOString(),
  );
  assert.equal(
    (await db.doc(`${C.schedules}/${workId}`).get()).data()!.reminderAt,
    "2026-10-13T08:30:00.000Z",
  );
  await db.doc(`lucrari/${workId}`).update({ statusLucrare: "Finalizat" });
  await runtime.workChanged(
    workId,
    work,
    next,
    "final-projection",
    new Date().toISOString(),
  );
  assert.equal((await db.doc(`${C.schedules}/${workId}`).get()).exists, false);
});

test("temporary rejection retries while invalid tokens stay disabled until rotation", async () => {
  await clear();
  const registration = await service.register(a, device);
  await runtime.workChanged(
    workId,
    null,
    work,
    "temporary",
    new Date().toISOString(),
  );
  let rejected = 0;
  await runtime.dispatch(
    (async () => {
      rejected++;
      return new Response("", { status: 429 });
    }) as typeof fetch,
    async () => true,
  );
  const job = (await db.collection(C.deliveries).get()).docs[0];
  assert.equal((await job.ref.get()).data()!.state, "retry");
  await job.ref.update({ nextAttemptAt: "2000-01-01T00:00:00.000Z" });
  const accepted: any[] = [];
  await runtime.dispatch(mockSend(accepted), async () => true);
  await runtime.dispatch(mockSend(accepted), async () => true);
  assert.equal(rejected, 1);
  assert.equal(accepted.length, 1);
  await db
    .doc(`${C.devices}/${registration.deviceId}`)
    .update({ enabled: false, disabledReason: "invalid_token" });
  await service.register(a, { ...device, generation: 2 });
  assert.equal(
    (await db.doc(`${C.devices}/${registration.deviceId}`).get()).data()!
      .enabled,
    false,
  );
  await service.register(a, {
    ...device,
    generation: 3,
    expoToken: "ExpoPushToken[ROTATED_LOCAL_ONLY]",
  });
  assert.equal(
    (await db.doc(`${C.devices}/${registration.deviceId}`).get()).data()!
      .enabled,
    true,
  );
});

test("hourly reconciliation prepares existing timed works without retrospective assignment events", async () => {
  await clear();
  await db
    .doc(`lucrari/${workId}`)
    .update({ dataInterventie: "12.10.2099 10:00" });
  await runtime.reconcileSchedules();
  assert.equal((await db.doc(`${C.schedules}/${workId}`).get()).exists, true);
  assert.equal((await db.collection(C.events).get()).size, 0);
});

test("dismissal persists, undo is owner-scoped, and delayed push does not recreate it", async () => {
  await clear();
  await service.register(a, device);
  await runtime.workChanged(
    workId,
    null,
    work,
    "dismiss-test",
    new Date().toISOString(),
  );
  const id = notificationId("change:dismiss-test", a);
  const removed = await service.action(a, { action: "dismiss", id });
  assert(removed.token);
  assert.equal((await service.list(a)).items.length, 0);
  assert.equal((await service.list(a)).unreadCount, 0);
  assert.equal((await notificationService(db).list(a)).items.length, 0);
  await assert.rejects(() => service.open(a, id, actor), /disponibilă/);
  await assert.rejects(
    () => service.action(b, { action: "restore", id, token: removed.token }),
    /disponibilă/,
  );
  await assert.rejects(
    () => service.action(a, { action: "restore", id, token: "wrong" }),
    /Anularea/,
  );
  const calls: any[] = [];
  await runtime.dispatch(mockSend(calls), async () => true);
  assert.equal(calls.length, 0);
  const migrated = (await db.doc(`${C.events}/${id}`).get()).data()!;
  assert.equal(migrated.readAt, migrated.dismissedAt);
  await service.action(a, { action: "restore", id, token: removed.token });
  // Legacy restore remains accepted but cannot undo a confirmed read.
  assert.equal((await service.list(a)).unreadCount, 0);
  await service.action(a, { action: "restore", id, token: removed.token });
  await service.read(a, id);
  assert.equal((await service.list(a)).unreadCount, 0);
  const second = await service.action(a, { action: "dismiss", id });
  await db
    .doc(`${C.events}/${id}`)
    .update({ dismissedAt: new Date(Date.now() - 20000).toISOString() });
  await assert.rejects(
    () => service.action(a, { action: "restore", id, token: second.token }),
    /Anularea/,
  );
  assert.equal((await db.doc(`${C.events}/${id}`).get()).exists, true);
});

test("bulk operations include unloaded pages and clock-skewed events while preserving other owners", async () => {
  await clear();
  const batch = db.batch();
  for (let i = 0; i < 75; i++)
    batch.set(db.doc(`${C.events}/${notificationId(`bulk:${i}`, a)}`), {
      uid: a,
      kind: "changed",
      workId,
      title: "Test",
      body: "Test",
      readAt: null,
      createdAt: new Date(Date.now() - 1000 - i).toISOString(),
    });
  const foreign = notificationId("foreign", b),
    future = notificationId("future", a);
  batch.set(db.doc(`${C.events}/${foreign}`), {
    uid: b,
    kind: "changed",
    workId,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
  batch.set(db.doc(`${C.events}/${future}`), {
    uid: a,
    kind: "changed",
    workId,
    title: "Nou",
    body: "Nou",
    readAt: null,
    createdAt: new Date(Date.now() + 60000).toISOString(),
  });
  await batch.commit();
  assert.equal((await service.list(a)).items.length, 30);
  await service.action(a, { action: "readAll" });
  assert.equal((await service.list(a)).unreadCount, 0);
  assert.equal(
    (await db.doc(`${C.events}/${foreign}`).get()).data()!.readAt,
    null,
  );
  await service.action(a, { action: "dismissAll" });
  assert.deepEqual(
    (await service.list(a)).items.map((row) => row.id),
    [],
  );
  assert.equal(
    (await db.doc(`${C.events}/${foreign}`).get()).data()!.dismissedAt,
    undefined,
  );
});

test("old cursors remain usable after read/dismissal and obsolete tickets stay unread", async () => {
  await clear();
  const batch = db.batch();
  for (let i = 0; i < 40; i++)
    batch.set(db.doc(`${C.events}/${notificationId(`cursor:${i}`, a)}`), {
      uid: a,
      kind: "changed",
      workId,
      title: "Test",
      body: "Test",
      readAt: null,
      createdAt: new Date(Date.now() - 1000 - i).toISOString(),
    });
  await batch.commit();
  const page = await service.list(a);
  await service.action(a, { action: "dismiss", id: page.cursor! });
  assert.equal((await service.list(a, page.cursor!)).items.length, 10);
  await service.read(a, page.items[0].id);
  assert.equal((await service.list(a, page.cursor!)).items.length, 10);
  await db.doc(`lucrari/${workId}`).update({ statusLucrare: "Finalizat" });
  assert.equal((await service.list(a)).unreadCount, 38);
  assert.equal((await service.list(a)).items.length, 30);
  await db.doc(`lucrari/${workId}`).delete();
  assert.equal((await service.list(a)).items.length, 30);
  await assert.rejects(
    () => service.open(a, page.items[1].id, actor),
    /relevantă/,
  );
});

test("each unread assignment is listed and restore cannot revive a read assignment", async () => {
  await clear();
  const older = await runtime.emit({
    uid: a,
    kind: "assigned",
    workId,
    key: "assignment-old",
    createdAt: "2026-10-20T08:00:00.000Z",
  });
  const newer = await runtime.emit({
    uid: a,
    kind: "assigned",
    workId,
    key: "assignment-new",
    createdAt: "2026-10-21T08:00:00.000Z",
  });
  assert.deepEqual(
    (await service.list(a)).items.map((row) => row.id),
    [newer, older],
  );
  assert.equal((await service.list(a)).unreadCount, 2);
  await service.action(a, { action: "readAll" });
  assert.equal((await service.list(a)).unreadCount, 0);
  assert.ok((await db.doc(`${C.events}/${older}`).get()).data()!.readAt);
  const deleted = await service.action(a, { action: "dismiss", id: newer });
  assert.deepEqual((await service.list(a)).items, []);
  await service.action(a, {
    action: "restore",
    id: newer,
    token: deleted.token,
  });
  assert.deepEqual(
    (await service.list(a)).items.map((row) => row.id),
    [],
  );
});

test("legacy dismissal conversion is idempotent and preserves existing reads and other owners", async () => {
  await clear();
  const ids = ["legacy", "already-read", "foreign-legacy"].map((key) =>
    notificationId(key, a),
  );
  const dismissedAt = "2026-10-20T08:00:00.000Z";
  const readAt = "2026-10-19T08:00:00.000Z";
  for (let i = 0; i < ids.length; i++)
    await db
      .doc(`${C.events}/${ids[i]}`)
      .set({
        uid: i === 2 ? b : a,
        kind: "changed",
        workId,
        title: "Legacy",
        body: "Test",
        createdAt: dismissedAt,
        dismissedAt,
        readAt: i === 1 ? readAt : null,
      });
  assert.deepEqual((await service.list(a)).items, []);
  const before = await db.doc(`${C.events}/${ids[0]}`).get();
  assert.equal(before.data()!.readAt, dismissedAt);
  await service.list(a);
  assert.equal(
    (await before.ref.get()).updateTime!.isEqual(before.updateTime!),
    true,
  );
  assert.equal(
    (await db.doc(`${C.events}/${ids[1]}`).get()).data()!.readAt,
    readAt,
  );
  assert.equal(
    (await db.doc(`${C.events}/${ids[2]}`).get()).data()!.readAt,
    null,
  );
});

test("opening a read notification still checks access independently of the unread list", async () => {
  await clear();
  const id = await runtime.emit({
    uid: a,
    kind: "assigned",
    workId,
    key: "open-after-read",
    createdAt: new Date().toISOString(),
  });
  await service.read(a, id);
  assert.deepEqual((await service.list(a)).items, []);
  assert.equal((await service.open(a, id, actor)).event.id, id);
  await db
    .doc(`lucrari/${workId}`)
    .update({ technicianIds: [b], tehnicieni: ["Other"] });
  await assert.rejects(() => service.open(a, id, actor), /relevantă/);
  await assert.rejects(
    () => service.open(b, id, { ...actor, uid: b }),
    /disponibilă/,
  );
});

test("old daily summaries remain unread and new events survive an earlier bulk read", async () => {
  await clear();
  const old = await runtime.emit({
    uid: a,
    kind: "daily_today",
    workIds: ["missing-work"],
    key: "old-summary",
    createdAt: "2020-01-01T08:00:00.000Z",
  });
  assert.deepEqual(
    (await service.list(a)).items.map((row) => row.id),
    [old],
  );
  await service.action(a, { action: "readAll" });
  const fresh = await runtime.emit({
    uid: a,
    kind: "changed",
    workId,
    key: "after-bulk",
    createdAt: new Date().toISOString(),
  });
  const oldAccessible = await runtime.emit({
    uid: a,
    kind: "daily_today",
    workIds: [workId],
    key: "old-accessible-summary",
    createdAt: "2020-01-01T08:00:00.000Z",
  });
  // Age and schedule only affect push generation, never access to a valid ticket.
  assert.deepEqual(
    (await service.open(a, oldAccessible, actor)).event.workIds,
    [workId],
  );
  await service.read(a, oldAccessible);
  const page = await service.list(a);
  assert.deepEqual(
    page.items.map((row) => row.id),
    [fresh],
  );
  assert.equal(page.unreadCount, 1);
});
