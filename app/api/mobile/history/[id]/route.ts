import { NextRequest, NextResponse } from "next/server";
import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import {
  mobileActor,
  service,
  headers,
  failure,
  options,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await mobileActor(request);
    const { id } = await context.params;
    const work = await service.historyDetail(
      actor.uid,
      id,
      request.nextUrl.searchParams.get("code") || "",
    );
    return NextResponse.json(
      { contractVersion: FOM_CONTRACT_VERSION, work },
      { headers: headers(request) },
    );
  } catch (error) {
    return failure(request, error);
  }
}
