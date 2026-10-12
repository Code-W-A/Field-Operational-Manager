import { NextRequest } from "next/server";
import { notifications, notificationResponse } from "@/lib/notifications/http";
import { failure, options } from "@/lib/technician/http";
import { TechnicianError } from "@/lib/technician/service";
export const runtime = "nodejs";
export const OPTIONS = options;
/** Logout-only installation capability; registration and inbox APIs require auth. */
export async function POST(request: NextRequest) {
  try {
    if (
      process.env.FOM_MOBILE_ENABLED !== "true" &&
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true"
    )
      throw new TechnicianError("Accesul mobil nu este activat.", 503);
    return notificationResponse(
      request,
      await notifications.revokeWithProof(await request.json()),
    );
  } catch (error) {
    return failure(request, error);
  }
}
