import { NextRequest, NextResponse } from "next/server";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import {
  mobileIdentity,
  mobileAccess,
  headers,
  failure,
  options,
} from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(request: NextRequest) {
  try {
    const a = await mobileIdentity(request);
    return NextResponse.json(
      {
        contractVersion: FOM_CONTRACT_VERSION,
        access: await mobileAccess.status(a.uid),
      },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const a = await mobileIdentity(request);
    return NextResponse.json(
      {
        contractVersion: FOM_CONTRACT_VERSION,
        access: await mobileAccess.accept(a.uid, await request.json()),
      },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}
