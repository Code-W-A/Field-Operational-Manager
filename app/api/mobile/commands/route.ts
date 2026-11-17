import { commandHandler } from "@/lib/technician/commands-http";
import { mobileIdentity, options, headers, failure } from "@/lib/technician/http";
export const runtime = "nodejs";
// Keep the mobile attendance path near the existing eur3 Firestore database.
export const preferredRegion = "fra1";
export const OPTIONS = options;
export const POST = commandHandler("mobile", mobileIdentity);

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { attendanceReceipt } from "@/lib/technician/command-receipt";
export async function GET(request: NextRequest) {
  try {
    const actor = await mobileIdentity(request);
    const result = await attendanceReceipt(adminDb, actor.uid, request.nextUrl.searchParams.get("mutationId") || "");
    return NextResponse.json(result, { headers: headers(request) });
  } catch (error) { return failure(request, error); }
}
