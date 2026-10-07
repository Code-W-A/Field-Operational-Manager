import { installationService } from "@/lib/installations/service";
import { NextRequest, NextResponse } from "next/server";
import {
  mobileActor,
  service,
  headers,
  failure,
  options,
} from "@/lib/mobile/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(request: NextRequest) {
  try {
    const a = await mobileActor(request);
    const code = request.nextUrl.searchParams.get("code");
    const workId = request.nextUrl.searchParams.get("installation");
    if (workId)
      return NextResponse.json(
        await installationService(
          (await import("@/lib/firebase/admin")).adminDb,
        ).list(
          a,
          workId,
          request.nextUrl.searchParams.get("cursor") || undefined,
        ),
        { headers: headers(request) },
      );
    return NextResponse.json(
      {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        bundle: code ? undefined : await service.bundle(a.uid),
        history: code ? await service.history(a.uid, code) : undefined,
      },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}
