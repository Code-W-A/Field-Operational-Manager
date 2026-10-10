import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import { mobileActor, headers, options } from "@/lib/technician/http";
import { trackingService, TrackingError } from "./service";
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
    const actor = await mobileActor(request);
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
