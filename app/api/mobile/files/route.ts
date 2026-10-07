import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "@/lib/mobile/documents";
import { mobileActor, headers, failure, options } from "@/lib/mobile/http";
import { MobileError } from "@/lib/mobile/service";
import { assigned } from "@/packages/fom-domain";
import { installationService } from "@/lib/installations/service";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function POST(request: NextRequest) {
  try {
    const a = await mobileActor(request),
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
    if (purpose !== "medical") {
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
    if (!["medical", "photo", "installation"].includes(purpose))
      throw new MobileError("Scop de fișier invalid.");
    const path = `mobile/${a.uid}/${workId || "medical"}/${fileId}`,
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
