import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  initializeApp as initializeAdmin,
  deleteApp as deleteAdmin,
} from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { getStorage as adminStorage } from "firebase-admin/storage";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getMetadata,
} from "firebase/storage";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  terminate,
} from "firebase/firestore";
import { NextRequest } from "next/server";
import {
  MAX_PHOTO_BYTES,
  LEGACY_FILE_BYTES,
  fileSizeLimit,
  mobileErrorCode,
} from "../../packages/fom-domain";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local emulator required");
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199";
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
const projectId = "demo-fom-mobile-auth";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = `${projectId}.appspot.com`;
const admin = initializeAdmin({
  projectId,
  storageBucket: `${projectId}.appspot.com`,
});
const db = adminFirestore(admin),
  bucket = adminStorage(admin).bucket();
const app = initializeApp(
  { projectId, apiKey: "demo-key", storageBucket: bucket.name },
  randomUUID(),
);
const auth = getAuth(app),
  storage = getStorage(app),
  firestore = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
connectStorageEmulator(storage, "127.0.0.1", 9198);
connectFirestoreEmulator(firestore, "127.0.0.1", 8189);
let uid: string,
  workId: string,
  handlers: ReturnType<
    typeof import("../../lib/technician/files-http").fileHandlers
  >;
let access: typeof import("../../lib/technician/http").mobileAccess,
  originalAccess: any,
  accessCalls = 0;
