import { adminDb } from "@/lib/firebase/admin";
import { mobileIdentity, mobileAccess } from "@/lib/technician/http";
import { notificationService } from "./service";
import type { NextRequest } from "next/server";
export const notifications = notificationService(adminDb);
export async function notificationActor(request: NextRequest) {
  const actor = await mobileIdentity(request);
  await mobileAccess.requireAccess(actor.uid, false);
  return actor;
}

import { NextResponse } from "next/server";
import { headers } from "@/lib/technician/http";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
export function notificationResponse(request: NextRequest, result: object) {
  return NextResponse.json({ contractVersion: FOM_CONTRACT_VERSION, ...result }, { headers: headers(request) });
}
