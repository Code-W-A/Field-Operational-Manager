import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  initializeApp as clientApp,
  deleteApp as deleteClient,
} from "firebase/app";
import {
  getAuth as clientAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore as clientDb,
  connectFirestoreEmulator,
  getDoc,
  setDoc,
  doc,
  terminate,
} from "firebase/firestore";
import {
  FOM_PUSH_PROJECT_ID,
  MOBILE_TERMS_VERSION,
  NOTIFICATION_COLLECTIONS as C,
} from "../../packages/fom-domain";
import { notificationId } from "../../firebase-functions/src/ticket-notifications";

test(
  "HTTP API enforces role, terms, notification ownership and attendance; Firestore denies direct access",
  { skip: process.env.FOM_PUSH_API_TEST !== "true" },
  async () => {
    if (
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189" ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199"
    )
      throw new Error("Local Emulator only");
    const projectId = "demo-fom-mobile-auth",
      prefix = `push-api-${Date.now()}`,
      app = initializeApp({ projectId }, prefix),
      db = getFirestore(app),
      auth = getAuth(app);
    const device = {
      installationId: prefix + "-installation",
      installationSecret: "c".repeat(64),
      generation: 1,
      expoToken: "ExpoPushToken[API_LOCAL_ONLY]",
      projectId: FOM_PUSH_PROJECT_ID,
      platform: "android",
    };
    const accounts = [
      { uid: prefix + "a", role: "tehnician" },
      { uid: prefix + "b", role: "tehnician" },
      { uid: prefix + "admin", role: "admin" },
    ];
    const tokens = new Map<string, string>();
    let client: ReturnType<typeof clientApp> | undefined,
      firestore: ReturnType<typeof clientDb> | undefined,
      deviceId: string | undefined;
    const eventId = notificationId(prefix, accounts[0].uid);
    const request = async (path: string, uid?: string, body?: object) => {
      const result = await fetch(`http://127.0.0.1:3000/api/mobile${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(uid ? { Authorization: `Bearer ${tokens.get(uid)}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: result.status, data: await result.json() };
    };
    try {
      for (const account of accounts) {
        await auth.createUser({
          uid: account.uid,
          email: account.uid + "@fom.test",
          password: "LocalPushTest123!",
        });
        await db
          .doc(`users/${account.uid}`)
          .set({
            role: account.role,
            displayName: account.uid,
            uid: account.uid,
          });
        const response = await fetch(
          "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: account.uid + "@fom.test",
              password: "LocalPushTest123!",
              returnSecureToken: true,
            }),
          },
        );
        tokens.set(account.uid, ((await response.json()) as any).idToken);
      }
      const a = accounts[0].uid,
        b = accounts[1].uid;
      assert.equal((await request("/notifications")).status, 401);
      assert.equal(
        (await request("/notifications", accounts[2].uid)).status,
        403,
      );
      assert.equal(
        (await request("/notifications", a)).data.code,
        "MOBILE_TERMS_REQUIRED",
      );
      for (const uid of [a, b])
        assert.equal(
          (
            await request("/terms", uid, {
              version: MOBILE_TERMS_VERSION,
              accepted: true,
            })
          ).status,
          200,
        );
      const registration = await request("/push/devices", a, device);
      assert.equal(registration.status, 200);
      deviceId = registration.data.deviceId;
      await db
        .doc(`${C.events}/${eventId}`)
        .set({
          uid: a,
          kind: "withdrawn",
          title: "Tichet retras",
          body: "Generic",
          createdAt: new Date().toISOString(),
          readAt: null,
          workId: prefix,
          instructions: "NOT_PUBLIC",
        });
      const list = await request("/notifications", a);
      assert.equal(list.status, 200);
      assert.equal(list.data.unreadCount, 1);
      assert.equal(list.data.contractVersion, 1);
      assert.equal(list.data.items[0].instructions, undefined);
      assert.equal((await request(`/notifications/${eventId}`, b)).status, 404);
      assert.equal(
        (await request("/notifications/read", b, { id: eventId })).status,
        404,
      );
      assert.equal(
        (await request(`/notifications/${eventId}`, a)).data.attendanceActive,
        false,
      );
      assert.equal(
        (await request(`/notifications/${eventId}`, a)).data.assigned,
        false,
      );
      await db
        .doc(`attendance/${prefix}`)
        .set({ userId: a, status: "active", sessionStart: Date.now() });
      assert.equal(
        (await request(`/notifications/${eventId}`, a)).data.attendanceActive,
        true,
      );
      assert.equal(
        (await request("/notifications/read", a, { id: eventId })).status,
        200,
      );
      assert.equal((await request("/notifications", a)).data.unreadCount, 0);
      assert.equal(
        (
          await request("/push/devices/unregister", a, {
            ...device,
            generation: 2,
            expectedUid: a,
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.doc(`${C.devices}/${deviceId}`).get()).data()!.enabled,
        false,
      );
      await request("/push/devices", a, { ...device, generation: 3 });
      assert.equal(
        (
          await request("/push/revoke", undefined, {
            ...device,
            generation: 4,
            expectedUid: a,
            installationSecret: "d".repeat(64),
          })
        ).data.revoked,
        false,
      );
      assert.equal(
        (await db.doc(`${C.devices}/${deviceId}`).get()).data()!.enabled,
        true,
      );
      assert.equal(
        (
          await request("/push/revoke", undefined, {
            ...device,
            generation: 4,
            expectedUid: a,
          })
        ).data.revoked,
        true,
      );
      assert.equal(
        (await db.doc(`${C.devices}/${deviceId}`).get()).data()!.enabled,
        false,
      );
      client = clientApp(
        { projectId, apiKey: "local-only", authDomain: "localhost" },
        prefix,
      );
      const ca = clientAuth(client);
      connectAuthEmulator(ca, "http://127.0.0.1:9199", {
        disableWarnings: true,
      });
      await signInWithEmailAndPassword(
        ca,
        a + "@fom.test",
        "LocalPushTest123!",
      );
      firestore = clientDb(client);
      connectFirestoreEmulator(firestore, "127.0.0.1", 8189);
      for (const collection of Object.values(C)) {
        await assert.rejects(
          () => getDoc(doc(firestore!, collection, eventId)),
          (e: any) => e.code === "permission-denied",
        );
        await assert.rejects(
          () => setDoc(doc(firestore!, collection, "forged"), { uid: a }),
          (e: any) => e.code === "permission-denied",
        );
      }
    } finally {
      if (firestore) await terminate(firestore);
      if (client) await deleteClient(client);
      await db.doc(`${C.events}/${eventId}`).delete();
      if (deviceId) await db.doc(`${C.devices}/${deviceId}`).delete();
      await db.doc(`attendance/${prefix}`).delete();
      for (const account of accounts) {
        await auth.deleteUser(account.uid).catch(() => {});
        await db.doc(`users/${account.uid}`).delete();
        await db
          .doc(
            `mobileTermsAcceptances/${account.uid}/versions/${MOBILE_TERMS_VERSION}`,
          )
          .delete();
      }
      await deleteApp(app);
    }
  },
);
