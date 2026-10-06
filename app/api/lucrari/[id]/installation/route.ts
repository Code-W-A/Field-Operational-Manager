import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { adminDb } from "@/lib/firebase/admin";
import { installationService } from "@/lib/installations/service";
import { installationFailure } from "@/lib/installations/http";
import { check } from "@/lib/installations/validation";

export const runtime = "nodejs";
const service = installationService(adminDb);
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await requireVerifiedRole(
      ["admin", "dispecer", "tehnician"],
      request,
    );
    const { id } = await context.params;
    return NextResponse.json(
      await service.list(
        actor,
        id,
        request.nextUrl.searchParams.get("cursor") || undefined,
        request.nextUrl.searchParams.get("sheetId") || undefined,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return installationFailure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const actor = await requireVerifiedRole(
      ["admin", "dispecer", "tehnician"],
      request,
    );
    const { id } = await context.params;
    const body = await request.json();
    check(JSON.stringify(body).length < 700000, "Datele fișei sunt prea mari.");
    switch (body.action) {
      case "edit":
        return NextResponse.json(await service.edit(actor, id, body.work));
      case "start":
        return NextResponse.json(await service.start(actor, id, body));
      case "save":
        return NextResponse.json(await service.save(actor, id, body));
      case "close":
        return NextResponse.json(await service.save(actor, id, body, true));
      case "stop":
        return NextResponse.json(await service.stop(actor, id, body));
      case "sign":
        return NextResponse.json(await service.sign(actor, id, body));
      case "continue":
        return NextResponse.json(await service.continueWork(actor, id));
      case "complete":
        return NextResponse.json(await service.complete(actor, id, body));
      default:
        return NextResponse.json(
          { error: "Acțiune necunoscută." },
          { status: 400 },
        );
    }
  } catch (error) {
    return installationFailure(error);
  }
}
