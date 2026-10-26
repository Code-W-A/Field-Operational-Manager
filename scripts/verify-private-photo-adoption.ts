/** Local fixture acceptance test. No production configuration is accepted. */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199"
)
  throw new Error("Local emulators required");
async function main() {
  initializeApp({ projectId: "demo-fom-mobile-auth" });
  const db = getFirestore();
  const auth = await fetch(
    "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "offline@fom.test",
        password: "FomTest123!",
        returnSecureToken: true,
      }),
    },
  );
  const { idToken } = await auth.json();
  assert(idToken);
  const head = (
    await db.doc("mobileDrafts/offline-tech/heads/offline-intervention").get()
  ).data();
  assert(head?.photos.length, "Run browser fixture first");
  const photo = head.photos[0];
  const send = async (saveId = head.saveId) => {
    const body = new FormData();
    body.set("fileId", photo.id);
    body.set("workId", head.workId);
    body.set("purpose", "photo");
    body.set(
      "privateDraft",
      JSON.stringify({ path: photo.path, draftId: head.draftId, saveId }),
    );
    assert(!body.has("file"), "The phone does not resend photo bytes");
    return fetch("http://127.0.0.1:3105/api/mobile/files", {
      method: "POST",
      headers: { Authorization: "Bearer " + idToken },
      body,
    });
  };
  const first = await send(),
    result = await first.json();
  assert.equal(first.status, 200, JSON.stringify(result));
  assert.equal(result.id, photo.id);
  assert(result.path.startsWith("mobile/offline-tech/"));
  const repeated = await send();
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).path, result.path);
  const invalid = await send("missing_receipt");
  assert.equal(invalid.status, 403);
  console.log(
    "PASS: real private-photo adoption, stable retry, invalid receipt rejected; no image bytes sent by phone",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