const ids: string[] = [];
before(async () => {
  uid = (await signInAnonymously(auth)).user.uid;
  workId = `photo-test-${uid}`;
  await db.doc(`users/${uid}`).set({ role: "tehnician", displayName: uid });
  await db
    .doc(`lucrari/${workId}`)
    .set({ technicianIds: [uid], imaginiDefecte: [] });
  const { fileHandlers } = await import("../../lib/technician/files-http");
  access = (await import("../../lib/technician/http")).mobileAccess;
  originalAccess = access.requireAccess;
  access.requireAccess = async () => {
    accessCalls++;
    return {} as any;
  };
  handlers = fileHandlers(
    async () => ({ uid, displayName: uid, role: "tehnician" }),
    true,
  );
});
function image(size: number, valid = true) {
  const b = new Uint8Array(size);
  if (valid) b.set([255, 216, 255, 224]);
  return b;
}
function form(id: string) {
  const f = new FormData();
  f.set("fileId", id);
  f.set("workId", workId);
  f.set("purpose", "photo");
  return f;
}
async function post(f: FormData) {
  const r = await handlers.POST(
    new NextRequest("http://localhost/api/mobile/files", {
      method: "POST",
      body: f,
    }),
  );
  return { status: r.status, data: await r.json() };
}
async function authorize(
  bytes: Uint8Array,
  contentType = "image/jpeg",
  id = randomUUID(),
) {
  ids.push(id);
  const f = form(id),
    digest = createHash("sha256").update(bytes).digest("hex");
  f.set("uploadMode", "authorize");
  f.set(
    "photoUpload",
    JSON.stringify({
      name: "photo.jpg",
      contentType,
      size: bytes.length,
      digest,
    }),
  );
  return { ...(await post(f)), id, digest, request: f, bytes, contentType };
}
async function transfer(
  p: Awaited<ReturnType<typeof authorize>>,
  bytes = p.bytes,
  metadata = {},
  type = p.contentType,
) {
  return uploadBytesResumable(ref(storage, p.data.path), bytes, {
    contentType: type,
    customMetadata: {
      ownerUid: uid,
      fileId: p.id,
      digest: p.digest,
      ...metadata,
    },
  });
}
async function finish(
  p: Awaited<ReturnType<typeof authorize>>,
  path = p.data.path,
) {
  const f = form(p.id);
  f.set("directPhoto", path);
  return post(f);
}
test("limits use decimal bytes and preserve the PDF limit and legacy message", () => {
  assert.equal(MAX_PHOTO_BYTES, 10_000_000);
  assert.equal(fileSizeLimit("image/png"), MAX_PHOTO_BYTES);
  assert.equal(fileSizeLimit("application/pdf"), LEGACY_FILE_BYTES);
  assert.equal(
    mobileErrorCode("Alege o fotografie de cel mult 10 MB."),
    "PHOTO_TOO_LARGE",
  );
  assert.equal(
    mobileErrorCode("Fișierul trebuie să aibă maximum 3 MB."),
    "FILE_TOO_LARGE",
  );
});
test("legacy 3 MB uploads remain valid and idempotent; PDF cannot exceed 3 MB", async () => {
  const id = randomUUID();
  ids.push(id);
  const f = form(id);
  f.set(
    "file",
    new Blob([image(LEGACY_FILE_BYTES)], { type: "image/jpeg" }),
    "photo.jpg",
  );
  const first = await post(f);
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal((await post(f)).data.path, first.data.path);
  const pdf = form(randomUUID());
  pdf.set("purpose", "medical");
  pdf.set("workId", "");
  pdf.set(
    "file",
    new Blob([image(LEGACY_FILE_BYTES + 1)], { type: "application/pdf" }),
    "file.pdf",
  );
  assert.equal((await post(pdf)).status, 400);
});
test("5 MB and exact 10 MB upload directly, recover lost responses and download outside the API", async () => {
  for (const [size, type] of [
    [5_000_000, "image/jpeg"],
    [MAX_PHOTO_BYTES, "image/jpeg"],
    [5_000_000, "image/png"],
  ] as const) {
    const bytes = image(size);
    if (type === "image/png") bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const p = await authorize(bytes, type);
    assert.equal(p.status, 200, JSON.stringify(p.data));
    await transfer(p);
    const result = await finish(p);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.size, size);
    assert.equal((await post(p.request)).data.completed.path, result.data.path);
    await db.doc(`lucrari/${workId}`).update({ imaginiDefecte: [result.data] });
    const q = new URLSearchParams({
      workId,
      path: result.data.path,
      delivery: "direct",
    });
    const r = await handlers.GET(
      new NextRequest(`http://localhost/api/mobile/files?${q}`),
    );
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type")!, /json/);
    const link = await r.json();
    assert(link.expiresAt > Date.now());
    const downloaded = await fetch(link.url);
    assert.equal(downloaded.status, 200);
    assert.equal((await downloaded.arrayBuffer()).byteLength, size);
    q.delete("delivery");
    const old = await handlers.GET(
      new NextRequest(`http://localhost/api/mobile/files?${q}`),
    );
    assert.equal((await old.arrayBuffer()).byteLength, size);
  }
  assert(accessCalls > 0);
});
test("oversized files, unsupported types and foreign targets cannot obtain a permit", async () => {
  assert.equal((await authorize(image(MAX_PHOTO_BYTES + 1))).status, 400);
  assert.equal(
    (await authorize(image(5_000_000), "application/pdf")).status,
    400,
  );
  const p = await authorize(image(5_000_000));
  p.request.set("workId", "foreign-work");
  assert.equal((await post(p.request)).status, 403);
});
test("Storage enforces size, MIME, owner, digest binding and immutability", async () => {
  const p = await authorize(image(5_000_000));
  await assert.rejects(() => transfer(p, image(5_000_001)), /unauthorized/);
  await assert.rejects(
    () => transfer(p, p.bytes, { ownerUid: "foreign" }),
    /unauthorized/,
  );
  await assert.rejects(
    () => transfer(p, p.bytes, { digest: "wrong" }),
    /unauthorized/,
  );
  await assert.rejects(
    () => transfer(p, p.bytes, {}, "image/png"),
    /unauthorized/,
  );
  await transfer(p);
  await assert.rejects(() => transfer(p), /unauthorized/);
  p.request.set(
    "photoUpload",
    JSON.stringify({
      name: "different.jpg",
      contentType: p.contentType,
      size: p.bytes.length,
      digest: p.digest,
    }),
  );
  assert.equal((await post(p.request)).status, 409);
});
test("expired permits block transfer/finalization; renewal recovers the same file", async () => {
  const p = await authorize(image(5_000_000));
  await db
    .doc(`mobilePhotoUploads/${uid}_${p.id}`)
    .update({ expiresAt: Date.now() - 1 });
  await assert.rejects(() => transfer(p), /unauthorized/);
  assert.equal((await finish(p)).status, 403);
  assert.equal((await post(p.request)).status, 200);
  await transfer(p);
  assert.equal((await finish(p)).status, 200);
});
test("finalization rejects changed bytes, false formats, foreign references and revoked assignments", async () => {
  const changed = await authorize(image(5_000_000)),
    altered = changed.bytes.slice();
  altered[100] = 7;
  await transfer(changed, altered);
  assert.equal((await finish(changed)).status, 403);
  const fake = await authorize(image(5_000_000, false));
  await transfer(fake);
  assert.equal((await finish(fake)).status, 400);
  const p = await authorize(image(5_000_000));
  await transfer(p);
  assert.equal((await finish(p, "mobile-uploads/foreign/file")).status, 403);
  await db.doc(`lucrari/${workId}`).update({ technicianIds: [] });
  assert.equal((await finish(p)).status, 403);
  await db.doc(`lucrari/${workId}`).update({ technicianIds: [uid] });
});
test("installation permits enforce principal, revision, four photos and idempotent attachment", async () => {
  const work = db.doc(`lucrari/${workId}`),
    original = (await work.get()).data()!;
  const sheet = work.collection("installationSheets").doc("sheet");
  await work.set({
    ...original,
    tipLucrare: "Instalare",
    tehnicieni: [uid],
    installation: { schemaVersion: 1, rootWorkId: workId },
  });
  await sheet.set({
    principalUid: uid,
    state: "draft",
    photos: [],
    revision: 0,
  });
  const p = await authorize(image(5_000_000)),
    id = randomUUID();
  ids.push(id);
  p.id = id;
  p.request.set("fileId", id);
  p.request.set("purpose", "installation");
  p.request.set("sheetId", "sheet");
  p.request.set("sheetRevision", "0");
  try {
    const issued = await post(p.request);
    assert.equal(issued.status, 200, JSON.stringify(issued));
    p.data = issued.data;
    await transfer(p);
    const final = form(id);
    final.set("purpose", "installation");
    final.set("sheetId", "sheet");
    final.set("sheetRevision", "0");
    final.set("directPhoto", p.data.path);
    const attached = await post(final);
    assert.equal(attached.status, 200, JSON.stringify(attached));
    assert.equal(
      (await post(p.request)).data.completed.path,
      attached.data.path,
    );
    assert.equal((await sheet.get()).data()?.photos.length, 1);
    const other = randomUUID();
    ids.push(other);
    p.request.set("fileId", other);
    assert.equal((await post(p.request)).status, 409);
    await sheet.update({ principalUid: "other" });
    assert.equal((await post(p.request)).status, 403);
    await sheet.update({
      principalUid: uid,
      revision: 0,
      photos: Array.from({ length: 4 }, (_, i) => ({ id: `other${i}` })),
    });
    assert.equal((await post(p.request)).status, 400);
  } finally {
    await sheet.delete();
    await work.set(original);
  }
});
test("both authorization and finalization require live mobile access", async () => {
  const p = await authorize(image(5_000_000));
  await transfer(p);
  const previous = access.requireAccess,
    { TechnicianError } = await import("../../lib/technician/errors");
  access.requireAccess = async () => {
    throw new TechnicianError("Acces revocat.", 403);
  };
  try {
    assert.equal((await post(p.request)).status, 403);
    assert.equal((await finish(p)).status, 403);
  } finally {
    access.requireAccess = previous;
  }
});
test("production downloads request a five-minute signed URL", async () => {
  const { photoDownloadUrl } =
    await import("../../lib/technician/direct-photos");
  const previous = process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    before = Date.now();
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const file = {
    getSignedUrl: async (options: any) => {
      assert.equal(options.action, "read");
      assert.equal(options.version, "v4");
      assert(
        options.expires >= before + 300_000 &&
          options.expires <= Date.now() + 300_000,
      );
      return ["https://storage.googleapis.com/bucket/photo?signed=1"];
    },
  };
  try {
    assert.match(
      (await photoDownloadUrl("mobile/photo", file as any)).url,
      /signed=1/,
    );
  } finally {
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = previous;
  }
});
test("permits are server-only; another identity cannot read or create the staged object", async () => {
  const p = await authorize(image(5_000_000));
  await transfer(p);
  await assert.rejects(
    () => getDoc(doc(firestore, `mobilePhotoUploads/${uid}_${p.id}`)),
    /permission/,
  );
  await assert.rejects(
    () =>
      setDoc(doc(firestore, `mobilePhotoUploads/${uid}_${p.id}`), {
        expiresAt: Date.now() + 999999,
      }),
    /permission/,
  );
  await signOut(auth);
  await signInAnonymously(auth);
  await assert.rejects(
    () => getMetadata(ref(storage, p.data.path)),
    /unauthorized/,
  );
  await assert.rejects(() => transfer(p), /unauthorized/);
});
after(async () => {
  if (access) access.requireAccess = originalAccess;
  for (const id of ids) {
    await db.doc(`mobilePhotoUploads/${uid}_${id}`).delete();
    await db.doc(`mobileFiles/${uid}_${id}`).delete();
  }
  await bucket.deleteFiles({ prefix: `mobile-uploads/${uid}/` });
  await bucket.deleteFiles({ prefix: `mobile/${uid}/` });
  await db.doc(`users/${uid}`).delete();
  await db.doc(`lucrari/${workId}`).delete();
  await terminate(firestore);
  await deleteApp(app);
  await deleteAdmin(admin);
});
