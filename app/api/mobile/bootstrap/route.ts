import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import { installationService } from "@/lib/installations/service";
import { NextRequest, NextResponse } from "next/server";
import {
  mobileIdentity,
  mobileAccess,
  service,
  headers,
  failure,
  options,
} from "@/lib/mobile/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(request: NextRequest) {
  try {
    const a = await mobileIdentity(request);
    const access = await mobileAccess.requireAccess(a.uid, false);
    const code = request.nextUrl.searchParams.get("code");
    const workId = request.nextUrl.searchParams.get("installation");
    if (code || workId) await mobileAccess.requireAccess(a.uid);
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
        contractVersion: FOM_CONTRACT_VERSION,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        access,
        bundle: code
          ? undefined
          : access.activeSessionId
            ? await service.bundle(a.uid)
            : await mobileAccess.attendanceBundle(a.uid),
        history: code ? await service.history(a.uid, code) : undefined,
      },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}
