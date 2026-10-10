import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { NextRequest } from "next/server";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local emulator required");
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-fom-mobile-auth";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET =
  "demo-fom-mobile-auth.appspot.com";
const app = initializeApp({
  projectId: "demo-fom-mobile-auth",
  storageBucket: "demo-fom-mobile-auth.appspot.com",
});
const db = getFirestore(app),
  uid = `selfie-test-${Date.now()}`,
  sessionId = `${uid}-session`;
let post: (r: NextRequest) => Promise<Response>;
before(async () => {
  const { fileHandlers } = await import("../../lib/technician/files-http");
  post = fileHandlers(async () => ({
    uid,
    role: "tehnician",
    displayName: uid,
  })).POST;
  await db.doc(`hrEmployees/${uid}`).set({ userUid: uid });
  await db
    .doc(`attendance/${sessionId}`)
    .set({ userId: uid, status: "active" });
});
async function upload(
  fileId: string,
  session = sessionId,
  kind = "checkin",
  bytes = new Uint8Array([255, 216, 255, 224, 0, 0, 255, 217]),
) {
  const body = new FormData();
  body.append(
    "file",
    new Blob([bytes as BlobPart], { type: "image/jpeg" }),
    "selfie.jpg",
  );
  body.append("fileId", fileId);
  body.append("sessionId", session);
  body.append("kind", kind);
  body.append("purpose", "attendance-selfie");
  const response = await post(
    new NextRequest("http://localhost/api/mobile/files", {
      method: "POST",
      body,
    }),
  );
  return { status: response.status, data: await response.json() };
}
test("selfie upload is owned, stable across retries, and rejects reused IDs or wrong content", async () => {
  const id = `${uid}-file`;
  const first = await upload(id),
    retry = await upload(id);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(
    first.data.path,
    `attendance/selfies/${uid}/${sessionId}/checkin-${id}.jpg`,
  );
  assert.equal(first.data.url, retry.data.url);
  assert.equal((await upload(id, sessionId, "checkout")).status, 409);
  assert.equal(
    (
      await upload(
        `${uid}-invalid`,
        sessionId,
        "checkin",
        new Uint8Array([1, 2, 3]),
      )
    ).status,
    400,
  );
});
test("selfie upload cannot use foreign session or escape owner path", async () => {
  await db.doc(`attendance/${uid}-foreign`).set({ userId: "other" });
  assert.equal(
    (await upload(`${uid}-foreign-file`, `${uid}-foreign`, "checkout")).status,
    403,
  );
  assert.equal(
    (await upload(`${uid}-path`, "../other", "checkin")).status,
    400,
  );
  assert.equal(
    (await upload(`${uid}-missing`, `${uid}-none`, "checkout")).status,
    403,
  );
});
after(async () => {
  await getStorage(app)
    .bucket()
    .deleteFiles({ prefix: `attendance/selfies/${uid}/` });
  await db.doc(`hrEmployees/${uid}`).delete();
  await db.doc(`attendance/${sessionId}`).delete();
  await db.doc(`attendance/${uid}-foreign`).delete();
  const files = await db.collection("mobileFiles").get();
  for (const file of files.docs)
    if (file.id.startsWith(`${uid}_`)) await file.ref.delete();
  await deleteApp(app);
});
