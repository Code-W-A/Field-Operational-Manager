import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import { mobileIdentity, mobileAccess, headers, options } from "@/lib/technician/http";
import { trackingService, TrackingError } from "./service";
import { writeServerAuditEvent } from "@/lib/reports/audit-writer.server";
export { options };
const service = trackingService(adminDb);
const result = (request: NextRequest, data: unknown) =>
  NextResponse.json(
    { contractVersion: FOM_CONTRACT_VERSION, ...(data as object) },
    { headers: headers(request) },
  );
function failure(request: NextRequest, error: unknown) {
  const status =
    error instanceof TrackingError || error instanceof RequireRoleError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  return NextResponse.json(
    {
      error:
        status < 500
          ? (error as Error).message
          : "Trackingul nu este disponibil momentan.",
      kind: status >= 500 ? "retryable" : "validation",
    },
    { status, headers: headers(request) },
  );
}
export async function ingest(request: NextRequest) {
  try {
    const actor = await mobileIdentity(request);
    // Historical GPS batches are owned and bounded by the tracking service.
    await mobileAccess.requireAccess(actor.uid, false);
    const text = await request.text();
    if (text.length > 64000) throw new TrackingError("Lot GPS prea mare.", 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TrackingError("Lot GPS invalid.");
    }
    return result(request, await service.ingest(actor.uid, body));
  } catch (error) {
    return failure(request, error);
  }
}
export async function live(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer"], request);
    return result(request, { technicians: await service.live(actor.uid) });
  } catch (error) {
    return failure(request, error);
  }
}
export async function history(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer"], request);
    const day = request.nextUrl.searchParams.get("day") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw new TrackingError("Data este invalidă.");
    return result(
      request,
      await service.history(
        actor.uid,
        request.nextUrl.searchParams.get("uid") || "",
        day,
      ),
    );
  } catch (error) {
    return failure(request, error);
  }
}

export async function deleteHistory(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin"], request);
    const body = await request.json().catch(() => null);
    const technician = typeof body?.uid === "string" ? body.uid : "";
    const day = typeof body?.day === "string" ? body.day : "";
    if (!technician || !/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw new TrackingError("Tehnicianul și ziua sunt obligatorii.");

    const { deletedCount } = await service.deleteHistory(
      actor.uid,
      technician,
      day,
    );
    const technicianName = String(
      (await adminDb.doc(`users/${technician}`).get()).data()?.displayName ||
        technician,
    );
    await writeServerAuditEvent({
      actorId: actor.uid,
      module: "Tracking GPS",
      action: "Ștergere istoric GPS",
      entityType: "Tehnician",
      entityId: technician,
      entityLabel: technicianName,
      summary: `Adminul a șters ${deletedCount} puncte GPS pentru ${technicianName}, în ziua ${day}.`,
    });
    return result(request, { deletedCount });
  } catch (error) {
    return failure(request, error);
  }
}
