import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "./documents";
import { headers, failure } from "./http";
import { TechnicianError as MobileError } from "./service";
import { assigned } from "@/packages/fom-domain";
import { installationService } from "@/lib/installations/service";
export function fileHandlers(resolveActor: (request: NextRequest) => Promise<import("@/packages/fom-domain").Actor>) {
async function POST(request: NextRequest) {
  try {
    const a = await resolveActor(request),
      form = await request.formData(),
      file = form.get("file"),
      fileId = String(form.get("fileId")),
      workId = String(form.get("workId") || ""),
      purpose = String(form.get("purpose"));
    if (
      !/^[\w-]{8,120}$/.test(fileId) ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 3000000 ||
      !["image/png", "image/jpeg", "application/pdf"].includes(file.type)
    )
      throw new MobileError(
        "Fișier invalid; limita este 3 MB (JPEG, PNG sau PDF).",
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const signatureOk =
      file.type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 5).toString() === "%PDF-";
    if (!signatureOk)
      throw new MobileError("Conținutul fișierului nu corespunde formatului.");
    const selfie = purpose === "attendance-selfie";
    const sessionId = String(form.get("sessionId") || "");
    const kind = String(form.get("kind") || "");
    if (selfie) {
      if (!/^[\w-]{1,160}$/.test(sessionId) || !["checkin", "checkout"].includes(kind) || file.type !== "image/jpeg")
        throw new MobileError("Selfie de pontaj invalid.");
      const session = await adminDb.doc(`attendance/${sessionId}`).get();
      if ((session.exists && session.data()?.userId !== a.uid) || (kind === "checkout" && !session.exists))
        throw new MobileError("Sesiune inaccesibilă.", 403);
      const employees = await adminDb.collection("hrEmployees").where("userUid", "==", a.uid).get();
      if (employees.size !== 1) throw new MobileError("Asociere HR necesară.", 403);
    } else if (purpose !== "medical") {
      if (!/^[\w-]{1,160}$/.test(workId) || file.type === "application/pdf")
        throw new MobileError("Fotografie invalidă.");
      const w = await adminDb.collection("lucrari").doc(workId).get();
      if (!assigned(w.data() || {}, a) || w.data()?.raportDataLocked)
        throw new MobileError("Tichet inaccesibil.", 403);
    } else {
      const emp = await adminDb
        .collection("hrEmployees")
        .where("userUid", "==", a.uid)
        .get();
      if (emp.size !== 1) throw new MobileError("Asociere HR necesară.", 403);
    }
    if (!["medical", "photo", "installation", "attendance-selfie"].includes(purpose))
      throw new MobileError("Scop de fișier invalid.");
    const path = selfie ? `attendance/selfies/${a.uid}/${sessionId}/${kind}-${fileId}.jpg` : `mobile/${a.uid}/${workId || "medical"}/${fileId}`,
      ref = adminDb.collection("mobileFiles").doc(`${a.uid}_${fileId}`),
      digest = createHash("sha256").update(bytes).digest("hex"),
      sheetId = String(form.get("sheetId") || "");
    const allocation = await adminDb.runTransaction(async (tx) => {
      const prior = await tx.get(ref);
      if (prior.exists) {
        if (
          prior.data()?.path !== path ||
          prior.data()?.digest !== digest ||
          prior.data()?.purpose !== purpose ||
          prior.data()?.sheetId !== sheetId
        )
          throw new MobileError("Identificator reutilizat.", 409);
        return prior.data()!;
      }
      const value = {
        path,
        digest,
        purpose,
        sheetId,
        token: randomUUID(),
        status: "uploading",
      };
      tx.set(ref, value);
      return value;
    });
    if (allocation.status === "ready") {
      const { token, digest, status, ...result } = allocation;
      return NextResponse.json(result, { headers: headers(request) });
    }
    const token = allocation.token;
    await bucket()
      .file(path)
      .save(bytes, {
        contentType: file.type,
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
      ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
      : "https://firebasestorage.googleapis.com";
    const meta = {
      id: fileId,
      path,
      url: `${storageHost}/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
      name: file.name,
      fileName: file.name,
      contentType: file.type,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      compressed: false,
      uploadedBy: a.uid,
      workId,
      purpose,
    };
    let result: any = meta;
    if (purpose === "installation") {
      const attached = await installationService(adminDb).attachPhoto(
        a,
        workId,
        sheetId,
        { id: fileId, path, name: file.name, contentType: file.type },
      );
      result = { ...meta, sheet: attached.sheet };
    }
    await ref.set({ ...allocation, ...result, status: "ready" });
    return NextResponse.json(result, { headers: headers(request) });
  } catch (e) {
    return failure(request, e);
  }
}

async function GET(request: NextRequest) {
  try {
    const a = await resolveActor(request),
      q = request.nextUrl.searchParams,
      workId = q.get("workId") || "",
      filePath = q.get("path") || "";
    if (!/^[\w-]{1,160}$/.test(workId) || !filePath || filePath.length > 1000)
      throw new MobileError("Fotografie invalidă.");
    const snap = await adminDb.doc(`lucrari/${workId}`).get(),
      w = snap.data();
    if (!w || !assigned(w, a))
      throw new MobileError("Fotografie inaccesibilă.", 403);
    let photos: any[] = w.imaginiDefecte || [];
    if (w.installation?.schemaVersion === 1) {
      const sheetId = q.get("sheetId") || undefined,
        list = await installationService(adminDb).list(
          a,
          workId,
          undefined,
          sheetId,
        );
      photos = list.sheets.flatMap((s: any) => s.photos || []);
    } else if (q.get("equipmentId")) {
      const equipmentId = q.get("equipmentId")!;
      if (!/^[\w-]{1,160}$/.test(equipmentId))
        throw new MobileError("Echipament invalid.");
      photos =
        (await snap.ref.collection("revisions").doc(equipmentId).get()).data()
          ?.photos || [];
    }
    if (!photos.some((p: any) => p.path === filePath))
      throw new MobileError("Fotografia nu este asociată documentului.", 403);
    const file = bucket().file(filePath),
      [metadata] = await file.getMetadata(),
      [bytes] = await file.download();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers(request),
        "Content-Type": metadata.contentType || "image/jpeg",
      },
    });
  } catch (e) {
    return failure(request, e);
  }
}

return {POST, GET};
}
