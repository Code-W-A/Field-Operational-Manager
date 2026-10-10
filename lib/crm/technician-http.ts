import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { randomUUID, createHash } from "node:crypto";
import { adminApp, adminDb, adminAuth } from "../firebase/admin";
import {
  mobileActor,
  technicianActor,
  headers,
  options,
  failure,
} from "../technician/http";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import {
  CRM_CONTRACT_VERSION,
  crmRecordActions,
  type CrmCommand,
} from "@/packages/fom-domain/crm";
import { technicianCrmService, CrmError, crmJson } from "./technician-service";
import { isCrmInboxEnabled, listCrmInboxMessages } from "./inbox";
import { syncCrmInboxFromImap } from "./inbox-sync.server";
import {
  CRM_INBOX_CATEGORIES,
  CRM_INBOX_STATUSES,
  CRM_INBOX_LINK_STATES,
} from "./inbox-types";
import { CRM_COLLECTIONS } from "./constants";
const service = technicianCrmService(adminDb);
export { options };
function ok(request: NextRequest, data: Record<string, unknown>) {
  return NextResponse.json(
    {
      contractVersion: FOM_CONTRACT_VERSION,
      crmContractVersion: CRM_CONTRACT_VERSION,
      ...crmJson(data),
    },
    { headers: headers(request) },
  );
}
export async function crmHttp(request: NextRequest, mobile: boolean) {
  try {
    const a = mobile
      ? await mobileActor(request)
      : await technicianActor(request);
    const bearer = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (bearer && (await adminAuth.verifyIdToken(bearer, true)).uid !== a.uid)
      throw new CrmError("Sesiunea s-a schimbat. Reautentifică-te.", 401);
    const path = request.nextUrl.pathname.replace(
        /^\/api\/(mobile|technician)\/crm\/?/,
        "",
      ),
      q = request.nextUrl.searchParams;
    if (request.method === "GET") {
      if (path === "opportunities")
        return ok(request, { items: await service.list(a.uid) });
      if (path === "detail")
        return ok(request, {
          detail: await service.detail(a.uid, q.get("id") || ""),
        });
      if (path === "options")
        return ok(request, { options: await service.options(a.uid) });
      if (path === "contacts")
        return ok(request, {
          items: await service.contacts(q.get("clientId") || ""),
        });
      if (path === "internal")
        return ok(request, await service.internal(a.uid));
      if (path === "thread")
        return ok(request, await service.thread(a.uid, q.get("id") || ""));
      if (path === "receipt")
        return ok(request, {
          result: await service.receipt(a.uid, q.get("id") || ""),
        });
      if (path === "inbox") {
        if (!isCrmInboxEnabled())
          throw new CrmError("Inboxul CRM este dezactivat.", 404);
        const status = q.get("status") || undefined,
          category = q.get("category") || undefined,
          linkState = q.get("linkState") || undefined;
        for (const [v, values] of [
          [status, CRM_INBOX_STATUSES],
          [category, CRM_INBOX_CATEGORIES],
          [linkState, CRM_INBOX_LINK_STATES],
        ] as const)
          if (v && !(values as readonly string[]).includes(v))
            throw new CrmError("Filtru inbox invalid.");
        const inbox = await listCrmInboxMessages(
          {
            status: status as any,
            category: category as any,
            linkState: linkState as any,
            limit: 100,
          },
          a.uid,
        );
        return ok(request, {
          ...inbox,
          items: inbox.items.map((r) => ({
            ...r,
            allowedActions: crmRecordActions("inbox", r, a.uid),
          })),
        });
      }
      if (path === "download") return await download(request, a.uid, q);
    }
    if (request.method === "POST") {
      if (path === "commands") {
        const command = (await request.json()) as CrmCommand;
        if (
          (command.action?.startsWith("inbox.") ||
            command.payload?.inboxMessageId) &&
          !isCrmInboxEnabled()
        )
          throw new CrmError("Inboxul CRM este dezactivat.", 404);
        return ok(request, { result: await service.command(a.uid, command) });
      }
      if (path === "sync") {
        if (!isCrmInboxEnabled())
          throw new CrmError("Inboxul CRM este dezactivat.", 404);
        const result = await syncCrmInboxFromImap(a.uid);
        if (!result.ok)
          throw new CrmError(
            result.error,
            result.reason === "not_configured" ? 503 : 500,
          );
        return ok(request, { sync: result });
      }
      if (path === "equipment-photo") return await uploadPhoto(request, a.uid);
    }
    throw new CrmError("Ruta CRM nu există.", 404);
  } catch (e) {
    if (e instanceof CrmError)
      return NextResponse.json(
        {
          error: e.message,
          kind:
            e.status === 409
              ? "conflict"
              : e.status >= 500
                ? "retryable"
                : e.status === 403
                  ? "blocked"
                  : "validation",
        },
        { status: e.status, headers: headers(request) },
      );
    return failure(request, e);
  }
}
const id = (v: string | null) => {
  if (!v || !/^[\w.-]{1,180}$/.test(v))
    throw new CrmError("Identificator invalid.");
  return v;
};
function bucket() {
  return getStorage(adminApp).bucket(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  );
}
async function download(request: NextRequest, uid: string, q: URLSearchParams) {
  const kind = q.get("kind"),
    recordId = id(q.get("id"));
  let path = "",
    name = "";
  if (kind === "file") {
    const r = await adminDb
      .collection(CRM_COLLECTIONS.files)
      .doc(recordId)
      .get();
    if (!r.exists) throw new CrmError("Fișier inexistent.", 404);
    const detail = await service.detail(uid, r.data()!.opportunityId),
      file = detail.files.find((f) => f.id === recordId);
    if (!file) throw new CrmError("Nu ai acces la fișier.", 403);
    path = file.storagePath || "";
    name = file.filename || "Fisier_FOM";
    if (!path && file.url) {
      const match = String(file.url).match(/\/o\/([^?]+)/);
      if (match) path = decodeURIComponent(match[1]);
    }
  } else if (kind === "offer" || kind === "certified") {
    const r = await adminDb
      .collection(CRM_COLLECTIONS.offers)
      .doc(recordId)
      .get();
    if (!r.exists) throw new CrmError("Ofertă inexistentă.", 404);
    await service.opportunity(uid, r.data()!.opportunityId);
    const offer = r.data()!;
    path =
      kind === "offer"
        ? offer.pdfStoragePath
        : offer.responseCertifiedPdf?.storagePath;
    name =
      kind === "offer"
        ? offer.pdfFilename
        : offer.responseCertifiedPdf?.filename;
  } else throw new CrmError("Tip descărcare invalid.");
  if (!path) throw new CrmError("Documentul nu are un fișier disponibil.", 404);
  const object = bucket().file(path);
  const [exists] = await object.exists();
  if (!exists) throw new CrmError("Fișierul nu există.", 404);
  const [metadata] = await object.getMetadata();
  if (Number(metadata.size) > 30 * 1024 * 1024)
    throw new CrmError("Fișierul depășește limita de descărcare.");
  const [data] = await object.download();
  return new NextResponse(new Uint8Array(data), {
    headers: {
      ...headers(request),
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${String(
        name || "Document_FOM.pdf",
      )
        .normalize("NFD")
        .replace(/[^\w. -]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function uploadPhoto(request: NextRequest, uid: string) {
  const form = await request.formData(),
    file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
    throw new CrmError("Fotografia trebuie să aibă maximum 5 MB.");
  const clientId = id(String(form.get("clientId") || "")),
    locationId = id(String(form.get("locationId") || "")),
    equipmentId = id(String(form.get("equipmentId") || "")),
    fileId = id(String(form.get("fileId") || ""));
  const c = await adminDb.collection("clienti").doc(clientId).get();
  if (c.data()?.crmCreatedById !== uid)
    throw new CrmError("Nu ai acces la fotografiile clientului.", 403);
  if (
    !c
      .data()
      ?.locatii?.some(
        (l: any) =>
          l.id === locationId &&
          l.echipamente?.some((e: any) => e.id === equipmentId),
      )
  )
    throw new CrmError("Echipament inexistent.", 404);
  const data = Buffer.from(await file.arrayBuffer()),
    jpg = data[0] === 255 && data[1] === 216 && data[2] === 255,
    png = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    webp =
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP";
  const type = jpg
    ? "image/jpeg"
    : png
      ? "image/png"
      : webp
        ? "image/webp"
        : "";
  if (!type || type !== file.type) throw new CrmError("Imagine invalidă.");
  const hash = createHash("sha256").update(data).digest("hex"),
    r = adminDb.collection("crm_equipment_uploads").doc(`${uid}-${fileId}`),
    old = await r.get();
  if (old.exists) {
    if (
      old.data()?.hash !== hash ||
      old.data()?.clientId !== clientId ||
      old.data()?.locationId !== locationId ||
      old.data()?.equipmentId !== equipmentId
    )
      throw new CrmError("Identificator fotografie reutilizat.", 409);
    return ok(request, { file: old.data() });
  }
  const path = `clients/${clientId}/locations/${locationId}/equipment/${equipmentId}/photo-${fileId}.${jpg ? "jpg" : png ? "png" : "webp"}`,
    object = bucket().file(path),
    downloadToken = randomUUID();
  try {
    await object.save(data, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: type,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          crmHash: hash,
        },
      },
    });
  } catch (e: any) {
    if (Number(e.code) !== 412) throw e;
    const [meta] = await object.getMetadata();
    if (meta.metadata?.crmHash !== hash)
      throw new CrmError(
        "Fotografie diferită pentru același identificator.",
        409,
      );
  }
  const [metadata] = await object.getMetadata();
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${metadata.metadata?.firebaseStorageDownloadTokens}`;
  const value = {
    clientId,
    locationId,
    equipmentId,
    fileId,
    path,
    url,
    hash,
    uid,
  };
  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(r);
    if (existing.exists) {
      const prior = existing.data()!;
      if (
        prior.hash !== hash ||
        prior.clientId !== clientId ||
        prior.locationId !== locationId ||
        prior.equipmentId !== equipmentId
      )
        throw new CrmError("Identificator fotografie reutilizat.", 409);
    } else tx.create(r, value);
  });
  return ok(request, { file: value });
}
