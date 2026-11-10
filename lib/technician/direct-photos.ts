import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  MAX_PHOTO_BYTES,
  LEGACY_FILE_BYTES,
  PHOTO_TOO_LARGE_MESSAGE,
  assigned,
  type Actor,
} from "@/packages/fom-domain";
import { bucket } from "./documents";
import { TechnicianError } from "./errors";
import { installationService } from "@/lib/installations/service";
import type { Command } from "@/packages/fom-domain";

const lifetime = 10 * 60_000;
export type PhotoUpload = {
  ownerUid: string;
  fileId: string;
  workId: string;
  purpose: string;
  sheetId: string;
  equipmentId: string;
  name: string;
  size: number;
  contentType: string;
  digest: string;
  path: string;
  expiresAt: number;
};
function invalid(message = "Fotografie invalidă.", status = 400): never {
  throw new TechnicianError(message, status);
}
function target(form: FormData) {
  return Object.fromEntries(
    ["workId", "purpose", "sheetId", "equipmentId"].map((k) => [
      k,
      String(form.get(k) || ""),
    ]),
  );
}
/** Both issuing and consuming a permit require live assignment and an editable target. */
export async function assertPhotoTarget(a: Actor, form: FormData) {
  const t = target(form);
  if (
    !["photo", "installation"].includes(t.purpose) ||
    !/^[\w-]{1,160}$/.test(t.workId)
  )
    invalid();
  const work = (await adminDb.doc(`lucrari/${t.workId}`).get()).data();
  if (!work || !assigned(work, a) || work.raportDataLocked)
    invalid("Tichet inaccesibil.", 403);
  if (t.equipmentId && !/^[\w-]{1,160}$/.test(t.equipmentId)) invalid();
  if (t.purpose === "installation") {
    if (!/^[\w-]{1,160}$/.test(t.sheetId)) invalid();
    await installationService(adminDb).checkPhotoUpload(
      a,
      t.workId,
      t.sheetId,
      String(form.get("fileId")),
      form.has("sheetRevision") ? Number(form.get("sheetRevision")) : undefined,
      form.has("offlineStopCommand")
        ? (JSON.parse(String(form.get("offlineStopCommand"))) as Command)
        : undefined,
    );
  }
  return t;
}
function descriptor(a: Actor, form: FormData): PhotoUpload {
  let data: any;
  try {
    data = JSON.parse(String(form.get("photoUpload")));
  } catch {
    invalid();
  }
  const fileId = String(form.get("fileId") || ""),
    t = target(form);
  if (
    !/^[\w-]{8,120}$/.test(fileId) ||
    !data ||
    !["image/jpeg", "image/png"].includes(data.contentType) ||
    !Number.isSafeInteger(data.size) ||
    data.size <= LEGACY_FILE_BYTES ||
    typeof data.name !== "string" ||
    !data.name ||
    data.name.length > 200 ||
    typeof data.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.digest)
  )
    invalid();
  if (data.size > MAX_PHOTO_BYTES) invalid(PHOTO_TOO_LARGE_MESSAGE);
  return {
    ownerUid: a.uid,
    fileId,
    ...t,
    name: data.name,
    size: data.size,
    contentType: data.contentType,
    digest: data.digest,
    path: `mobile-uploads/${a.uid}/${fileId}`,
    expiresAt: Date.now() + lifetime,
  } as PhotoUpload;
}
export async function authorizePhoto(a: Actor, form: FormData) {
  await assertPhotoTarget(a, form);
  const value = descriptor(a, form),
    ref = adminDb.doc(`mobilePhotoUploads/${a.uid}_${value.fileId}`);
  await adminDb.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data();
    if (
      old &&
      Object.keys(value).some(
        (k) => k !== "expiresAt" && old[k] !== value[k as keyof PhotoUpload],
      )
    )
      invalid("Identificator reutilizat.", 409);
    tx.set(ref, value);
  });
  const ready = (
    await adminDb.doc(`mobileFiles/${a.uid}_${value.fileId}`).get()
  ).data();
  if (ready?.status === "ready") {
    if (
      ready.digest !== value.digest ||
      ready.workId !== value.workId ||
      ready.purpose !== value.purpose ||
      ready.sheetId !== value.sheetId
    )
      invalid("Identificator reutilizat.", 409);
    const { token, digest, status, ...completed } = ready;
    return { completed };
  }
  return { path: value.path, expiresAt: value.expiresAt };
}
export async function consumePhoto(a: Actor, form: FormData) {
  await assertPhotoTarget(a, form);
  const fileId = String(form.get("fileId") || "");
  if (!/^[\w-]{8,120}$/.test(fileId)) invalid();
  const permit = (
    await adminDb.doc(`mobilePhotoUploads/${a.uid}_${fileId}`).get()
  ).data() as PhotoUpload | undefined;
  const t = target(form);
  if (
    !permit ||
    permit.ownerUid !== a.uid ||
    permit.fileId !== fileId ||
    permit.path !== `mobile-uploads/${a.uid}/${fileId}` ||
    permit.expiresAt <= Date.now() ||
    Object.keys(t).some((k) => t[k] !== permit[k as keyof PhotoUpload]) ||
    String(form.get("directPhoto")) !== permit.path
  )
    invalid(
      "Autorizația fotografiei a expirat sau nu corespunde tichetului.",
      403,
    );
  const source = bucket().file(permit.path),
    [meta] = await source.getMetadata();
  if (
    Number(meta.size) !== permit.size ||
    meta.contentType !== permit.contentType ||
    meta.metadata?.ownerUid !== a.uid ||
    meta.metadata?.fileId !== fileId ||
    meta.metadata?.digest !== permit.digest
  )
    invalid("Fotografia nu corespunde autorizației.", 403);
  const [bytes] = await source.download();
  if (
    bytes.length !== permit.size ||
    bytes.length > MAX_PHOTO_BYTES ||
    createHash("sha256").update(bytes).digest("hex") !== permit.digest
  )
    invalid("Conținutul fotografiei s-a schimbat.", 403);
  return new File([new Uint8Array(bytes)], permit.name, {
    type: permit.contentType,
  });
}
/** Production uses an expiring GCS URL. The demo emulator has no URL-signing service. */
export async function photoDownloadUrl(
  path: string,
  file = bucket().file(path),
) {
  const expiresAt = Date.now() + 5 * 60_000;
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    const [metadata] = await file.getMetadata();
    const token = String(
      metadata.metadata?.firebaseStorageDownloadTokens || "",
    ).split(",")[0];
    return {
      url: `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresAt,
  });
  return { url, expiresAt };
}
